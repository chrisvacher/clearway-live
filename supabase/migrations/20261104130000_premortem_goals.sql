-- Milestone 4, step 5: the Pre-mortem (D2-07 to D2-09) and the CORE goal builder (D2-10, INT-15).
-- Live only, after merge and Chris's approval. No session is started and no data is seeded.
--
-- Pre-mortem, on the grid kind (preset pre_mortem): the reasons are grid items. A phone adds a
-- reason (private.reason_add), the facilitator adds one too, records mitigations under a reason
-- and undoes the AI's merges (private.reasons_control). Reasons mirror into private.risks
-- (private.reasons_sync) so the CORE goal builder links goals to them: the risk row keeps the
-- session and item key, who added it, and the likelihood and impact the room placed it at.
-- Mitigations are private.risk_mitigations rows, recorded_by facilitator now and scribe later.
--
-- AI merges duplicate reasons (job merge_reasons, prompt merge-reasons@1) under the same limits
-- as every merge: at most four into one, 60 percent left standing, no dropped number, no
-- quote. Each merge is a private.grid_merges row marked made_by 'ai' with its run, so the
-- facilitator's existing Unmerge undoes one and Undo AI merges undoes them all.
--
-- CORE goal builder, the new goals kind: one Vision Outcome at a time, its goals beside its
-- 3-year Vision bullets. Goals live in private.goals (step 1); a phone proposes one through
-- private.goal_propose and the facilitator edits through private.goals_control. The four CORE
-- letters come from private.goal_core, in code. Whether each goal must link a risk is the
-- session's risk_links option: required (two-day template) or later (day-and-a-half).
--
-- Shared functions redefined or wrapped (flagged for review):
--   private.ai_on          also true for a grid session whose preset is pre_mortem
--   private.results_grid   same numbers, plus each item's mitigations (shown under the reason)
--   private.items_grid     same list, plus whether a merge was made by AI
--   private.ai_claim       now a wrapper: a grid session is handled here, every other kind goes
--   private.ai_apply       to the unchanged function, renamed ai_claim_base and ai_apply_base
-- live_submit, ai_fail, grid_control, the merge limits of the other jobs, the lease and undo are untouched.
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('goals','CORE goals',true,true,'people',true,false,'none','never',110);

-- ---------- Columns the pre-mortem and the goals need ----------
alter table private.risks add column session_id uuid;
alter table private.risks add column item_key text check(item_key is null or item_key ~ '^[a-z0-9]{1,24}$');
alter table private.risks add column added_by uuid references public.attendees(id);
alter table private.risks add constraint risks_session_fk foreign key(session_id,engagement_id) references public.sessions(id,engagement_id);
create index risks_session_idx on private.risks(session_id,engagement_id);
create index risks_added_by_idx on private.risks(added_by);
create unique index risks_item_idx on private.risks(session_id,item_key) where not deleted and session_id is not null;

alter table private.goals add column proposed_by uuid references public.attendees(id);
create index goals_proposed_by_idx on private.goals(proposed_by);

alter table private.grid_merges add column made_by text not null default 'facilitator' check(made_by in ('facilitator','ai'));
alter table private.grid_merges add column run_id uuid references private.ai_runs(id);
create index grid_merges_run_idx on private.grid_merges(run_id);

alter table private.ai_sessions add column reasons_seen integer not null default 0 check(reasons_seen>=0);

alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons'));

-- ---------- Switches ----------
create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true'
   and (s.interaction in ('word_cloud','wall','qa') or (s.interaction='grid' and s.options->>'preset'='pre_mortem'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

-- ---------- The grid's numbers, with mitigations ----------
-- As before, and each item also carries the mitigations recorded under it (and under any
-- reason merged into it), so the TV shows them in the legend under the reason.
create or replace function private.results_grid(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with listed as (
  select i->>'key' as key,i->>'text' as text,n::integer as num
  from public.sessions s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.options->'items')='array' then s.options->'items' else '[]'::jsonb end) with ordinality t(i,n)
  where s.id=p_session and s.engagement_id=p_engagement
 ), merges as (
  select item_key,into_key from private.grid_merges where session_id=p_session and engagement_id=p_engagement and not deleted
 ), raw as (
  select x.id,x.attendee_id,p.key as item,(p.value->>0)::float8 as px,(p.value->>1)::float8 as py
  from public.submissions x cross join lateral jsonb_each(case when jsonb_typeof(x.value->'places')='object' then x.value->'places' else '{}'::jsonb end) p
  where x.engagement_id=p_engagement and x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden and jsonb_typeof(p.value)='array'
 ), placed as (
  select raw.id,raw.attendee_id,coalesce(m.into_key,raw.item) as key,avg(raw.px) as px,avg(raw.py) as py
  from raw join listed l on l.key=raw.item left join merges m on m.item_key=raw.item
  where not (raw.item=any(p_hidden)) and not (coalesce(m.into_key,raw.item)=any(p_hidden))
  group by raw.id,raw.attendee_id,coalesce(m.into_key,raw.item)
 ), stats as (
  select key,count(*)::integer as n,avg(px) as mx,avg(py) as my,
   jsonb_agg(jsonb_build_array(left(id::text,8),round(px::numeric,3)::float8,round(py::numeric,3)::float8) order by id) as places
  from placed group by key
 ), mitigated as (
  select rk.item_key as key,m.text,m.created_at,m.id
  from private.risks rk join private.risk_mitigations m on m.risk_id=rk.id and m.engagement_id=rk.engagement_id and not m.deleted
  where rk.session_id=p_session and rk.engagement_id=p_engagement and not rk.deleted
 )
 select jsonb_build_object('total',(select count(*) from placed),'people',(select count(distinct attendee_id) from placed),
  'items',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',l.key,'num',l.num,'text',l.text,'count',coalesce(st.n,0),
    'x',case when st.n>0 and m.into_key is null then round(st.mx::numeric,4)::float8 end,'y',case when st.n>0 and m.into_key is null then round(st.my::numeric,4)::float8 end,
    'places',case when st.n>=2 and m.into_key is null then st.places end,'into',m.into_key,
    'mitigations',(select jsonb_agg(z.text order by z.created_at,z.id) from mitigated z where z.key=l.key or z.key in(select item_key from merges where into_key=l.key)))) order by l.num)
   from listed l left join merges m on m.item_key=l.key left join stats st on st.key=l.key where not (l.key=any(p_hidden))),'[]'::jsonb))
$$;

create or replace function private.items_grid(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with r as (select private.results_grid(s.engagement_id,s.id,array[]::text[]) as res from public.sessions s where s.id=p_session)
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',i->>'key','text',i->>'text','num',(i->>'num')::integer,'count',(i->>'count')::integer,
   'hidden',(i->>'key')=any(p_hidden),'into',i->>'into',
   'by_ai',case when exists(select 1 from private.grid_merges m where m.session_id=p_session and m.item_key=i->>'key' and not m.deleted and m.made_by='ai') then true end)) order by (i->>'num')::integer),'[]'::jsonb)
 from r cross join lateral jsonb_array_elements(r.res->'items') i
$$;

-- ---------- Reasons mirror into risks ----------
-- Idempotent. One risk per reason of a pre-mortem session, with the room's likelihood (x)
-- and impact (y) where people have placed it, and merged_into where reasons are merged. A
-- reason taken out of the session's items is soft-deleted here too.
create function private.reasons_sync(p_engagement uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.sessions; res jsonb;
begin
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='grid' and options->>'preset'='pre_mortem';
 if s.id is null then return; end if;
 res:=private.results_grid(p_engagement,p_session,array[]::text[]);
 insert into private.risks(engagement_id,session_id,item_key,text)
  select p_engagement,p_session,i->>'key',left(i->>'text',200) from jsonb_array_elements(res->'items') i
  where not exists(select 1 from private.risks r where r.session_id=p_session and r.item_key=i->>'key' and not r.deleted);
 update private.risks r set deleted=true,updated_at=now()
  where r.session_id=p_session and r.engagement_id=p_engagement and not r.deleted
   and not exists(select 1 from jsonb_array_elements(res->'items') i where i->>'key'=r.item_key);
 update private.risks r set text=left(i->>'text',200),
   likelihood=case when i ? 'x' then round((i->>'x')::numeric,3) end,impact=case when i ? 'y' then round((i->>'y')::numeric,3) end,updated_at=now()
  from jsonb_array_elements(res->'items') i
  where r.session_id=p_session and r.engagement_id=p_engagement and r.item_key=i->>'key' and not r.deleted
   and (r.text is distinct from left(i->>'text',200)
    or r.likelihood is distinct from case when i ? 'x' then round((i->>'x')::numeric,3) end
    or r.impact is distinct from case when i ? 'y' then round((i->>'y')::numeric,3) end);
 update private.risks r set merged_into=(select t.id from private.risks t where t.session_id=p_session and t.item_key=i->>'into' and not t.deleted),updated_at=now()
  from jsonb_array_elements(res->'items') i
  where r.session_id=p_session and r.engagement_id=p_engagement and r.item_key=i->>'key' and not r.deleted
   and r.merged_into is distinct from (select t.id from private.risks t where t.session_id=p_session and t.item_key=i->>'into' and not t.deleted);
end $$;

create function private.reasons_sync_all(p_engagement uuid) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 for sid in select id from public.sessions where engagement_id=p_engagement and not deleted and interaction='grid' and options->>'preset'='pre_mortem' loop
  perform private.reasons_sync(p_engagement,sid);
 end loop;
end $$;

-- ---------- D2-07 A phone adds a reason ----------
-- The live (or still open) pre-mortem step, the word filter, ten reasons at most, three per
-- person. The id is made on the phone, so a resend is a duplicate. The new reason reaches the
-- TV and every phone in the same version; AI is not in this path.
create function private.reason_add(p_engagement uuid,p_id uuid,p_session uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; who uuid; t text:=btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g')); k text; opts jsonb; items jsonb;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and not deleted and id in(select private.room_attendee_ids());
 if who is null or p_id is null then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted for update;
 if s.id is null or s.interaction<>'grid' or s.options->>'preset' is distinct from 'pre_mortem' then return jsonb_build_object('status','invalid_session'); end if;
 if not ((r.live_session_id=s.id and s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>clock_timestamp())) or (r.live_session_id is distinct from s.id and s.state='open')) then return jsonb_build_object('status','closed'); end if;
 k:='r'||right(replace(p_id::text,'-',''),12);
 items:=case when jsonb_typeof(s.options->'items')='array' then s.options->'items' else '[]'::jsonb end;
 if exists(select 1 from jsonb_array_elements(items) i where i->>'key'=k) then
  return jsonb_build_object('status',case when exists(select 1 from private.risks where session_id=s.id and item_key=k and added_by=who) then 'duplicate' else 'conflict' end,'key',k);
 end if;
 if length(t) not between 1 and 120 then return jsonb_build_object('status','invalid_answer'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 if exists(select 1 from jsonb_array_elements(items) i where lower(i->>'text')=lower(t)) then return jsonb_build_object('status','exists'); end if;
 if jsonb_array_length(items)>=10 then return jsonb_build_object('status','full'); end if;
 if (select count(*) from private.risks where session_id=s.id and added_by=who and not deleted)>=3 then return jsonb_build_object('status','limit'); end if;
 opts:=private.options_grid(s.options||jsonb_build_object('items',items||jsonb_build_array(jsonb_build_object('key',k,'text',t))),p_engagement);
 if opts is null then return jsonb_build_object('status','invalid_request'); end if;
 update public.sessions set options=opts where id=s.id;
 insert into private.risks(engagement_id,session_id,item_key,text,added_by) values(p_engagement,s.id,k,t,who);
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action','reason_add','version',r.version,'changed',true));
 return jsonb_build_object('status','accepted','key',k,'version',r.version);
end $$;

-- ---------- The facilitator's pre-mortem control ----------
-- add_reason, mitigate (a mitigation under a reason), unmitigate, undo_ai (every merge the AI
-- made in this step). One press by a client-made id, as the other controls: room lock, the
-- facilitator check, the id for idempotency, one version raise, logged in plain words.
create function private.reasons_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; v_risk uuid; t text; k text; opts jsonb; items jsonb; who text; me uuid:=private.clearway_user_id(); v_changed boolean:=true;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('add_reason','mitigate','unmitigate','undo_ai') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.room_controls where id=p_id) then
  if exists(select 1 from private.room_controls where id=p_id and engagement_id=p_engagement and action='reasons_'||p_action) then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
 if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
 select * into cur from public.sessions where id=r.live_session_id and not deleted for update;
 if cur.id is null or cur.interaction<>'grid' or cur.options->>'preset' is distinct from 'pre_mortem' then return jsonb_build_object('status','invalid_state'); end if;
 if p_action='add_reason' then
  t:=btrim(regexp_replace(coalesce(p->>'text',''),'\s+',' ','g'));
  items:=case when jsonb_typeof(cur.options->'items')='array' then cur.options->'items' else '[]'::jsonb end;
  if length(t) not between 1 and 120 then return jsonb_build_object('status','invalid_request'); end if;
  if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
  if exists(select 1 from jsonb_array_elements(items) i where lower(i->>'text')=lower(t)) then return jsonb_build_object('status','exists'); end if;
  if jsonb_array_length(items)>=10 then return jsonb_build_object('status','full'); end if;
  k:='r'||right(replace(p_id::text,'-',''),12);
  opts:=private.options_grid(cur.options||jsonb_build_object('items',items||jsonb_build_array(jsonb_build_object('key',k,'text',t))),p_engagement);
  if opts is null then return jsonb_build_object('status','invalid_request'); end if;
  update public.sessions set options=opts where id=cur.id;
  insert into private.risks(engagement_id,session_id,item_key,text) values(p_engagement,cur.id,k,t);
 elsif p_action='mitigate' then
  t:=btrim(regexp_replace(coalesce(p->>'text',''),'\s+',' ','g'));
  if length(t) not between 1 and 300 then return jsonb_build_object('status','invalid_request'); end if;
  if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
  perform private.reasons_sync(p_engagement,cur.id);
  select id into v_risk from private.risks where session_id=cur.id and item_key=p->>'item' and not deleted;
  if v_risk is null then return jsonb_build_object('status','missing'); end if;
  if (select count(*) from private.risk_mitigations where risk_id=v_risk and not deleted)>=3 then return jsonb_build_object('status','full'); end if;
  insert into private.risk_mitigations(engagement_id,risk_id,text,recorded_by,created_at) values(p_engagement,v_risk,t,'facilitator',clock_timestamp());
 elsif p_action='unmitigate' then
  if p->>'mitigation' is null or p->>'mitigation' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  update private.risk_mitigations m set deleted=true where m.id=(p->>'mitigation')::uuid and m.engagement_id=p_engagement and not m.deleted
   and exists(select 1 from private.risks x where x.id=m.risk_id and x.session_id=cur.id);
  if not found then return jsonb_build_object('status','missing'); end if;
 else
  update private.grid_merges set deleted=true where session_id=cur.id and made_by='ai' and not deleted;
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.ai_runs set undone_at=clock_timestamp(),undone_by=me where session_id=cur.id and job='merge_reasons' and status='ok' and changed and undone_at is null;
 end if;
 perform private.reasons_sync(p_engagement,cur.id);
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,'reasons_'||p_action,cur.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','reasons_'||p_action,'by',who,'version',r.version,'changed',v_changed));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- What the control surface lists for the pre-mortem: each reason with its mitigations (ids
-- included, to take one back) and the likelihood and impact the room placed it at.
create function private.reasons_state(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='grid' and options->>'preset'='pre_mortem';
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 perform private.reasons_sync(p_engagement,s.id);
 return jsonb_build_object('status','ok','session',s.id,'full',jsonb_array_length(coalesce(s.options->'items','[]'::jsonb))>=10,
  'reasons',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',k.key,'text',k.text,'num',k.num,'into',k.into_key,'by_ai',k.by_ai,'likelihood',k.likelihood,'impact',k.impact,
    'mitigations',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'text',m.text,'by',m.recorded_by) order by m.created_at,m.id),'[]'::jsonb)
      from private.risk_mitigations m where m.risk_id=k.risk and not m.deleted))) order by k.num)
   from (select i->>'key' as key,i->>'text' as text,(i->>'num')::integer as num,i->>'into' as into_key,
     case when exists(select 1 from private.grid_merges g where g.session_id=s.id and g.item_key=i->>'key' and not g.deleted and g.made_by='ai') then true end as by_ai,
     rk.id as risk,rk.likelihood,rk.impact
     from jsonb_array_elements(private.results_grid(p_engagement,s.id,array[]::text[])->'items') i
     left join private.risks rk on rk.session_id=s.id and rk.item_key=i->>'key' and not rk.deleted) k),'[]'::jsonb),
  'ai_merges',(select count(*) from private.grid_merges g where g.session_id=s.id and g.made_by='ai' and not g.deleted));
end $$;

-- ---------- D2-08 AI merges duplicate reasons ----------
alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_base;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_base;

-- A grid session is the pre-mortem's. Merging starts at three reasons and runs again whenever
-- the number of reasons has changed since the last run that finished. A reason the facilitator
-- or the AI had merged and the facilitator took back is kept apart.
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; t timestamptz:=clock_timestamp(); res jsonb; total integer; standing integer; v_inputs jsonb; v_run uuid;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'grid' then return private.ai_claim_base(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 res:=private.results_grid(s.engagement_id,s.id,array[]::text[]);
 total:=jsonb_array_length(res->'items');
 select count(*) into standing from jsonb_array_elements(res->'items') i where i->>'into' is null;
 if standing<3 or total=a.reasons_seen then return jsonb_build_object('status','idle'); end if;
 if coalesce(p_versions->>'merge_reasons','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select jsonb_build_object('total',total,'reasons',coalesce(jsonb_agg(jsonb_build_object('ref','r'||ord,'key',i->>'key','text',i->>'text','count',(i->>'count')::integer) order by ord),'[]'::jsonb)) into v_inputs
  from (select i,row_number() over(order by (i->>'num')::integer) as ord from jsonb_array_elements(res->'items') i
   where i->>'into' is null
    and not exists(select 1 from private.grid_merges m where m.session_id=s.id and m.deleted and m.made_by='ai' and (m.item_key=i->>'key' or m.into_key=i->>'key'))) z;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'merge_reasons',p_model,p_versions->>'merge_reasons',v_inputs,t) returning id into v_run;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','merge_reasons','prompt_version',p_versions->>'merge_reasons','inputs',v_inputs);
end $$;

create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; t timestamptz:=clock_timestamp(); v_ms integer;
 applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; v_changed boolean:=false; g jsonb; refs jsonb; cur jsonb; reason text; survivor jsonb; members jsonb; member jsonb;
 before integer; standing integer; used text[]:=array[]::text[];
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'merge_reasons' then return private.ai_apply_base(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if not private.ai_on(run.session_id) or s.deleted then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  return jsonb_build_object('status','discarded');
 end if;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 -- Refs to reasons as the run saw them; the reasons as they stand now.
 select coalesce(jsonb_object_agg(x->>'ref',x),'{}'::jsonb) into refs from jsonb_array_elements(run.inputs->'reasons') x;
 select coalesce(jsonb_object_agg(i->>'key',i),'{}'::jsonb) into cur from jsonb_array_elements(private.results_grid(run.engagement_id,run.session_id,array[]::text[])->'items') i;
 select count(*) into before from jsonb_each(cur) e where e.value->>'into' is null;
 standing:=before;
 for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 100 loop
  reason:=null; survivor:=refs->(g->>'survivor');
  members:=case when jsonb_typeof(g->'members')='array' then g->'members' else '[]'::jsonb end;
  if survivor is null or jsonb_array_length(members)=0 or exists(select 1 from jsonb_array_elements(members) x where jsonb_typeof(x)<>'string' or not refs ? (x#>>'{}') or x#>>'{}'=g->>'survivor')
    or (select count(distinct x#>>'{}') from jsonb_array_elements(members) x)<>jsonb_array_length(members)
    or g->>'survivor'=any(used) or exists(select 1 from jsonb_array_elements_text(members) x where x=any(used)) then reason:='unknown';
  elsif 1+jsonb_array_length(members)>4 then reason:='too_many';
  elsif not cur ? (survivor->>'key') or cur->(survivor->>'key') ? 'into' then reason:='gone';
  elsif private.ai_quoted(cur->(survivor->>'key')->>'text') then reason:='quote';
  else
   for member in select refs->x from jsonb_array_elements_text(members) x loop
    if not cur ? (member->>'key') or cur->(member->>'key') ? 'into' then reason:='gone';
    elsif exists(select 1 from private.grid_merges m where m.session_id=run.session_id and m.deleted and (m.item_key=member->>'key' or m.into_key=member->>'key')) then reason:='kept_apart';
    elsif exists(select 1 from private.grid_merges m where m.session_id=run.session_id and not m.deleted and m.into_key=member->>'key') then reason:='has_members';
    elsif private.ai_quoted(cur->(member->>'key')->>'text') then reason:='quote';
    elsif not private.ai_numbers(cur->(member->>'key')->>'text')<@private.ai_numbers(cur->(survivor->>'key')->>'text') then reason:='number';
    end if;
    exit when reason is not null;
   end loop;
   if reason is null and standing-jsonb_array_length(members)<0.6*before then reason:='standing'; end if;
  end if;
  if reason is null then
   insert into private.grid_merges(engagement_id,session_id,item_key,into_key,made_by,run_id,created_at)
    select run.engagement_id,run.session_id,refs->x->>'key',survivor->>'key','ai',run.id,t from jsonb_array_elements_text(members) x;
   standing:=standing-jsonb_array_length(members); v_changed:=true;
   used:=used||(g->>'survivor')||array(select jsonb_array_elements_text(members));
   applied:=applied||jsonb_build_array(jsonb_build_object('survivor',survivor->>'key','members',(select jsonb_agg(refs->x->>'key') from jsonb_array_elements_text(members) x)));
  else refused:=refused||jsonb_build_array(jsonb_build_object('group',g,'reason',reason)); end if;
 end loop;
 update private.ai_runs set status='ok',changed=v_changed,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.ai_sessions set reasons_seen=coalesce((run.inputs->>'total')::integer,0) where session_id=run.session_id;
 if v_changed then
  perform private.reasons_sync(run.engagement_id,run.session_id);
  if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
 end if;
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

-- ---------- D2-10 The CORE goal builder (INT-15) ----------
-- Options: the Vision Outcome on show (default: the first) and whether each goal must link a
-- risk (required in the two-day template, later in the day-and-a-half template).
create function private.options_goals(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_engagement is null or jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) f where f not in ('outcome','risk_links')) then return null; end if;
 if p ? 'outcome' and jsonb_typeof(p->'outcome') not in ('string','null') then return null; end if;
 if p->>'outcome' is not null and (p->>'outcome' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or not exists(select 1 from private.vision_outcomes o where o.id=(p->>'outcome')::uuid and o.engagement_id=p_engagement and not o.deleted)) then return null; end if;
 if p ? 'risk_links' and (jsonb_typeof(p->'risk_links') is distinct from 'string' or p->>'risk_links' not in ('required','later')) then return null; end if;
 return jsonb_strip_nulls(jsonb_build_object('outcome',p->>'outcome','risk_links',coalesce(p->>'risk_links','required')));
end $$;

-- Answers do not come through the engine: goals are written to private.goals by
-- private.goal_propose, so a plain answer is never valid here.
create function private.parse_goals(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select jsonb_build_object('status','invalid_answer') $$;

create function private.goals_outcome(p_session uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select o.id from public.sessions s join private.vision_outcomes o on o.engagement_id=s.engagement_id and not o.deleted
   where s.id=p_session and s.options->>'outcome' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and o.id=(s.options->>'outcome')::uuid),
  (select o.id from public.sessions s join private.vision_outcomes o on o.engagement_id=s.engagement_id and not o.deleted
   where s.id=p_session order by o.position,o.created_at,o.id limit 1))
$$;

-- The numbers each risk goes by, so a goal can say "Risk 2". Merged reasons count as the
-- reason they were merged into.
create function private.risk_numbers(p_engagement uuid) returns table(id uuid,target uuid,n integer)
language sql stable security definer set search_path='' as $$
 with live as (select r.id,coalesce(r.merged_into,r.id) as target,r.merged_into,
   coalesce((select t.ord from public.sessions s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.options->'items')='array' then s.options->'items' else '[]'::jsonb end) with ordinality t(i,ord)
     where s.id=r.session_id and t.i->>'key'=r.item_key),1000) as ord,r.created_at
   from private.risks r where r.engagement_id=p_engagement and not r.deleted),
 num as (select l.id,row_number() over(order by l.ord,l.created_at,l.id)::integer as n from live l where l.merged_into is null)
 select l.id,l.target,num.n from live l join num on num.id=l.target
$$;

-- What every screen of the step shows: the outcome and its 3-year Vision bullets, and each
-- goal with its four CORE letters, its owner's first name, end date and risk numbers. No
-- email and no other name travels with it.
create function private.results_goals(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with oc as (select o.id,o.title,o.n from (select o.id,o.title,row_number() over(order by o.position,o.created_at,o.id)::integer as n
   from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted) o where o.id=private.goals_outcome(p_session)),
 gl as (select g.*,private.goal_core(g.id) as core,row_number() over(order by g.position,g.created_at,g.id)::integer as ord
   from private.goals g where g.engagement_id=p_engagement and not g.deleted and g.outcome_id=(select id from oc)),
 need as (select coalesce((select s.options->>'risk_links' from public.sessions s where s.id=p_session),'required')='required' as req)
 select jsonb_build_object('total',(select count(*) from gl),'people',(select count(distinct proposed_by) from gl),'words','[]'::jsonb,
  'risk_links',(select case when req then 'required' else 'later' end from need),
  'outcome',(select jsonb_build_object('id',oc.id,'title',oc.title,'number',oc.n,'of',(select count(*) from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted)) from oc),
  'bullets',coalesce((select jsonb_agg(i.text order by i.position,i.created_at,i.id) from private.outcome_indicators i
    where i.outcome_id=(select id from oc) and i.engagement_id=p_engagement and not i.deleted and length(btrim(i.text))>0),'[]'::jsonb),
  'goals',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',gl.id,'title',gl.title,'result',nullif(btrim(gl.result),''),
     'owner',coalesce(nullif(split_part(btrim((select a.name from public.attendees a where a.id=gl.owner_attendee_id and not a.deleted)),' ',1),''),nullif(split_part(btrim(coalesce(gl.owner_name,'')),' ',1),'')),
     'end_date',gl.end_date,'season',gl.season,'clear',gl.result_clear,
     'letters',jsonb_build_object('C',(gl.core->>'connected')::boolean,'O',(gl.core->>'owned')::boolean,'R',(gl.core->>'result')::boolean,'E',(gl.core->>'end_date')::boolean),
     'met',(gl.core->>'met')::boolean,
     'risks',coalesce((select jsonb_agg(distinct rn.n) from private.goal_risks gr join private.risk_numbers(p_engagement) rn on rn.id=gr.risk_id where gr.goal_id=gl.id and not gr.deleted),'[]'::jsonb),
     'needs_risk',(select req from need) and not exists(select 1 from private.goal_risks gr join private.risks rk on rk.id=gr.risk_id and not rk.deleted where gr.goal_id=gl.id and not gr.deleted))) order by gl.ord) from gl),'[]'::jsonb))
$$;

create function private.items_goals(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select '[]'::jsonb $$;

-- Reads and checks the fields of a goal, whichever are present. Returns the clean fields, or a status.
create function private.goal_read(p_engagement uuid,p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb:='{}'::jsonb; t text; o jsonb; d date; ids uuid[]; v_name text; v_email text;
begin
 if jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p ? 'title' then
  if jsonb_typeof(p->'title') is distinct from 'string' then return jsonb_build_object('status','invalid_answer'); end if;
  t:=btrim(regexp_replace(p->>'title','\s+',' ','g'));
  if length(t) not between 1 and 200 then return jsonb_build_object('status','invalid_answer'); end if;
  if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
  out:=out||jsonb_build_object('title',t);
 end if;
 if p ? 'result' then
  if jsonb_typeof(p->'result') is distinct from 'string' then return jsonb_build_object('status','invalid_answer'); end if;
  t:=btrim(regexp_replace(p->>'result','\s+',' ','g'));
  if length(t)>400 then return jsonb_build_object('status','invalid_answer'); end if;
  if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
  out:=out||jsonb_build_object('result',t);
 end if;
 if p ? 'owner' then
  o:=p->'owner';
  if jsonb_typeof(o)='null' then out:=out||jsonb_build_object('owner',null);
  elsif jsonb_typeof(o)='object' and o ? 'attendee' and not (o ? 'name') and not (o ? 'email') then
   if jsonb_typeof(o->'attendee') is distinct from 'string' or o->>'attendee' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_answer'); end if;
   if not exists(select 1 from public.attendees a where a.id=(o->>'attendee')::uuid and a.engagement_id=p_engagement and not a.deleted) then return jsonb_build_object('status','invalid_answer'); end if;
   out:=out||jsonb_build_object('owner',jsonb_build_object('attendee',o->>'attendee'));
  elsif jsonb_typeof(o)='object' and o ? 'name' and o ? 'email' and not (o ? 'attendee') then
   if jsonb_typeof(o->'name') is distinct from 'string' or jsonb_typeof(o->'email') is distinct from 'string' then return jsonb_build_object('status','invalid_answer'); end if;
   v_name:=btrim(regexp_replace(o->>'name','\s+',' ','g')); v_email:=lower(btrim(o->>'email'));
   if length(v_name) not between 1 and 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' or length(v_email)>254 then return jsonb_build_object('status','invalid_answer'); end if;
   if private.screen_text(v_name) then return jsonb_build_object('status','filtered'); end if;
   out:=out||jsonb_build_object('owner',jsonb_build_object('name',v_name,'email',v_email));
  else return jsonb_build_object('status','invalid_answer'); end if;
 end if;
 if p ? 'end_date' then
  if jsonb_typeof(p->'end_date')='null' then out:=out||jsonb_build_object('end_date',null);
  elsif jsonb_typeof(p->'end_date')='string' and p->>'end_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
   d:=(p->>'end_date')::date;
   if d not between date '2000-01-01' and date '2100-12-31' then return jsonb_build_object('status','invalid_answer'); end if;
   out:=out||jsonb_build_object('end_date',d);
  else return jsonb_build_object('status','invalid_answer'); end if;
 end if;
 if p ? 'risks' then
  if jsonb_typeof(p->'risks') is distinct from 'array' or jsonb_array_length(p->'risks')>6
   or exists(select 1 from jsonb_array_elements(p->'risks') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_answer'); end if;
  select coalesce(array_agg(distinct (v#>>'{}')::uuid),array[]::uuid[]) into ids from jsonb_array_elements(p->'risks') v;
  if (select count(*) from private.risks r where r.id=any(ids) and r.engagement_id=p_engagement and not r.deleted)<>cardinality(ids) then return jsonb_build_object('status','invalid_answer'); end if;
  out:=out||jsonb_build_object('risks',to_jsonb(ids));
 end if;
 return out||jsonb_build_object('status','ok');
exception when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then return jsonb_build_object('status','invalid_answer');
end $$;

-- Writes the fields read by goal_read into a goal (new or standing). Only the fields present change.
create function private.goal_write(p_goal uuid,f jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare ids uuid[];
begin
 update private.goals g set
  title=case when f ? 'title' then f->>'title' else g.title end,
  result=case when f ? 'result' then f->>'result' else g.result end,
  result_clear=case when f ? 'result' and f->>'result' is distinct from g.result then false else g.result_clear end,
  owner_attendee_id=case when f ? 'owner' then (f->'owner'->>'attendee')::uuid else g.owner_attendee_id end,
  owner_name=case when f ? 'owner' then f->'owner'->>'name' else g.owner_name end,
  owner_email=case when f ? 'owner' then f->'owner'->>'email' else g.owner_email end,
  end_date=case when f ? 'end_date' then (f->>'end_date')::date else g.end_date end,
  updated_at=now()
 where g.id=p_goal;
 if f ? 'risks' then
  select coalesce(array_agg(x::uuid),array[]::uuid[]) into ids from jsonb_array_elements_text(f->'risks') x;
  update private.goal_risks set deleted=true,updated_at=now() where goal_id=p_goal and not deleted and not risk_id=any(ids);
  insert into private.goal_risks(goal_id,risk_id,engagement_id) select p_goal,x,(select engagement_id from private.goals where id=p_goal) from unnest(ids) x
   on conflict(goal_id,risk_id) do update set deleted=false,updated_at=now();
 end if;
end $$;

-- The date a goal's end defaults to, and the next two after it: season ends, never quarters.
create function private.season_ends(p_from date default current_date) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_agg(jsonb_build_object('date',d,'season',private.season_of(d),
   'label',case private.season_of(d) when 'SEP_DEC' then 'Sept to Dec' when 'JAN_APR' then 'Jan to Apr' else 'May to Aug' end||' '||extract(year from d)::integer) order by d)
 from (select e0 as d from (select private.season_end(p_from) as e0) a
  union all select private.season_end(private.season_end(p_from)+1) union all select private.season_end(private.season_end(private.season_end(p_from)+1)+1)) x
$$;

-- A phone's form: the outcome and its Vision bullets, who can own a goal (first and last names
-- of the people in the room, to this phone only), the risks to link and the season ends.
create function private.goals_form(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; who uuid; v_outcome uuid;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and not deleted and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='goals';
 if s.id is null then return jsonb_build_object('status','invalid_session'); end if;
 perform private.reasons_sync_all(p_engagement);
 v_outcome:=private.goals_outcome(s.id);
 return jsonb_build_object('status','ok','me',who,'outcome',v_outcome,'risk_links',coalesce(s.options->>'risk_links','required'),'season_ends',private.season_ends(),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',btrim(a.name)) order by lower(a.name),a.id) from public.attendees a where a.engagement_id=p_engagement and not a.deleted),'[]'::jsonb),
  'risks',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'n',rn.n,'text',r.text) order by rn.n) from private.risks r join private.risk_numbers(p_engagement) rn on rn.id=r.id where r.engagement_id=p_engagement and not r.deleted and r.merged_into is null),'[]'::jsonb),
  'mine',coalesce((select jsonb_agg(g.id order by g.created_at) from private.goals g where g.engagement_id=p_engagement and not g.deleted and g.proposed_by=who and g.outcome_id=v_outcome),'[]'::jsonb));
end $$;

-- A phone proposes a goal for the outcome on show, or changes one it proposed. Only a title
-- is needed: a goal stays flagged until all four CORE letters are met. Six goals a person per outcome.
create function private.goal_propose(p_engagement uuid,p_id uuid,p_session uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; who uuid; f jsonb; v_goal private.goals; v_outcome uuid; v_new uuid;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and not deleted and id in(select private.room_attendee_ids());
 if who is null or p_id is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted for update;
 if s.id is null or s.interaction<>'goals' then return jsonb_build_object('status','invalid_session'); end if;
 if not ((r.live_session_id=s.id and s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>clock_timestamp())) or (r.live_session_id is distinct from s.id and s.state='open')) then return jsonb_build_object('status','closed'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 f:=private.goal_read(p_engagement,p-'goal');
 if f->>'status'<>'ok' then return f; end if;
 v_outcome:=private.goals_outcome(s.id);
 if v_outcome is null then return jsonb_build_object('status','invalid_state'); end if;
 if p ? 'goal' then
  if jsonb_typeof(p->'goal') is distinct from 'string' or p->>'goal' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  select * into v_goal from private.goals where id=(p->>'goal')::uuid and engagement_id=p_engagement and not deleted;
  if v_goal.id is null then return jsonb_build_object('status','missing'); end if;
  if v_goal.proposed_by is distinct from who then return jsonb_build_object('status','denied'); end if;
  perform private.goal_write(v_goal.id,f);
  v_new:=v_goal.id;
 else
  select id into v_new from private.goals where id=p_id;
  if v_new is not null then
   return jsonb_build_object('status',case when exists(select 1 from private.goals where id=p_id and proposed_by=who and engagement_id=p_engagement) then 'duplicate' else 'conflict' end,'id',p_id);
  end if;
  if not f ? 'title' then return jsonb_build_object('status','invalid_answer'); end if;
  if (select count(*) from private.goals where engagement_id=p_engagement and proposed_by=who and outcome_id=v_outcome and not deleted)>=6 then return jsonb_build_object('status','limit'); end if;
  insert into private.goals(id,engagement_id,outcome_id,title,proposed_by,position)
   values(p_id,p_engagement,v_outcome,f->>'title',who,coalesce((select max(position)+1 from private.goals where engagement_id=p_engagement and outcome_id=v_outcome),0));
  perform private.goal_write(p_id,f-'title');
  v_new:=p_id;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action','goal_propose','version',r.version,'changed',true));
 return jsonb_build_object('status','accepted','id',v_new,'version',r.version);
end $$;

-- The facilitator's goal control: outcome (previous, next or a named one), add, edit,
-- clear (Result is clear, or not), remove. One press by a client-made id.
create function private.goals_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; f jsonb; v_goal uuid; v_outcome uuid; v_next uuid; who text; me uuid:=private.clearway_user_id();
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('outcome','add','edit','clear','remove') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.room_controls where id=p_id) then
  if exists(select 1 from private.room_controls where id=p_id and engagement_id=p_engagement and action='goals_'||p_action) then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
 if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
 select * into cur from public.sessions where id=r.live_session_id and not deleted for update;
 if cur.id is null or cur.interaction<>'goals' then return jsonb_build_object('status','invalid_state'); end if;
 v_outcome:=private.goals_outcome(cur.id);
 if p_action='outcome' then
  if p->>'to' in ('next','prev') then
   select case when p->>'to'='next' then x.next_id else x.prev_id end into v_next from (select o2.id,lag(o2.id) over w as prev_id,lead(o2.id) over w as next_id
     from private.vision_outcomes o2 where o2.engagement_id=p_engagement and not o2.deleted window w as (order by o2.position,o2.created_at,o2.id)) x where x.id=v_outcome;
  elsif p->>'to' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
   select id into v_next from private.vision_outcomes where id=(p->>'to')::uuid and engagement_id=p_engagement and not deleted;
  else return jsonb_build_object('status','invalid_request'); end if;
  if v_next is null then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update public.sessions set options=options||jsonb_build_object('outcome',v_next) where id=cur.id;
 elsif p_action='add' then
  f:=private.goal_read(p_engagement,p-'from'-'goal');
  if f->>'status'<>'ok' then return f; end if;
  if not f ? 'title' or v_outcome is null then return jsonb_build_object('status','invalid_request'); end if;
  if (select count(*) from private.goals where engagement_id=p_engagement and outcome_id=v_outcome and not deleted)>=30 then return jsonb_build_object('status','full'); end if;
  insert into private.goals(id,engagement_id,outcome_id,title,position) values(p_id,p_engagement,v_outcome,f->>'title',coalesce((select max(position)+1 from private.goals where engagement_id=p_engagement and outcome_id=v_outcome),0));
  perform private.goal_write(p_id,f-'title');
 else
  if p->>'goal' is null or p->>'goal' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  v_goal:=(p->>'goal')::uuid;
  if not exists(select 1 from private.goals where id=v_goal and engagement_id=p_engagement and outcome_id=v_outcome and not deleted) then return jsonb_build_object('status','missing'); end if;
  if p_action='edit' then
   f:=private.goal_read(p_engagement,p-'from'-'goal');
   if f->>'status'<>'ok' then return f; end if;
   perform private.goal_write(v_goal,f);
  elsif p_action='clear' then
   if jsonb_typeof(p->'clear') is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
   update private.goals set result_clear=(p->>'clear')::boolean,updated_at=now() where id=v_goal and result_clear is distinct from (p->>'clear')::boolean;
   if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
  else
   update private.goal_risks set deleted=true,updated_at=now() where goal_id=v_goal and not deleted;
   update private.goals set deleted=true,updated_at=now() where id=v_goal;
  end if;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,'goals_'||p_action,cur.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','goals_'||p_action,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- What the control surface lists for the goal builder: the outcomes, the goals of the one on
-- show with their owners in full (email included, this view only), the risks and the people.
create function private.goals_state(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; v_outcome uuid;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='goals';
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 perform private.reasons_sync_all(p_engagement);
 v_outcome:=private.goals_outcome(s.id);
 return jsonb_build_object('status','ok','session',s.id,'outcome',v_outcome,'risk_links',coalesce(s.options->>'risk_links','required'),'season_ends',private.season_ends(),
  'outcomes',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'title',o.title) order by o.position,o.created_at,o.id) from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted),'[]'::jsonb),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'name',btrim(a.name)) order by lower(a.name),a.id) from public.attendees a where a.engagement_id=p_engagement and not a.deleted),'[]'::jsonb),
  'risks',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'n',rn.n,'text',x.text) order by rn.n) from private.risks x join private.risk_numbers(p_engagement) rn on rn.id=x.id where x.engagement_id=p_engagement and not x.deleted and x.merged_into is null),'[]'::jsonb),
  'goals',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',g.id,'title',g.title,'result',nullif(g.result,''),'clear',g.result_clear,'end_date',g.end_date,
     'owner',case when g.owner_attendee_id is not null then jsonb_build_object('attendee',g.owner_attendee_id,'name',(select btrim(a.name) from public.attendees a where a.id=g.owner_attendee_id))
       when g.owner_name is not null then jsonb_build_object('name',g.owner_name,'email',g.owner_email) end,
     'core',private.goal_core(g.id),
     'risks',coalesce((select jsonb_agg(gr.risk_id) from private.goal_risks gr where gr.goal_id=g.id and not gr.deleted),'[]'::jsonb),
     'by',case when g.proposed_by is null then 'facilitator' else 'phone' end)) order by g.position,g.created_at,g.id)
    from private.goals g where g.engagement_id=p_engagement and g.outcome_id=v_outcome and not g.deleted),'[]'::jsonb));
end $$;

-- ---------- Public wrappers, as the other kinds ----------
create function public.reason_add(p_engagement uuid,p_id uuid,p_session uuid,p_text text) returns jsonb
language sql security invoker set search_path='' as $$ select private.reason_add(p_engagement,p_id,p_session,p_text) $$;
create function public.reasons_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.reasons_control(p_engagement,p_id,p_action,p) $$;
create function public.reasons_state(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.reasons_state(p_engagement) $$;
create function public.goals_form(p_engagement uuid,p_session uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.goals_form(p_engagement,p_session) $$;
create function public.goal_propose(p_engagement uuid,p_id uuid,p_session uuid,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.goal_propose(p_engagement,p_id,p_session,p) $$;
create function public.goals_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.goals_control(p_engagement,p_id,p_action,p) $$;
create function public.goals_state(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.goals_state(p_engagement) $$;

revoke all on function private.ai_on(uuid),private.results_grid(uuid,uuid,text[]),private.items_grid(uuid,text[]),
 private.reasons_sync(uuid,uuid),private.reasons_sync_all(uuid),private.reason_add(uuid,uuid,uuid,text),private.reasons_control(uuid,uuid,text,jsonb),private.reasons_state(uuid),
 private.ai_claim_base(uuid,uuid,text,jsonb),private.ai_apply_base(uuid,uuid,jsonb,jsonb),private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),
 private.options_goals(jsonb,uuid),private.parse_goals(public.sessions,text,jsonb),private.goals_outcome(uuid),private.risk_numbers(uuid),private.results_goals(uuid,uuid,text[]),private.items_goals(uuid,text[]),
 private.goal_read(uuid,jsonb),private.goal_write(uuid,jsonb),private.season_ends(date),private.goals_form(uuid,uuid),private.goal_propose(uuid,uuid,uuid,jsonb),private.goals_control(uuid,uuid,text,jsonb),private.goals_state(uuid),
 public.reason_add(uuid,uuid,uuid,text),public.reasons_control(uuid,uuid,text,jsonb),public.reasons_state(uuid),
 public.goals_form(uuid,uuid),public.goal_propose(uuid,uuid,uuid,jsonb),public.goals_control(uuid,uuid,text,jsonb),public.goals_state(uuid)
 from public,anon,authenticated;
-- The engine finds options, parse, results and items by name; the wrappers call the private functions as the signed-in caller.
grant execute on function private.reason_add(uuid,uuid,uuid,text),private.reasons_control(uuid,uuid,text,jsonb),private.reasons_state(uuid),
 private.goals_form(uuid,uuid),private.goal_propose(uuid,uuid,uuid,jsonb),private.goals_control(uuid,uuid,text,jsonb),private.goals_state(uuid),
 public.reason_add(uuid,uuid,uuid,text),public.reasons_control(uuid,uuid,text,jsonb),public.reasons_state(uuid),
 public.goals_form(uuid,uuid),public.goal_propose(uuid,uuid,uuid,jsonb),public.goals_control(uuid,uuid,text,jsonb),public.goals_state(uuid) to authenticated;
-- The worker's claim and apply keep their grants (service role); the renamed originals are for the wrappers.
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_claim_base(uuid,uuid,text,jsonb),private.ai_apply_base(uuid,uuid,jsonb,jsonb) to service_role;
commit;
