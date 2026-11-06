-- Milestone 6, step 5: the alignment signal (FAC-02 and the FAC-03 signal list).
--
-- While a Wayfinding or general input step is live with AI on, the deeper model compares the room's input with the accepted
-- Discover themes and raises private cards: aligned, divergent, silent and thin data. A card shows its evidence (the theme, its
-- strength and sources, and the room's input that triggered it). The facilitator (lead or co-facilitator) can dismiss a card, save
-- an aligned one as a citation for the report, or Ask the room: put a neutral question on the TV, over the live step, until
-- Back to the session. The signal is never on the TV, a phone, the scribe console or a team facilitator's remote.
--
-- The job is a session job in the worker's own contract: ai_claim hands it out when nothing else is due (and ahead of the others
-- when it has waited 30 seconds), ai_apply applies it under limits in code, ai_fail sends its watermark back. One lease per
-- session, so one run at a time. Every run is in private.ai_runs.
--
-- New:
--   private.signals          (step 1's table) gains title, line, ask, ask_sent and on_tv
--   private.ai_sessions      gains phones_down_at and the signal's watermarks
--   public.room_states       gains neutral_question: the one word the TV layer carries, its text
--   private.signal_input, signal_claim, signal_state, signal_act, signal_phones_down, signal_ask_guard, signal_ask_cleared
--   public.signal_state, public.signal_act (security invoker wrappers; every check is in the private functions)
--
-- Shared objects touched, each a superset of its latest definition:
--   private.ai_runs ai_runs_job_check   step 3's list (20261106030000) plus alignment_signal
--   private.live_public_state           the qa version (20261103070000) plus state.neutral_question, only while one is up
--   private.ai_claim                    step 2's wrapper (20261106020000), renamed ai_claim_pre_signal, plus the signal's claim
--   private.ai_apply                    step 2's wrapper, renamed ai_apply_pre_signal, plus the signal's apply
--   private.ai_fail                     step 2's wrapper, renamed ai_fail_pre_signal, plus the signal's failure
--   private.ai_status                   step 2's wrapper, renamed ai_status_pre_signal; the signal's own run never reads as AI being slow
--   private.reset_practice_room         step 2's wrapper (20261106020000) replaced in place, plus the signal's records (not renamed: an earlier test reads the base chain)
--   private.rehearsal_control           step 2's wrapper, renamed rehearsal_control_pre_signal, plus Clear test answers for signals
-- Not touched, on purpose: ai_on (the signal runs where AI is already on) and ai_due (it already hands the live step to the worker;
-- the 3-second status poll asks again, which is how the 45 second rule is kept with nobody answering).
begin;

-- ---------- The AI job check ----------
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists','draft_discover_themes','alignment_signal'));

-- ---------- Records ----------
-- A card: its kind and theme (step 1's columns), the one line and title the model wrote, the neutral question it suggests, the
-- question as it was sent, and whether that question is on the TV now. The evidence is worked out in code, never taken from the model.
alter table private.signals
 add column title text not null default '' check(length(title)<=160),
 add column line text not null default '' check(length(line)<=500),
 add column ask text check(ask is null or length(ask)<=300),
 add column ask_sent text check(ask_sent is null or length(ask_sent)<=300),
 add column on_tv boolean not null default false;

-- Per step: when phones first went down, and the signal's own watermarks (its last claim, the input it has seen, whether it has
-- read the room with phones down, and its last failure). They never touch the live jobs' watermarks or AI timing.
alter table private.ai_sessions
 add column phones_down_at timestamptz,
 add column signal_at timestamptz,
 add column signal_seen_at timestamptz,
 add column signal_seen_ids uuid[] not null default array[]::uuid[],
 add column signal_phones_seen boolean not null default false,
 add column signal_failed_at timestamptz;

-- The TV's neutral question: its text and nothing else. No theme, count, signal kind or AI line is ever stored beside it.
alter table public.room_states add column neutral_question text check(neutral_question is null or length(btrim(neutral_question)) between 1 and 200);

-- ---------- Phones first going down ----------
-- A step's first time with phones down (a press, or a burst ending) is kept, so silent themes are held until then.
create function private.signal_phones_down() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state='phones_down' and old.state is distinct from 'phones_down' then
  insert into private.ai_sessions(session_id,engagement_id,phones_down_at) values(new.id,new.engagement_id,clock_timestamp())
   on conflict(session_id) do update set phones_down_at=coalesce(private.ai_sessions.phones_down_at,excluded.phones_down_at);
 end if;
 return new;
end $$;
create trigger signal_phones_down after update of state on public.sessions for each row execute function private.signal_phones_down();

-- ---------- The neutral question leaves with the step ----------
-- It is a layer over the live step. When the room moves to another step, or off a step screen, the layer goes with it and no card is on the TV.
create function private.signal_ask_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.neutral_question is not null and new.neutral_question is not distinct from old.neutral_question
   and (new.live_session_id is distinct from old.live_session_id or new.tv_content is distinct from 'session') then
  new.neutral_question:=null;
 end if;
 return new;
end $$;
create trigger signal_ask_guard before update on public.room_states for each row execute function private.signal_ask_guard();

create function private.signal_ask_cleared() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.signals set on_tv=false where engagement_id=new.engagement_id and on_tv;
 return new;
end $$;
create trigger signal_ask_cleared after update of neutral_question on public.room_states for each row
 when (old.neutral_question is not null and new.neutral_question is null) execute function private.signal_ask_cleared();

-- ---------- The TV's payload ----------
-- The qa version (20261103070000) with every field and rule kept. The only addition is state.neutral_question, present only while a
-- question is up. It is the question's text: no theme, count, signal kind or AI line is in the payload because none is stored with it.
create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'spotlight_key',r.spotlight_key,'hidden_ids',r.hidden_ids,'hidden_keys',r.hidden_keys,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version)
  ||case when r.neutral_question is not null then jsonb_build_object('neutral_question',r.neutral_question) else '{}'::jsonb end,'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'options',private.public_options(s,e.settings),'kind',private.kind_public(s.interaction),
 'settings',jsonb_build_object('anonymous',s.settings->'anonymous','burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end,
 'qa',private.qa_public(p_engagement))||private.tv_room_info(p_engagement)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;

-- ---------- What the model reads ----------
-- The room's input to one step, in the words it was written: answers and scribe cards, never who wrote them. Hidden, withdrawn
-- and deleted answers are not input. Rehearsal (test) answers are, so the signal can be practised.
create function private.signal_input(p_session uuid) returns table(id uuid,kind text,body text,at timestamptz)
language sql stable security definer set search_path='' as $$
 select x.id,'answer'::text,x.text,coalesce(x.server_received_at,x.created_at) from public.submissions x
  where x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden
 union all
 select c.id,'card'::text,c.text,c.received_at from private.scribe_cards c where c.session_id=p_session and not c.deleted
$$;

-- ---------- The claim ----------
-- Due after 8 new inputs, or 45 seconds after the first new input, whichever comes first; and once when phones first go down, so
-- silent themes get their turn. At most one run a session at a time (the session's lease), never closer than 10 seconds apart, and
-- nothing at all until a theme is accepted. A failed run waits 30 seconds, then reads all the input again.
create function private.signal_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; r public.room_states; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_model text; n_new integer; oldest timestamptz; v_phones boolean;
 v_themes jsonb; v_room jsonb; v_raised jsonb; v_inputs jsonb; v_run uuid; v_base integer;
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
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.signal_failed_at is not null and a.signal_failed_at>t-interval '30 seconds' and a.signal_seen_at is null then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.signal_failed_at+interval '30 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 -- The worker calls the deeper model and names it when it hands the reply back (apply and fail record it); until then the run carries the model it was claimed with.
 v_model:=p_model;
 -- Up to 40 accepted themes, strong ones first, each with at most two of the room's own quotes.
 select coalesce(jsonb_agg(jsonb_build_object('ref','t'||z.ord,'id',z.theme_id,'source',z.source,'label',z.label,'detail',left(z.detail,300),'rests_on',z.rests_on,'out_of',z.out_of,'thin',z.thin,'strong',z.strong,
   'quotes',(select coalesce(jsonb_agg(left(q->>'quote',200)),'[]'::jsonb) from (select q from jsonb_array_elements(z.quotes) q limit 2) w)) order by z.ord),'[]'::jsonb) into v_themes
  from (select th.*,row_number() over(order by th.strong desc,(th.source='survey') desc,th.rests_on desc,th.theme_id) as ord from private.discover_accepted_themes(s.engagement_id) th limit 40) z;
 if jsonb_array_length(v_themes)=0 then return jsonb_build_object('status','idle'); end if;
 -- The newest 120 inputs, numbered oldest first. "new" marks what no earlier run of this step has read.
 select coalesce(jsonb_agg(jsonb_build_object('ref','r'||z.ord,'id',z.id,'kind',z.kind,'text',left(z.body,400),'new',a.signal_seen_at is null or not z.id=any(a.signal_seen_ids)) order by z.ord),'[]'::jsonb) into v_room
  from (select i.*,row_number() over(order by i.at,i.id) as ord from (select * from private.signal_input(s.id) order by at desc,id limit 120) i) z;
 -- Cards already on the panel, so the model does not raise them again; a dismissed one is never raised again, and code enforces it too.
 select coalesce(jsonb_agg(jsonb_build_object('kind',g.kind,'theme',(select x->>'ref' from jsonb_array_elements(v_themes) x where x->>'id'=g.theme_id::text limit 1),'dismissed',g.dismissed_at is not null) order by g.seq),'[]'::jsonb) into v_raised
  from private.signals g where g.session_id=s.id and not g.deleted;
 select e.base_year into v_base from public.engagements e where e.id=s.engagement_id;
 v_inputs:=jsonb_build_object('session',jsonb_build_object('title',s.title,'prompt',private.fill_years(s.prompt,v_base),'kind',s.interaction),'phones_down',v_phones,'themes',v_themes,'room',v_room,'raised',v_raised);
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'alignment_signal',v_model,p_versions->>'alignment_signal',v_inputs,t) returning id into v_run;
 update private.ai_sessions set signal_at=t,signal_seen_at=t,signal_seen_ids=array(select i.id from private.signal_input(s.id) i order by i.id),signal_phones_seen=v_phones,
   lease_id=p_lease,lease_run=v_run,lease_until=t+interval '75 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','alignment_signal','prompt_version',p_versions->>'alignment_signal','inputs',v_inputs);
end $$;

alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_pre_signal;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_pre_signal;
alter function private.ai_fail(uuid,uuid,text,jsonb) rename to ai_fail_pre_signal;
alter function private.ai_status(uuid,uuid) rename to ai_status_pre_signal;

-- The worker's claim. A signal that has waited 30 seconds goes first, so a steady stream of answers cannot starve it; otherwise the live
-- jobs go first and the signal takes the idle moment after them. Anything but "idle" from the live jobs (busy, cooling, off, wait) is theirs.
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; sc jsonb; a private.ai_sessions; waited boolean;
begin
 if p_session is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return private.ai_claim_pre_signal(p_session,p_lease,p_model,p_versions); end if;
 select * into a from private.ai_sessions where session_id=p_session;
 waited:=a.session_id is not null and a.signal_at is not null and a.signal_at<clock_timestamp()-interval '30 seconds';
 if waited then
  sc:=private.signal_claim(p_session,p_lease,p_model,p_versions);
  if sc->>'status' in ('claimed','busy') then return sc; end if;
 end if;
 out:=private.ai_claim_pre_signal(p_session,p_lease,p_model,p_versions);
 if out->>'status'<>'idle' or waited then return out; end if;
 sc:=private.signal_claim(p_session,p_lease,p_model,p_versions);
 return case when sc->>'status' in ('claimed','busy','cooling') then sc else out end;
end $$;

-- ---------- The apply ----------
-- What a card may be is code, not prompt: a theme still accepted, the room inputs it names, aligned and silent only on a strong theme,
-- thin only on a thin one, silent only once phones have been down, no name from the room, nothing the word filter refuses, no quote, and nothing in the
-- tone of a correction. Counts and strengths are worked out here from the sources; the model never writes one. A card for a kind and theme
-- already in the step is replaced in place; one the facilitator dismissed stays dismissed. The run is logged with changed false, so Undo last AI
-- change never lands on it, and it leaves the live jobs' timing alone.
create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; s public.sessions; t timestamptz:=clock_timestamp(); v_ms integer; v_phones boolean;
 themes jsonb; room jsonb; acc jsonb; names text[]; c jsonb; reason text; th jsonb; at_ jsonb; refs text[]; v_kind text; v_title text; v_line text; v_ask text; v_theme uuid;
 n_a integer; n_c integer; v_unit text; samples jsonb; also jsonb; ex private.signals; applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; touched uuid[]:=array[]::uuid[]; seen text[]:=array[]::text[];
 v_live integer; v_changed boolean:=false; v_ev jsonb; v_id uuid; v_complete boolean;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'alignment_signal' then return private.ai_apply_pre_signal(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 -- The room row first, as every writer takes it, then the session's lease.
 perform 1 from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null where session_id=run.session_id;
 if not private.ai_on(run.session_id) or s.deleted then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  return jsonb_build_object('status','discarded');
 end if;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 v_complete:=jsonb_typeof(p_output->'cards')='array' and coalesce((p_output->>'complete')::boolean,true);
 v_phones:=a.phones_down_at is not null or s.state='phones_down';
 select coalesce(jsonb_object_agg(x->>'ref',x),'{}'::jsonb) into themes from jsonb_array_elements(case when jsonb_typeof(run.inputs->'themes')='array' then run.inputs->'themes' else '[]'::jsonb end) x;
 select coalesce(jsonb_object_agg(x->>'ref',x),'{}'::jsonb) into room from jsonb_array_elements(case when jsonb_typeof(run.inputs->'room')='array' then run.inputs->'room' else '[]'::jsonb end) x;
 -- The themes as they stand now: a theme the facilitator has since rejected or merged away no longer counts.
 select coalesce(jsonb_object_agg(q.theme_id::text,to_jsonb(q)),'{}'::jsonb) into acc from private.discover_accepted_themes(run.engagement_id) q;
 names:=private.discover_names(run.engagement_id);
 v_unit:=case s.interaction when 'lens' then 'sentence' when 'qa' then 'question' else 'answer' end;
 select count(*) into v_live from private.signals where session_id=run.session_id and not deleted and dismissed_at is null;
 for c in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'cards')='array' then p_output->'cards' else '[]'::jsonb end) v limit 30 loop
  reason:=null; v_kind:=c->>'kind'; th:=themes->(c->>'theme'); v_theme:=null; ex:=null;
  v_title:=nullif(btrim(regexp_replace(coalesce(c->>'title',''),'\s+',' ','g')),''); v_line:=nullif(btrim(regexp_replace(coalesce(c->>'line',''),'\s+',' ','g')),''); v_ask:=nullif(btrim(regexp_replace(coalesce(c->>'ask',''),'\s+',' ','g')),'');
  refs:=array(select distinct x2 from jsonb_array_elements_text(case when jsonb_typeof(c->'room')='array' then c->'room' else '[]'::jsonb end) x2 where room ? x2);
  if jsonb_typeof(c) is distinct from 'object' or v_kind is null or v_kind not in ('aligned','divergent','silent','thin') or th is null then reason:='unknown';
  else
   v_theme:=(th->>'id')::uuid; at_:=acc->(th->>'id');
   if at_ is null then reason:='not_accepted';
   elsif v_kind||':'||v_theme::text=any(seen) then reason:='duplicate';
   elsif v_title is null or v_line is null or length(v_title)>120 or length(v_line)>400 then reason:='text';
   elsif private.ai_quoted(v_title) or private.ai_quoted(v_line) then reason:='quote';
   elsif private.screen_text(v_title||' '||v_line||' '||coalesce(v_ask,'')) then reason:='filtered';
   elsif private.discover_has_name(v_title||' '||v_line||' '||coalesce(v_ask,''),names) then reason:='name';
   elsif (v_title||' '||v_line) ~* '\m(wrong|incorrect|mistake|mistakes|mistaken|bad idea|should|must|ought|contradict|contradicts|contradicting|ignore|ignores|ignoring|misguided|off track|off-track)\M' then reason:='tone';
   elsif v_kind in ('aligned','divergent','thin') and cardinality(refs)=0 then reason:='no_input';
   elsif v_kind='silent' and cardinality(refs)>0 then reason:='raised';
   elsif v_kind in ('aligned','silent') and not (at_->>'strong')::boolean then reason:='not_strong';
   elsif v_kind='thin' and not (at_->>'thin')::boolean then reason:='not_thin';
   elsif v_kind='silent' and not v_phones then reason:='phones_up';
   end if;
   if reason is null then
    select * into ex from private.signals where session_id=run.session_id and kind=v_kind and theme_id=v_theme and not deleted;
    if ex.id is not null and ex.dismissed_at is not null then reason:='dismissed';
    elsif ex.id is null and v_live>=12 then reason:='full'; end if;
   end if;
  end if;
  if reason is not null then refused:=refused||jsonb_build_array(jsonb_build_object('card',c,'reason',reason)); continue; end if;
  seen:=seen||(v_kind||':'||v_theme::text);
  -- The evidence is read from the run's own inputs and the themes as they stand, never from the model's words.
  select count(*) filter (where room->x2->>'kind'='answer'),count(*) filter (where room->x2->>'kind'='card') into n_a,n_c from unnest(refs) x2;
  select coalesce(jsonb_agg(room->x2->>'text'),'[]'::jsonb) into samples from (select x2 from unnest(refs) x2 order by (substring(x2 from 2))::integer desc limit 3) z;
  select coalesce(jsonb_agg(jsonb_build_object('id',acc->(th2->>'id')->>'theme_id','label',acc->(th2->>'id')->>'label','source',acc->(th2->>'id')->>'source','rests_on',(acc->(th2->>'id')->>'rests_on')::integer,'out_of',(acc->(th2->>'id')->>'out_of')::integer)),'[]'::jsonb) into also
   from (select themes->x2 as th2 from (select distinct x2 from jsonb_array_elements_text(case when jsonb_typeof(c->'also')='array' then c->'also' else '[]'::jsonb end) x2 where themes ? x2 and x2<>c->>'theme' limit 2) y) w where acc ? (th2->>'id');
  v_ev:=jsonb_build_object('theme',jsonb_build_object('id',v_theme,'label',at_->>'label','detail',at_->>'detail','source',at_->>'source','rests_on',(at_->>'rests_on')::integer,'out_of',(at_->>'out_of')::integer,
     'thin',(at_->>'thin')::boolean,'strong',(at_->>'strong')::boolean,'quotes',(select coalesce(jsonb_agg(left(q->>'quote',200)),'[]'::jsonb) from (select q from jsonb_array_elements(at_->'quotes') q limit 2) w2)),
    'also',also,'room',jsonb_build_object('answers',n_a,'cards',n_c,'unit',v_unit,'samples',samples,'ids',(select coalesce(jsonb_agg(room->x2->>'id'),'[]'::jsonb) from unnest(refs) x2)),
    'phones_down',v_phones,'run',run.id,'at',t);
  -- A question that names the theme, quotes a figure or says what the signal is cannot go to the TV, so it is not offered.
  if v_ask is not null and (length(v_ask)>200 or private.ai_quoted(v_ask) or v_ask !~ '\?\s*$' or not private.signal_neutral(v_ask,at_->>'label')) then v_ask:=null; end if;
  if ex.id is null then
   insert into private.signals(engagement_id,session_id,kind,theme_id,title,line,ask,evidence,ai_run) values(run.engagement_id,run.session_id,v_kind,v_theme,v_title,v_line,v_ask,v_ev,run.id) returning id into v_id;
   v_live:=v_live+1; v_changed:=true; applied:=applied||jsonb_build_array(jsonb_build_object('card',v_id,'kind',v_kind,'new',true));
  else
   v_id:=ex.id;
   if (ex.title,ex.line,ex.ask,ex.evidence-'run'-'at') is distinct from (v_title,v_line,v_ask,v_ev-'run'-'at') then
    update private.signals set title=v_title,line=v_line,ask=v_ask,evidence=v_ev,ai_run=run.id where id=ex.id; v_changed:=true;
    applied:=applied||jsonb_build_array(jsonb_build_object('card',v_id,'kind',v_kind,'new',false));
   end if;
  end if;
  touched:=touched||v_id;
 end loop;
 -- A silent card the room has since answered is retired: this run read every theme with phones down and did not raise it again.
 if v_complete and v_phones then
  update private.signals set deleted=true where session_id=run.session_id and kind='silent' and not deleted and dismissed_at is null and not id=any(touched);
  if found then v_changed:=true; end if;
 end if;
 update private.ai_runs set status='ok',changed=false,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused,'cards_changed',v_changed),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000),model=case when coalesce(p_usage->>'model','') ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' then p_usage->>'model' else model end where id=run.id;
 update private.ai_sessions set signal_failed_at=null where session_id=run.session_id;
 -- A private notice, so the control surface and the facilitator's own remote update in the same moment. Nothing public changes: no room version.
 if v_changed then perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','signal','session',run.session_id)); end if;
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- A neutral question carries no data and does not name the signal: not the theme, not a share or count of it, not the words that name a signal.
create function private.signal_neutral(p_text text,p_label text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select p_text is not null and length(btrim(p_text)) between 1 and 200
  and (length(btrim(coalesce(p_label,'')))<4 or position(lower(btrim(p_label)) in lower(p_text))=0)
  and p_text !~* '\m(signal|signals|aligned|divergent|silent|thin data|alignment)\M'
  and p_text !~* '[0-9]+\s*(%|percent|per cent|of\s+[0-9]+|out of)'
  and p_text !~* '\m(survey|interviews?|discover)\M'
$$;

-- ---------- The failure ----------
-- A failed call sends the signal's watermark back, so the same input is read again after its own 30 second pause. The live jobs' timing is not touched.
create function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_ms integer;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'alignment_signal' then return private.ai_fail_pre_signal(p_run,p_lease,p_error,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
  output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000),
  model=case when coalesce(p_usage->>'model','') ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$' then p_usage->>'model' else model end where id=run.id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,signal_failed_at=t,signal_seen_at=null,signal_phones_seen=false where session_id=run.session_id;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The AI panel ----------
-- The signal's own run is never "AI is slow": a deeper model takes longer than a live fold, and its time is not the live jobs'. While it runs the
-- panel reads as if nothing were running, as the live jobs' own times and failures are untouched.
create function private.ai_status(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb; a private.ai_sessions; sid uuid; t timestamptz:=clock_timestamp();
begin
 out:=private.ai_status_pre_signal(p_engagement,p_session);
 if out->>'status' is distinct from 'ok' or out->'state'->>'job' is distinct from 'alignment_signal' then return out; end if;
 sid:=(out->'session'->>'id')::uuid;
 select * into a from private.ai_sessions where session_id=sid and not deleted;
 return jsonb_set(out,'{state}',(out->'state')||jsonb_build_object('running',false,'job',null,'running_ms',null,'slow',coalesce(a.last_ms,0)>6000 and a.last_ok_at>t-interval '2 minutes'));
end $$;

-- ---------- The facilitator's reads and presses ----------
-- The cards of the live step (or the step asked for), with their evidence, the neutral question on the TV, and what the panel says when there are none.
-- Lead, co-facilitator and Clearway admin only (private.show_allowed): a participant, the scribe, a team facilitator, a TV and an unsigned browser get nothing.
create function private.signal_state(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; e public.engagements; a private.ai_sessions; t timestamptz:=clock_timestamp(); v_accepted integer; v_held integer; v_phones boolean; v_team text; cards jsonb; v_on jsonb;
begin
 if p_engagement is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into e from public.engagements where id=p_engagement and not deleted;
 if r.engagement_id is null or e.id is null then return jsonb_build_object('status','missing'); end if;
 if p_session is not null then select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted; end if;
 if s.id is null then select * into s from public.sessions where id=r.live_session_id and engagement_id=p_engagement and not deleted; end if;
 select count(*),count(*) filter (where private.discover_is_strong(th.source,th.rests_on,th.out_of)) into v_accepted,v_held from private.discover_themes th
  where th.engagement_id=p_engagement and th.status='accepted' and th.merged_into is null and not th.deleted;
 if s.id is not null then select * into a from private.ai_sessions where session_id=s.id and not deleted; end if;
 v_phones:=s.id is not null and (a.phones_down_at is not null or s.state='phones_down');
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'kind',g.kind,'theme_id',g.theme_id,'title',g.title,'line',g.line,'ask',g.ask,'evidence',g.evidence-'run','saved',g.saved_as_citation_at is not null,'on_tv',g.on_tv,'at',g.created_at,'updated',g.updated_at) order by g.seq desc),'[]'::jsonb) into cards
  from private.signals g where s.id is not null and g.engagement_id=p_engagement and g.session_id=s.id and not g.deleted and g.dismissed_at is null;
 if r.neutral_question is not null then
  v_on:=jsonb_build_object('text',r.neutral_question,'signal',(select g.id from private.signals g where g.engagement_id=p_engagement and g.on_tv and not g.deleted order by g.neutral_question_sent_at desc nulls last limit 1));
 end if;
 select split_part(btrim(x.name),' ',1) into v_team from public.attendees x where x.id=r.remote_holder_id and x.engagement_id=p_engagement;
 return jsonb_build_object('status','ok','version',r.version,'engagement_ai',coalesce(e.settings->>'ai_enabled','false')='true',
  'session',case when s.id is not null then jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'live',s.id=r.live_session_id,'state',s.state,
    'eligible',s.interaction in ('word_cloud','wall','lens','qa'),'ai',private.ai_on(s.id)) end,
  'themes',v_accepted,'strong',v_held,'phones_down',v_phones,
  -- Silent themes wait until phones first go down: the strong themes no card has taken yet.
  'held',case when s.id is null or v_phones or s.interaction not in ('word_cloud','wall','lens','qa') then 0 else greatest(0,v_held-(select count(distinct g.theme_id) from private.signals g where g.session_id=s.id and not g.deleted and g.dismissed_at is null and g.kind in ('aligned','divergent'))::integer) end,
  'ask',v_on,'team',v_team,'signals',cards,
  'state',jsonb_build_object('running',a.lease_run is not null and a.lease_until>t and exists(select 1 from private.ai_runs x where x.id=a.lease_run and x.job='alignment_signal'),
    'catching_up',a.signal_failed_at is not null and a.signal_seen_at is null,'last_at',a.signal_at));
end $$;

-- Dismiss, Save as a citation (aligned cards only), Ask the room (the neutral question on the TV over the live step) and Back to the session.
create function private.signal_act(p_engagement uuid,p_id uuid,p_signal uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; me uuid:=private.clearway_user_id(); sg private.signals; done private.room_controls; t timestamptz:=clock_timestamp(); logged text; who text; v_text text; v_version bigint;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if r.engagement_id is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('dismiss','save_citation','ask','back') or jsonb_typeof(coalesce(p,'{}'::jsonb)) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 p:=coalesce(p,'{}'::jsonb);
 logged:=case p_action when 'dismiss' then 'dismiss_signal' when 'save_citation' then 'save_signal_citation' when 'ask' then 'ask_the_room' else 'back_to_session' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>logged then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if p_action<>'back' then
  if p_signal is null then return jsonb_build_object('status','invalid_request'); end if;
  select * into sg from private.signals where id=p_signal and engagement_id=p_engagement and not deleted for update;
  if sg.id is null then return jsonb_build_object('status','missing'); end if;
 end if;
 if p_action='dismiss' then
  if sg.dismissed_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.signals set dismissed_at=t where id=sg.id;
 elsif p_action='save_citation' then
  if sg.kind<>'aligned' then return jsonb_build_object('status','invalid_state'); end if;
  if sg.dismissed_at is not null then return jsonb_build_object('status','invalid_state'); end if;
  if sg.saved_as_citation_at is not null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.signals set saved_as_citation_at=t where id=sg.id;
 elsif p_action='ask' then
  -- The facilitator's edit if there is one, else the suggestion as it stands. Whatever goes up passes the word filter and the neutral check.
  v_text:=nullif(btrim(regexp_replace(coalesce(p->>'text',sg.ask,''),'\s+',' ','g')),'');
  if v_text is null or length(v_text)>200 then return jsonb_build_object('status','invalid_request'); end if;
  if private.screen_text(v_text) then return jsonb_build_object('status','filtered'); end if;
  if not private.signal_neutral(v_text,sg.evidence->'theme'->>'label') then return jsonb_build_object('status','names_signal'); end if;
  if r.live_session_id is distinct from sg.session_id or r.tv_content<>'session' then return jsonb_build_object('status','invalid_state'); end if;
  update public.room_states set neutral_question=v_text where engagement_id=p_engagement;
  update private.signals set on_tv=(id=sg.id),neutral_question_sent_at=case when id=sg.id then t else neutral_question_sent_at end,ask_sent=case when id=sg.id then v_text else ask_sent end
   where engagement_id=p_engagement and (on_tv or id=sg.id);
 else
  if r.neutral_question is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update public.room_states set neutral_question=null where engagement_id=p_engagement;
 end if;
 select version into v_version from public.room_states where engagement_id=p_engagement;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,r.live_session_id,v_version,t);
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',v_version,'changed',true));
 return jsonb_build_object('status','ok','version',v_version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

create function public.signal_state(p_engagement uuid,p_session uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.signal_state(p_engagement,p_session) $$;
create function public.signal_act(p_engagement uuid,p_id uuid,p_signal uuid,p_action text,p jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.signal_act(p_engagement,p_id,p_signal,p_action,p) $$;

-- ---------- The practice room and the rehearsal ----------
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_signal;

-- The practice room's reset also forgets the signal: its cards (the earlier reset already puts every card away), the phones-down record and watermarks
-- of every step, and a neutral question on the TV. Step 2's wrapper over reset_practice_room_base, with the signal's lines added (an earlier test
-- reads that chain, so it is replaced in place and not wrapped again).
create or replace function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_base();
 if ok then
  update private.four_list_agrees set deleted=true where engagement_id=eng and not deleted;
  update private.four_list_folds set deleted=true where engagement_id=eng and not deleted;
  update private.four_list_cards set deleted=true where engagement_id=eng and not deleted;
  update private.signals set deleted=true,on_tv=false where engagement_id=eng and not deleted;
  update private.ai_sessions set phones_down_at=null,signal_at=null,signal_seen_at=null,signal_seen_ids=array[]::uuid[],signal_phones_seen=false,signal_failed_at=null where engagement_id=eng;
  update public.room_states set neutral_question=null where engagement_id=eng and neutral_question is not null;
 end if;
 return ok;
end $$;

-- Clear test answers: signals a rehearsal made are test rows and go with it (the earlier version puts them away); the signal starts clean for the steps the
-- rehearsal touched, so the real session reads its own room, and a neutral question put up in a rehearsal comes down.
create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; touched uuid[]:=array[]::uuid[];
begin
 if p_action='clear' and p_engagement is not null then
  select coalesce(array_agg(distinct x.session_id),array[]::uuid[]) into touched from (
   select session_id from public.submissions where engagement_id=p_engagement and test and not deleted
   union select session_id from private.signals where engagement_id=p_engagement and test and not deleted) x;
 end if;
 out:=private.rehearsal_control_pre_signal(p_engagement,p_id,p_action);
 if p_action='clear' and out->>'status'='ok' then
  update private.signals set deleted=true,on_tv=false where engagement_id=p_engagement and test and not deleted;
  update private.ai_sessions set phones_down_at=null,signal_at=null,signal_seen_at=null,signal_seen_ids=array[]::uuid[],signal_phones_seen=false,signal_failed_at=null
   where engagement_id=p_engagement and session_id=any(touched);
  update public.room_states set neutral_question=null where engagement_id=p_engagement and neutral_question is not null;
 end if;
 return out;
end $$;

-- ---------- Grants ----------
revoke all on function private.signal_phones_down(),private.signal_ask_guard(),private.signal_ask_cleared(),private.signal_input(uuid),private.signal_claim(uuid,uuid,text,jsonb),
 private.signal_neutral(text,text),private.signal_state(uuid,uuid),private.signal_act(uuid,uuid,uuid,text,jsonb),
 private.ai_claim_pre_signal(uuid,uuid,text,jsonb),private.ai_apply_pre_signal(uuid,uuid,jsonb,jsonb),private.ai_fail_pre_signal(uuid,uuid,text,jsonb),private.ai_status_pre_signal(uuid,uuid),
 private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),private.ai_status(uuid,uuid),
 private.reset_practice_room(),private.rehearsal_control_pre_signal(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text),
 public.signal_state(uuid,uuid),public.signal_act(uuid,uuid,uuid,text,jsonb)
 from public,anon,authenticated;
-- The control surface and the remote call these as the signed-in facilitator; the checks are inside.
grant execute on function private.signal_state(uuid,uuid),private.signal_act(uuid,uuid,uuid,text,jsonb),private.ai_status(uuid,uuid),private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text),
 public.signal_state(uuid,uuid),public.signal_act(uuid,uuid,uuid,text,jsonb) to authenticated;
-- The worker's claim, apply and fail keep their grants (service role); the renamed earlier versions are for the new ones.
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),
 private.ai_claim_pre_signal(uuid,uuid,text,jsonb),private.ai_apply_pre_signal(uuid,uuid,jsonb,jsonb),private.ai_fail_pre_signal(uuid,uuid,text,jsonb) to service_role;
commit;
