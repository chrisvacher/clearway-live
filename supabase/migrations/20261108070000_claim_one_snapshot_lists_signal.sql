-- The Four Helpful Lists fold and the alignment signal read their seen set in the same snapshot as the run's inputs (fix after Milestone 7).
--
-- Same bug as 20261108060000_ai_claim_one_snapshot, in two more claims. Each built the run's inputs in one statement and wrote the
-- seen ids from a fresh read of the same records in a later statement. Under READ COMMITTED every statement takes a new snapshot,
-- so a card or an input that committed between the two reads was marked seen without ever being in the run's inputs. The model
-- never read it, and the next claim (the one its own trigger asks for) found nothing new and went idle.
-- tests/integration/ai-claim-race.ts commits one card while a claim runs: before this change it stranded the card in 5 and 9 of 150
-- tries (fold and signal); after it, in none.
--
-- Now one statement gives both. The fold reads the seen set (every card, pinned ones too, as before) in the statement that builds
-- the columns. The signal builds its room inputs (the newest 120, numbered oldest first, as before) and its seen set (every input,
-- as before) from one scan of private.signal_input. Both read stable SQL functions, which take the calling statement's snapshot.
--
-- Functions redefined, each with its newest definition word for word apart from the seen-set changes above:
--   private.ai_claim_pre_signal  step 2's fold claim (20261106020000), renamed by 20261106050100 and reached through the ai_claim wrappers
--   private.signal_claim         the signal's claim (20261106050100)
-- Signatures, security definer, search_path and grants are as they were. No table changes; the applies, ai_fail and the wrappers are untouched.
begin;

create or replace function private.ai_claim_pre_signal(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid; v_seen uuid[];
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'four_lists' then return private.ai_claim_base4(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or not (s.state in ('live','phones_down','open') or (s.mode='self_paced' and s.state<>'draft' and private.session_state(s,t)='open')) then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 -- A failed call cools down for ten seconds, so an outage never hammers the API.
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 if a.fold_seen_at is null or exists(select 1 from public.submissions x join private.four_list_cards k on k.submission_id=x.id and not k.deleted
   where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden and not x.id=any(a.fold_seen_ids)) then
  -- The seen set is read in the same statement as the cards, so a card that commits while the claim runs is in neither.
  select jsonb_build_object('columns',coalesce(jsonb_agg(jsonb_build_object('column',z.col,'label',z.label,'cards',z.cards) order by z.ord),'[]'::jsonb)),
   array(select x.id from public.submissions x join private.four_list_cards k on k.submission_id=x.id and not k.deleted
    where x.session_id=s.id and not x.deleted and not x.withdrawn and not x.hidden order by x.id) into v_inputs,v_seen
  from (
   select n.col,array_position(array['right','wrong','missing','confused'],n.col) as ord,
    case n.col when 'right' then 'What''s right?' when 'wrong' then 'What''s wrong?' when 'missing' then 'What''s missing?' else 'What''s confused?' end as label,
    jsonb_agg(jsonb_build_object('ref',left(n.col,1)||n.o,'id',n.id,'text',n.text,'agree',n.agree) order by n.o) as cards
   from (
    select kept.col,kept.id,kept.text,kept.agree,row_number() over(partition by kept.col order by kept.at,kept.id) as o
    from (
     select e->>'column' as col,e->>'id' as id,e->>'text' as text,(e->>'agree')::integer as agree,(e->>'at')::bigint as at,
      row_number() over(partition by e->>'column' order by (e->>'at')::bigint desc,e->>'id') as newest
     from jsonb_array_elements(private.four_lists_board(s.id,false)) e where not coalesce((e->>'pinned')::boolean,false)
    ) kept where kept.newest<=40
   ) n group by n.col having count(*)>=2
  ) z;
  if jsonb_array_length(coalesce(v_inputs->'columns','[]'::jsonb))=0 then v_inputs:=null; end if;
 end if;
 if v_inputs is null then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>'fold_four_lists','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 update private.ai_sessions set fold_seen_at=t,fold_seen_ids=v_seen where session_id=s.id;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'fold_four_lists',p_model,p_versions->>'fold_four_lists',v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','fold_four_lists','prompt_version',p_versions->>'fold_four_lists','inputs',v_inputs);
end $$;

create or replace function private.signal_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; r public.room_states; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_model text; n_new integer; oldest timestamptz; v_phones boolean;
 v_themes jsonb; v_room jsonb; v_raised jsonb; v_inputs jsonb; v_run uuid; v_base integer; v_seen uuid[];
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction not in ('word_cloud','wall','lens','qa') or not private.ai_on(s.id) then return jsonb_build_object('status','idle'); end if;
 select * into r from public.room_states where engagement_id=s.engagement_id and not deleted;
 if r.live_session_id is distinct from s.id or s.state not in ('live','phones_down') then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>'alignment_signal','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','idle'); end if;
 if not exists(select 1 from private.discover_themes where engagement_id=s.engagement_id and status='accepted' and merged_into is null and not deleted) then return jsonb_build_object('status','idle'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 v_phones:=a.phones_down_at is not null or s.state='phones_down';
 if a.signal_at is not null and a.signal_at>t-interval '10 seconds' then return jsonb_build_object('status','idle'); end if;
 select count(*) filter (where a.signal_seen_at is null or not i.id=any(a.signal_seen_ids)),min(i.at) filter (where a.signal_seen_at is null or not i.id=any(a.signal_seen_ids)) into n_new,oldest
  from private.signal_input(s.id) i;
 if not (n_new>=8 or (n_new>=1 and oldest<=t-interval '45 seconds') or (v_phones and not a.signal_phones_seen)) then return jsonb_build_object('status','idle'); end if;
 if a.signal_lease_id is not null and a.signal_lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.signal_failed_at is not null and a.signal_failed_at>t-interval '30 seconds' and a.signal_seen_at is null then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.signal_failed_at+interval '30 seconds'-t)*1000)::integer); end if;
 if a.signal_lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.signal_lease_run and status='running'; end if;
 -- The worker calls the deeper model and names it when it hands the reply back (apply and fail record it); until then the run carries the model it was claimed with.
 v_model:=p_model;
 -- Up to 40 accepted themes, strong ones first, each with at most two of the room's own quotes.
 select coalesce(jsonb_agg(jsonb_build_object('ref','t'||z.ord,'id',z.theme_id,'source',z.source,'label',z.label,'detail',left(z.detail,300),'rests_on',z.rests_on,'out_of',z.out_of,'thin',z.thin,'strong',z.strong,
   'quotes',(select coalesce(jsonb_agg(left(q->>'quote',200)),'[]'::jsonb) from (select q from jsonb_array_elements(z.quotes) q limit 2) w)) order by z.ord),'[]'::jsonb) into v_themes
  from (select th.*,row_number() over(order by th.strong desc,(th.source='survey') desc,th.rests_on desc,th.theme_id) as ord from private.discover_accepted_themes(s.engagement_id) th limit 40) z;
 if jsonb_array_length(v_themes)=0 then return jsonb_build_object('status','idle'); end if;
 -- The newest 120 inputs, numbered oldest first. "new" marks what no earlier run of this step has read. One scan of the inputs gives both
 -- these and the seen set (every input), so an input that commits while the claim runs is in neither and its own trigger finds it new.
 select coalesce(jsonb_agg(jsonb_build_object('ref','r'||z.ord,'id',z.id,'kind',z.kind,'text',left(z.body,400),'new',a.signal_seen_at is null or not z.id=any(a.signal_seen_ids)) order by z.ord) filter (where z.recent),'[]'::jsonb),
   coalesce(array_agg(z.id order by z.id),array[]::uuid[]) into v_room,v_seen
  from (select y.*,y.rn<=120 as recent,row_number() over(partition by y.rn<=120 order by y.at,y.id) as ord
   from (select i.*,row_number() over(order by i.at desc,i.id) as rn from private.signal_input(s.id) i) y) z;
 -- Cards already on the panel, so the model does not raise them again; a dismissed one is never raised again, and code enforces it too.
 select coalesce(jsonb_agg(jsonb_build_object('kind',g.kind,'theme',(select x->>'ref' from jsonb_array_elements(v_themes) x where x->>'id'=g.theme_id::text limit 1),'dismissed',g.dismissed_at is not null) order by g.seq),'[]'::jsonb) into v_raised
  from private.signals g where g.session_id=s.id and not g.deleted;
 select e.base_year into v_base from public.engagements e where e.id=s.engagement_id;
 v_inputs:=jsonb_build_object('session',jsonb_build_object('title',s.title,'prompt',private.fill_years(s.prompt,v_base),'kind',s.interaction),'phones_down',v_phones,'themes',v_themes,'room',v_room,'raised',v_raised);
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'alignment_signal',v_model,p_versions->>'alignment_signal',v_inputs,t) returning id into v_run;
 update private.ai_sessions set signal_at=t,signal_seen_at=t,signal_seen_ids=v_seen,signal_phones_seen=v_phones,
   signal_lease_id=p_lease,signal_lease_run=v_run,signal_lease_until=t+interval '75 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','alignment_signal','prompt_version',p_versions->>'alignment_signal','inputs',v_inputs);
end $$;

commit;
