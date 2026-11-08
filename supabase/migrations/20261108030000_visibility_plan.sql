-- Milestone 7, step 3: the visibility plan (AFT-02). Records, the draft_visibility_plan AI job, the editor, and the real contract the report reads.
--
-- The Brain's ruling of November 1 says how a visibility plan is built: start from the most public moment (usually Vision Sunday) and work backwards. The plan
-- moves outward in this order: the lead pastor first, then the retreat participants, then the board, the staff, membership and key leaders, then the
-- congregation. Commander's intent anchors on the public date: what must the church hear and understand on that day. The report section it feeds is
-- Make the Vision Visible.
--
-- AI drafts the rows from what the room said: scribe action and mitigation cards, risks (not merged) and their mitigations, intent cards and first steps,
-- goals, decisions and the success measures the team ranked. The model sees those records under short refs (a1, r2, i3), never a name, an email, a role, a
-- speaker, an owner or an id. What it may keep is code, not prompt: every row must cite at least one ref it was given, the audience stage must be one of the
-- six and the rows are put in the outward order, a when is blank unless the facilitator has given a public date and then a when_date must be on or before that
-- date (working back), a quotation must appear word for word in a cited ref, a number must appear in a cited ref, no attendee name may appear, dashes and
-- semicolons are rewritten and the horizon terms must be exact. A row that fails is dropped and the plan is marked Needs attention.
--
-- New, in private (facilitators only, through security definer functions with security invoker wrappers in public):
--   visibility_plans, visibility_plan_rows, visibility_plan_sources, visibility_plan_rounds
--   visibility_plan_state, visibility_plan_set, visibility_plan_start, visibility_plan_row_edit, visibility_plan_row_add, visibility_plan_row_remove,
--   visibility_plan_row_move, visibility_plan_row_reviewed                                                                    (facilitators)
--   visibility_plan_due, visibility_plan_claim, visibility_plan_apply, visibility_plan_fail                                    (the worker, service role)
--   visibility_plan_for_report(p_engagement)                                  the contract step 1 shipped as a fixture, replaced here (service role)
-- Shared objects touched, each a superset of its newest definition:
--   private.reset_practice_room    step 1's wrapper, renamed to _pre_visibility_plan and wrapped
--   private.rehearsal_control      step 1's wrapper, renamed to _pre_visibility_plan and wrapped
-- The AI job check and the session check already hold draft_visibility_plan (step 1 added them), so this file leaves them alone.
begin;

-- ---------- Records ----------
-- One plan for each engagement: the public moment the plan works back from, and its date when the facilitator has one.
create table private.visibility_plans (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 moment text not null default 'Vision Sunday' check(length(btrim(moment)) between 1 and 80),
 public_date date check(public_date is null or public_date between date '2020-01-01' and date '2100-12-31'),
 status text not null default 'empty' check(status in ('empty','drafting','drafted','edited','reviewed','needs_attention','thin')),
 error text check(error is null or length(error)<=200),
 dropped integer not null default 0 check(dropped between 0 and 100),
 ai_run uuid references private.ai_runs(id) on delete set null,
 drafted_at timestamptz,
 created_by uuid references public.clearway_users(id),
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index visibility_plans_engagement_idx on private.visibility_plans(engagement_id) where not deleted;
create unique index visibility_plans_id_engagement_idx on private.visibility_plans(id,engagement_id);
create index visibility_plans_ai_run_idx on private.visibility_plans(ai_run) where ai_run is not null;
create index visibility_plans_created_by_idx on private.visibility_plans(created_by) where created_by is not null;
alter table private.visibility_plans enable row level security;
alter table private.visibility_plans force row level security;
revoke all on private.visibility_plans from public,anon,authenticated;
grant select,insert,update,delete on private.visibility_plans to service_role;
create trigger touch_record before update on private.visibility_plans for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.visibility_plans for each row execute function private.mark_test();

-- A row is one audience: who they are, when they hear, who tells them, what they hear and the risk the row answers. Position is the order on the page.
-- A row the facilitator touched or reviewed stays through a redraft.
create table private.visibility_plan_rows (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 plan_id uuid not null,
 position integer not null default 0 check(position>=0),
 stage text not null check(stage in ('lead_pastor','participants','board','staff','key_leaders','congregation','other')),
 who text not null check(length(btrim(who)) between 1 and 200),
 when_text text not null default '' check(length(when_text)<=120),
 when_date date check(when_date is null or when_date between date '2020-01-01' and date '2100-12-31'),
 by_whom text not null default '' check(length(by_whom)<=200),
 what_they_hear text not null default '' check(length(what_they_hear)<=600),
 risk text not null default '' check(length(risk)<=400),
 origin text not null check(origin in ('ai','facilitator')),
 touched boolean not null default false,
 reviewed_at timestamptz,
 reviewed_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(plan_id,engagement_id) references private.visibility_plans(id,engagement_id)
);
create unique index visibility_plan_rows_id_engagement_idx on private.visibility_plan_rows(id,engagement_id);
create index visibility_plan_rows_plan_idx on private.visibility_plan_rows(plan_id,position) where not deleted;
create index visibility_plan_rows_engagement_idx on private.visibility_plan_rows(engagement_id);
create index visibility_plan_rows_reviewed_by_idx on private.visibility_plan_rows(reviewed_by) where reviewed_by is not null;
alter table private.visibility_plan_rows enable row level security;
alter table private.visibility_plan_rows force row level security;
revoke all on private.visibility_plan_rows from public,anon,authenticated;
grant select,insert,update,delete on private.visibility_plan_rows to service_role;
create trigger touch_record before update on private.visibility_plan_rows for each row execute function private.touch_live_record('id');

-- A source is a record a row rests on, with the words it used (280 characters at most). The kinds are the report's.
create table private.visibility_plan_sources (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 row_id uuid not null,
 kind text not null check(kind in ('finding','theme','four_lists_card','scribe_card','photo','lens_summary_sentence','outcome','indicator','risk','mitigation','goal','intent_card','first_step','key_metric','celebration','decision','signal','submission','record')),
 ref_id uuid,
 excerpt text not null check(length(btrim(excerpt)) between 1 and 280),
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(row_id,engagement_id) references private.visibility_plan_rows(id,engagement_id),
 check(kind='record' or ref_id is not null)
);
create index visibility_plan_sources_row_idx on private.visibility_plan_sources(row_id) where not deleted;
create index visibility_plan_sources_engagement_idx on private.visibility_plan_sources(engagement_id);
alter table private.visibility_plan_sources enable row level security;
alter table private.visibility_plan_sources force row level security;
revoke all on private.visibility_plan_sources from public,anon,authenticated;
grant select,insert,update,delete on private.visibility_plan_sources to service_role;
create trigger touch_record before update on private.visibility_plan_sources for each row execute function private.touch_live_record('id');

-- The same rule as the report: a signal is a source only when it is aligned and the facilitator saved it as a citation. The database checks it, whoever writes the row.
create function private.vp_sources_check() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='signal' and not new.deleted and not exists(select 1 from private.signals s where s.id=new.ref_id and s.engagement_id=new.engagement_id and not s.deleted
   and s.kind='aligned' and s.saved_as_citation_at is not null) then
  raise exception 'A signal is a source only when it is aligned and saved as a citation' using errcode='23514';
 end if;
 return new;
end $$;
create trigger vp_sources_check before insert or update on private.visibility_plan_sources for each row execute function private.vp_sources_check();

-- The engagement-level drafting round, as for the report: the facilitator's press makes it pending, the worker claims it with a lease and makes one run on the
-- deeper model. There is one run for the whole plan, so there is no queue.
create table private.visibility_plan_rounds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 status text not null default 'pending' check(status in ('pending','drafting','ready','failed','idle')),
 request_id uuid,
 requested_at timestamptz not null default clock_timestamp(),
 requested_by uuid references public.clearway_users(id),
 attempts integer not null default 0 check(attempts between 0 and 100),
 lease_id uuid,
 lease_run uuid references private.ai_runs(id) on delete set null,
 lease_until timestamptz,
 last_failed_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=200),
 last_ok_at timestamptz,
 last_kept integer check(last_kept is null or last_kept between 0 and 1000),
 last_dropped integer check(last_dropped is null or last_dropped between 0 and 1000),
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create unique index visibility_plan_rounds_engagement_idx on private.visibility_plan_rounds(engagement_id) where not deleted;
create index visibility_plan_rounds_requested_by_idx on private.visibility_plan_rounds(requested_by) where requested_by is not null;
create index visibility_plan_rounds_lease_run_idx on private.visibility_plan_rounds(lease_run) where lease_run is not null;
alter table private.visibility_plan_rounds enable row level security;
alter table private.visibility_plan_rounds force row level security;
revoke all on private.visibility_plan_rounds from public,anon,authenticated;
grant select,insert,update,delete on private.visibility_plan_rounds to service_role;
create trigger touch_record before update on private.visibility_plan_rounds for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.visibility_plan_rounds for each row execute function private.mark_test();

-- ---------- Small helpers ----------
-- The outward order: the lead pastor, the retreat participants, the board, the staff, key leaders, the congregation. A stage the facilitator names for
-- themselves (other) sorts last.
create function private.vp_rank(p_stage text) returns integer
language sql immutable security invoker set search_path='' as $$
 select case p_stage when 'lead_pastor' then 1 when 'participants' then 2 when 'board' then 3 when 'staff' then 4 when 'key_leaders' then 5 when 'congregation' then 6 else 7 end
$$;

-- Does a row still rest on a source? The report's rule decides whether a source still stands (rp_source_live): a signal only while it is aligned and saved
-- as a citation, a record only while it is there.
create function private.vp_row_sourced(p_row uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.visibility_plan_sources r where r.row_id=p_row and not r.deleted and private.rp_source_live(r.engagement_id,r.kind,r.ref_id))
$$;

-- What the plan's status is after something changed. p_edit is true when the facilitator changed a row (an edit takes needs attention away) and false
-- for a review. A plan being drafted is left alone.
create function private.vp_settle(p_plan uuid,p_edit boolean) returns void
language plpgsql security definer set search_path='' as $$
declare pl private.visibility_plans; n integer; n_rev integer; n_touched integer; v text;
begin
 select * into pl from private.visibility_plans where id=p_plan and not deleted for update;
 if not found or pl.status='drafting' then return; end if;
 -- Positions always run one to n, whatever was removed or put in.
 update private.visibility_plan_rows x set position=o.ord from (select y.id,(row_number() over (order by y.position,y.id))::integer as ord from private.visibility_plan_rows y where y.plan_id=p_plan and not y.deleted) o
  where x.id=o.id and x.position<>o.ord;
 select count(*)::integer,count(*) filter (where reviewed_at is not null)::integer,count(*) filter (where touched)::integer into n,n_rev,n_touched
  from private.visibility_plan_rows where plan_id=p_plan and not deleted;
 v:=case when n=0 then (case when not p_edit and pl.status in ('thin','needs_attention') then pl.status else 'empty' end)
  when n_rev=n then 'reviewed'
  when not p_edit and pl.status='needs_attention' then 'needs_attention'
  when p_edit or n_touched>0 then 'edited' else 'drafted' end;
 update private.visibility_plans set status=v,error=case when v='needs_attention' then error else null end where id=p_plan;
end $$;

-- The plan row for an engagement, made when the facilitator first sets, drafts or adds something.
create function private.vp_plan(p_engagement uuid) returns private.visibility_plans
language plpgsql security definer set search_path='' as $$
declare pl private.visibility_plans;
begin
 select * into pl from private.visibility_plans where engagement_id=p_engagement and not deleted;
 if not found then insert into private.visibility_plans(engagement_id,created_by) values(p_engagement,private.clearway_user_id()) returning * into pl; end if;
 return pl;
end $$;

-- ---------- What the model reads ----------
-- {plan_id, public:{moment, date}, kept_stages, refs:[{ref, group, text, thin, thin_text, sources}]}. Refs: a scribe action card (a), a scribe mitigation card (m),
-- a risk that was not merged away (r), a mitigation (k), a Commander's Intent card (i), a first step (s), a 1-year goal (g), a decision (d) and a success
-- measure the team ranked (y). An owner, a speaker and a due date never reach it, and free text that names someone is left out. The ids stay in the run's
-- inputs and are never printed in the prompt.
create function private.vp_inputs(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pl private.visibility_plans; refs jsonb:='[]'::jsonb; names text[]; x record; v text; kept text[]; v_moment text;
begin
 select * into pl from private.visibility_plans where engagement_id=p_engagement and not deleted;
 names:=private.report_names(p_engagement);
 v_moment:=coalesce(pl.moment,'Vision Sunday');
 if private.discover_has_name(v_moment,names) then v_moment:='the public moment'; end if;
 for x in select c.id,c.text from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='action' order by c.captured_at,c.seq limit 30 loop
  if private.discover_has_name(x.text,names) then continue; end if;
  refs:=private.rp_add(refs,'a','Scribe action card',x.text,'scribe_card',x.id,x.text,false,null,false);
 end loop;
 for x in select c.id,c.text,nullif(btrim(coalesce(c.detail->>'risk','')),'') as risk from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='mitigation' order by c.captured_at,c.seq limit 20 loop
  v:=x.text||case when x.risk is not null then ' (the risk it answers: '||x.risk||')' else '' end;
  if private.discover_has_name(v,names) then continue; end if;
  refs:=private.rp_add(refs,'m','Scribe mitigation card',v,'scribe_card',x.id,x.text,false,null,false);
 end loop;
 for x in select r.id,r.text from private.risks r where r.engagement_id=p_engagement and not r.deleted and r.merged_into is null
   order by coalesce(r.likelihood,0)*coalesce(r.impact,0) desc,r.created_at,r.id limit 20 loop
  if private.discover_has_name(x.text,names) then continue; end if;
  refs:=private.rp_add(refs,'r','Risk from the pre-mortem',x.text,'risk',x.id,x.text,false,null,false);
 end loop;
 for x in select m.id,m.text,r.text as risk from private.risk_mitigations m join private.risks r on r.id=m.risk_id and r.engagement_id=m.engagement_id and not r.deleted
   where m.engagement_id=p_engagement and not m.deleted order by m.created_at,m.id limit 30 loop
  if private.discover_has_name(x.text||' '||x.risk,names) then continue; end if;
  refs:=private.rp_add(refs,'k','Mitigation for the risk: '||left(x.risk,120),x.text,'mitigation',x.id,x.text,false,null,false);
 end loop;
 for x in select c.id,c.intent,c.must_do,c.what_we_stop,o.title as otitle from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id and not o.deleted
   where c.engagement_id=p_engagement and not c.deleted order by o.position,c.created_at,c.id limit 12 loop
  v:=concat_ws(' ',case when btrim(x.intent)<>'' then 'Intent: '||btrim(x.intent) end,case when btrim(x.must_do)<>'' then 'Must do: '||btrim(x.must_do) end,case when btrim(x.what_we_stop)<>'' then 'We will stop: '||btrim(x.what_we_stop) end);
  if v='' or private.discover_has_name(v,names) then continue; end if;
  refs:=private.rp_add(refs,'i','Commander''s Intent card for the Vision Outcome: '||left(x.otitle,100),v,'intent_card',x.id,v,false,null,false);
 end loop;
 for x in select f.id,f.text from private.first_steps f join private.intent_cards c on c.id=f.card_id and c.engagement_id=f.engagement_id and not c.deleted
   where f.engagement_id=p_engagement and not f.deleted order by c.created_at,f.position,f.id limit 30 loop
  if private.discover_has_name(x.text,names) then continue; end if;
  refs:=private.rp_add(refs,'s','First step',x.text,'first_step',x.id,x.text,false,null,false);
 end loop;
 for x in select g.id,g.title,g.result from private.goals g where g.engagement_id=p_engagement and not g.deleted order by g.position,g.id limit 20 loop
  v:=x.title||case when btrim(x.result)<>'' then ': '||x.result else '' end;
  if private.discover_has_name(v,names) then continue; end if;
  refs:=private.rp_add(refs,'g','1-year goal',v,'goal',x.id,v,false,null,false);
 end loop;
 for x in select d.id,d.subject_label,d.decision,d.reasons from private.decisions d where d.engagement_id=p_engagement and not d.deleted order by d.marked_at,d.id limit 20 loop
  v:=case when btrim(x.subject_label)<>'' then x.subject_label||': ' else '' end||x.decision||case when btrim(x.reasons)<>'' then '. '||x.reasons else '' end;
  if private.discover_has_name(v,names) then continue; end if;
  refs:=private.rp_add(refs,'d','Decision',v,'decision',x.id,v,false,null,false);
 end loop;
 for x in select k.id,k.text from private.key_metrics k where k.engagement_id=p_engagement and not k.deleted and k.rank is not null order by k.rank,k.id limit 10 loop
  if private.discover_has_name(x.text,names) then continue; end if;
  refs:=private.rp_add(refs,'y','Success measure the team ranked',x.text,'key_metric',x.id,x.text,false,null,false);
 end loop;
 select coalesce(array_agg(distinct r.stage),array[]::text[]) into kept from private.visibility_plan_rows r where r.plan_id=pl.id and not r.deleted and (r.touched or r.reviewed_at is not null);
 return jsonb_build_object('plan_id',pl.id,'public',jsonb_build_object('moment',v_moment,'date',pl.public_date),'kept_stages',to_jsonb(kept),'refs',refs);
end $$;

-- ---------- The code checks on every row ----------
-- Why a row must be dropped, or null when it may stay. p_row is {stage, who, when, when_date, by, hear, risk}, already cleaned of dashes and semicolons.
-- p_cited is the refs the row cites, p_names the words of every name in the engagement and p_public the public date or null.
create function private.vp_check(p_row jsonb,p_cited jsonb,p_names text[],p_public date) returns text
language plpgsql stable security invoker set search_path='' as $$
declare f text; v text; w text; wt text:=btrim(coalesce(p_row->>'when','')); wd text:=btrim(coalesce(p_row->>'when_date','')); d date; lim integer;
begin
 if p_cited is null or jsonb_typeof(p_cited)<>'array' or jsonb_array_length(p_cited)=0 then return 'unsourced'; end if;
 if coalesce(p_row->>'stage','') not in ('lead_pastor','participants','board','staff','key_leaders','congregation') then return 'stage'; end if;
 if btrim(coalesce(p_row->>'who',''))='' or btrim(coalesce(p_row->>'hear',''))='' then return 'text'; end if;
 foreach f in array array['who','by','hear','risk'] loop
  v:=btrim(coalesce(p_row->>f,''));
  lim:=case f when 'who' then 200 when 'by' then 200 when 'hear' then 600 else 400 end;
  if length(v)>lim then return 'text'; end if;
  if v<>'' then w:=private.report_check(v,p_cited,p_names); if w is not null then return w; end if; end if;
 end loop;
 -- A when is blank unless there is a public date to work back from. With one, a date must be on or before it.
 if p_public is null then
  if wt<>'' or wd<>'' then return 'when'; end if;
 else
  if length(wt)>120 or private.screen_text(wt) or private.discover_has_name(wt,p_names) then return 'when'; end if;
  if wd<>'' then
   if wd !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return 'when'; end if;
   begin d:=wd::date; exception when others then return 'when'; end;
   if d>p_public then return 'when'; end if;
  end if;
 end if;
 return null;
end $$;

-- ---------- Draft the plan: the facilitator's press ----------
-- Drafts the plan from the records. Rows the facilitator touched or reviewed are kept, and the press asks first (status confirm) when there are any.
create function private.visibility_plan_start(p_engagement uuid,p_id uuid,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); pl private.visibility_plans; r private.visibility_plan_rounds; t timestamptz:=clock_timestamp(); ai boolean; v_kept integer; has_round boolean;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 ai:=coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement),'false')='true';
 if not ai then return jsonb_build_object('status','ai_off'); end if;
 select * into r from private.visibility_plan_rounds where engagement_id=p_engagement and not deleted for update;
 has_round:=found;
 if has_round and r.request_id=p_id then return jsonb_build_object('status','duplicate','round',r.status); end if;
 if has_round and r.status in ('pending','drafting') and r.requested_at>t-interval '5 minutes' then return jsonb_build_object('status','busy'); end if;
 pl:=private.vp_plan(p_engagement);
 select count(*)::integer into v_kept from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and (x.touched or x.reviewed_at is not null);
 if v_kept>0 and not coalesce(p_confirm,false) then return jsonb_build_object('status','confirm','kept',v_kept); end if;
 update private.visibility_plans set status='drafting',error=null,dropped=0 where id=pl.id;
 if has_round then
  if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
  update private.visibility_plan_rounds set status='pending',request_id=p_id,requested_at=t,requested_by=private.clearway_user_id(),attempts=0,
   lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,last_kept=0,last_dropped=0 where id=r.id;
 else
  insert into private.visibility_plan_rounds(engagement_id,status,request_id,requested_at,requested_by,last_kept,last_dropped) values(p_engagement,'pending',p_id,t,private.clearway_user_id(),0,0);
 end if;
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The worker: due, claim, apply, fail ----------
create function private.visibility_plan_due(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.visibility_plan_rounds r where r.engagement_id=p_engagement and not r.deleted
  and ((r.status='pending' and (r.last_failed_at is null or r.last_failed_at<=clock_timestamp()-make_interval(secs=>10*greatest(r.attempts,1))))
   or (r.status='drafting' and r.lease_until<clock_timestamp())))
$$;

-- A plan the round left in Drafting goes back to what its rows say.
create function private.vp_unstick(p_plan uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.visibility_plans set status='empty' where id=p_plan and status='drafting';
 perform private.vp_settle(p_plan,true);
end $$;

create function private.visibility_plan_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.visibility_plan_rounds; pl private.visibility_plans; t timestamptz:=clock_timestamp(); v_inputs jsonb; v_run uuid; v_rows integer;
begin
 if p_engagement is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object'
  or coalesce(p_versions->>'draft_visibility_plan','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.visibility_plan_rounds where engagement_id=p_engagement and not deleted for update;
 if not found or r.status not in ('pending','drafting') then return jsonb_build_object('status','idle'); end if;
 if r.status='drafting' and r.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if r.status='pending' and r.last_failed_at is not null and r.last_failed_at>t-make_interval(secs=>10*greatest(r.attempts,1)) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from r.last_failed_at+make_interval(secs=>10*greatest(r.attempts,1))-t)*1000)::integer); end if;
 select * into pl from private.visibility_plans where engagement_id=p_engagement and not deleted;
 if not found then
  update private.visibility_plan_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','idle');
 end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=p_engagement and not e.deleted),'false')<>'true' then
  perform private.vp_unstick(pl.id);
  update private.visibility_plan_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','off');
 end if;
 if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
 v_inputs:=private.vp_inputs(p_engagement);
 if jsonb_array_length(v_inputs->'refs')=0 then
  -- The room recorded nothing the plan can rest on: the plan says so, or keeps the rows it has.
  select count(*)::integer into v_rows from private.visibility_plan_rows where plan_id=pl.id and not deleted;
  update private.visibility_plans set status=case when v_rows>0 then 'edited' else 'thin' end,error=null,dropped=0,drafted_at=t where id=pl.id;
  if v_rows>0 then perform private.vp_settle(pl.id,true); end if;
  update private.visibility_plan_rounds set status='ready',lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,attempts=0 where id=r.id;
  return jsonb_build_object('status','idle');
 end if;
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(p_engagement,null,'draft_visibility_plan',p_model,p_versions->>'draft_visibility_plan',v_inputs,t) returning id into v_run;
 update private.visibility_plan_rounds set status='drafting',lease_id=p_lease,lease_run=v_run,lease_until=t+interval '6 minutes' where id=r.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','draft_visibility_plan','prompt_version',p_versions->>'draft_visibility_plan','inputs',v_inputs);
end $$;

-- Keep a reply only under the rules that are code: see vp_check. A row rests on the sources of every ref it cites, up to eight. The rows come in the
-- outward order whatever order the model wrote them in. The rows the facilitator touched or reviewed stay, and so do the stages they hold: a new row for a
-- stage that already has one of those is not added. The untouched AI rows are replaced when at least one new row is kept.
create function private.visibility_plan_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.visibility_plan_rounds; pl private.visibility_plans; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; sn record; v_refs text[]; cited jsonb;
 names text[]; why text; srcs jsonb; reasons jsonb:='[]'::jsonb; good jsonb:='[]'::jsonb; g record; n_kept integer:=0; n_dropped integer:=0; n_skipped integer:=0; kept text[];
 v_row jsonb; ids uuid[]; ranks integer[]; idx integer; v_id uuid; n integer; s jsonb; reordered boolean:=false; last_rank integer:=0; v_live integer; rk integer; v_when_date date;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='draft_visibility_plan';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 perform private.discover_lock(run.engagement_id);
 select * into r from private.visibility_plan_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then return jsonb_build_object('status','stale'); end if;
 select * into pl from private.visibility_plans where id=(in_->>'plan_id')::uuid and engagement_id=run.engagement_id and not deleted for update;
 if not found then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.visibility_plan_rounds set status='ready',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  perform private.vp_unstick(pl.id);
  update private.visibility_plan_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 names:=private.report_names(run.engagement_id);
 select coalesce(array_agg(distinct x.stage),array[]::text[]) into kept from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and (x.touched or x.reviewed_at is not null);
 for sn in select e.value as v,e.ord from jsonb_array_elements(case when jsonb_typeof(p_output->'rows')='array' then p_output->'rows' else '[]'::jsonb end) with ordinality e(value,ord) where e.ord<=14 loop
  if jsonb_typeof(sn.v)<>'object' then continue; end if;
  v_row:=jsonb_build_object('stage',lower(btrim(coalesce(sn.v->>'stage',''))),'who',private.rp_clean(sn.v->>'who'),'when',private.rp_clean(sn.v->>'when'),
   'when_date',btrim(coalesce(sn.v->>'when_date','')),'by',private.rp_clean(sn.v->>'by'),'hear',private.rp_clean(sn.v->>'hear'),'risk',private.rp_clean(sn.v->>'risk'));
  if v_row->>'stage'=any(kept) then n_skipped:=n_skipped+1; continue; end if;
  select coalesce(array_agg(distinct lower(btrim(x#>>'{}'))),array[]::text[]) into v_refs from jsonb_array_elements(case when jsonb_typeof(sn.v->'refs')='array' then sn.v->'refs' else '[]'::jsonb end) x where jsonb_typeof(x)='string';
  select jsonb_agg(x.value order by x.ord) into cited from jsonb_array_elements(in_->'refs') with ordinality x(value,ord) where lower(x.value->>'ref')=any(v_refs);
  why:=private.vp_check(v_row,cited,names,pl.public_date);
  if why is not null then n_dropped:=n_dropped+1; reasons:=reasons||jsonb_build_array(jsonb_build_object('reason',why,'stage',v_row->>'stage')); continue; end if;
  select coalesce(jsonb_agg(z.value order by x.ord,z.ord),'[]'::jsonb) into srcs from jsonb_array_elements(cited) with ordinality x(value,ord) cross join lateral jsonb_array_elements(x.value->'sources') with ordinality z(value,ord);
  good:=good||jsonb_build_array(jsonb_build_object('row',v_row,'sources',srcs,'rank',private.vp_rank(v_row->>'stage')));
  n_kept:=n_kept+1;
 end loop;
 if n_kept>0 then
  for g in select e.value as v from jsonb_array_elements(good) e loop
   rk:=(g.v->>'rank')::integer;
   if rk<last_rank then reordered:=true; end if;
   last_rank:=rk;
  end loop;
  -- The untouched AI rows go, with their sources.
  update private.visibility_plan_sources set deleted=true where engagement_id=run.engagement_id and not deleted and row_id in (
   select x.id from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and x.origin='ai' and not x.touched and x.reviewed_at is null);
  update private.visibility_plan_rows set deleted=true where plan_id=pl.id and not deleted and origin='ai' and not touched and reviewed_at is null;
  select coalesce(array_agg(x.id order by x.position,x.id),array[]::uuid[]),coalesce(array_agg(private.vp_rank(x.stage) order by x.position,x.id),array[]::integer[]) into ids,ranks
   from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted;
  for g in select e.value as v from jsonb_array_elements(good) with ordinality e(value,ord) order by (e.value->>'rank')::integer,e.ord loop
   rk:=(g.v->>'rank')::integer;
   -- A new row goes after the last row that is not further out than it, so the rows the facilitator kept (and moved) keep their places.
   idx:=0;
   for i in 1..cardinality(ranks) loop if ranks[i]<=rk then idx:=i; end if; end loop;
   v_id:=gen_random_uuid();
   v_when_date:=nullif(g.v->'row'->>'when_date','')::date;
   insert into private.visibility_plan_rows(id,engagement_id,plan_id,position,stage,who,when_text,when_date,by_whom,what_they_hear,risk,origin,touched)
    values(v_id,run.engagement_id,pl.id,0,g.v->'row'->>'stage',g.v->'row'->>'who',coalesce(g.v->'row'->>'when',''),v_when_date,coalesce(g.v->'row'->>'by',''),g.v->'row'->>'hear',coalesce(g.v->'row'->>'risk',''),'ai',false);
   n:=0;
   for s in select e.value from jsonb_array_elements(g.v->'sources') e loop
    continue when s->>'excerpt' is null or length(btrim(s->>'excerpt'))=0 or n>=8;
    continue when exists(select 1 from private.visibility_plan_sources q where q.row_id=v_id and not q.deleted and q.kind=s->>'kind' and q.ref_id is not distinct from nullif(s->>'ref_id','')::uuid and q.excerpt=left(btrim(s->>'excerpt'),280));
    insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt,position) values(run.engagement_id,v_id,s->>'kind',nullif(s->>'ref_id','')::uuid,left(btrim(s->>'excerpt'),280),n);
    n:=n+1;
   end loop;
   ids:=ids[1:idx]||v_id||ids[idx+1:];
   ranks:=ranks[1:idx]||rk||ranks[idx+1:];
  end loop;
  update private.visibility_plan_rows x set position=o.ord from unnest(ids) with ordinality o(id,ord) where x.id=o.id;
 end if;
 update private.visibility_plans set status='drafted',error=null,dropped=n_dropped,ai_run=run.id,drafted_at=t where id=pl.id;
 perform private.vp_settle(pl.id,false);
 select count(*)::integer into v_live from private.visibility_plan_rows where plan_id=pl.id and not deleted;
 if v_live=0 then
  update private.visibility_plans set status=case when n_dropped>0 then 'needs_attention' else 'thin' end where id=pl.id;
 elsif n_dropped>0 then
  update private.visibility_plans set status='needs_attention' where id=pl.id and status<>'reviewed';
 end if;
 update private.ai_runs set status='ok',changed=n_kept>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'kept',n_kept,'dropped',n_dropped,'skipped',n_skipped,'reordered',reordered,'refused',reasons),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.visibility_plan_rounds set status='ready',attempts=0,lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,
  last_ok_at=t,last_kept=n_kept,last_dropped=n_dropped where id=r.id;
 return jsonb_build_object('status','ok','kept',n_kept,'dropped',n_dropped,'skipped',n_skipped);
end $$;

-- One more try after a pause, then the plan is marked Needs attention with a plain error, and the facilitator adds rows by hand or presses Draft the plan again.
create function private.visibility_plan_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.visibility_plan_rounds; t timestamptz:=clock_timestamp(); v_ms integer:=private.ai_usage(p_usage,'ms',600000)::integer; gave_up boolean;
begin
 select * into run from private.ai_runs where id=p_run and job='draft_visibility_plan';
 if not found or p_lease is null then return jsonb_build_object('status','missing'); end if;
 select * into r from private.visibility_plan_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 gave_up:=r.attempts+1>=2;
 if gave_up then
  update private.visibility_plans set status='needs_attention',error='AI could not draft the plan' where engagement_id=run.engagement_id and not deleted;
  update private.visibility_plan_rounds set status='failed',attempts=0,lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 else
  update private.visibility_plan_rounds set status='pending',attempts=attempts+1,lease_id=null,lease_run=null,lease_until=null,last_failed_at=t,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 end if;
 return jsonb_build_object('status','ok','gave_up',gave_up);
end $$;

-- ---------- The editor ----------
-- The public moment and its date. A date of null takes it away.
create function private.visibility_plan_set(p_engagement uuid,p_moment text,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); pl private.visibility_plans; v_moment text:=btrim(regexp_replace(coalesce(p_moment,''),'\s+',' ','g'));
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if length(v_moment) not between 1 and 80 or (p_date is not null and p_date not between date '2020-01-01' and date '2100-12-31') then return jsonb_build_object('status','invalid_request'); end if;
 v_moment:=private.rp_clean(v_moment);
 if length(v_moment) not between 1 and 80 then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 pl:=private.vp_plan(p_engagement);
 if pl.moment=v_moment and pl.public_date is not distinct from p_date then return jsonb_build_object('status','unchanged'); end if;
 update private.visibility_plans set moment=v_moment,public_date=p_date where id=pl.id;
 return jsonb_build_object('status','ok');
end $$;

-- Change cells of a row in place. p_patch holds any of stage, who, when_text, when_date (a date or null), by_whom, what_they_hear and risk. An edited row is touched,
-- keeps its sources and needs reviewing again.
create function private.visibility_plan_row_edit(p_engagement uuid,p_row uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); x private.visibility_plan_rows; k text; v text; n_stage text; n_who text; n_when text; n_date date; n_by text; n_hear text; n_risk text; n_keys integer:=0;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_row is null or jsonb_typeof(p_patch) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 for k in select e.key from jsonb_each(p_patch) e loop
  if k not in ('stage','who','when_text','when_date','by_whom','what_they_hear','risk') then return jsonb_build_object('status','invalid_request'); end if;
  n_keys:=n_keys+1;
 end loop;
 if n_keys=0 then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into x from private.visibility_plan_rows where id=p_row and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 n_stage:=x.stage; n_who:=x.who; n_when:=x.when_text; n_date:=x.when_date; n_by:=x.by_whom; n_hear:=x.what_they_hear; n_risk:=x.risk;
 if p_patch ? 'stage' then
  n_stage:=p_patch->>'stage';
  if n_stage is null or n_stage not in ('lead_pastor','participants','board','staff','key_leaders','congregation','other') then return jsonb_build_object('status','invalid_request'); end if;
 end if;
 if p_patch ? 'who' then n_who:=private.rp_clean(p_patch->>'who'); if length(n_who) not between 1 and 200 then return jsonb_build_object('status','invalid_request'); end if; end if;
 if p_patch ? 'when_text' then n_when:=private.rp_clean(p_patch->>'when_text'); if length(n_when)>120 then return jsonb_build_object('status','invalid_request'); end if; end if;
 if p_patch ? 'when_date' then
  if jsonb_typeof(p_patch->'when_date')='null' or coalesce(btrim(p_patch->>'when_date'),'')='' then n_date:=null;
  else
   v:=btrim(p_patch->>'when_date');
   if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('status','invalid_request'); end if;
   begin n_date:=v::date; exception when others then return jsonb_build_object('status','invalid_request'); end;
   if n_date not between date '2020-01-01' and date '2100-12-31' then return jsonb_build_object('status','invalid_request'); end if;
  end if;
 end if;
 if p_patch ? 'by_whom' then n_by:=private.rp_clean(p_patch->>'by_whom'); if length(n_by)>200 then return jsonb_build_object('status','invalid_request'); end if; end if;
 if p_patch ? 'what_they_hear' then n_hear:=private.rp_clean(p_patch->>'what_they_hear'); if length(n_hear)>600 then return jsonb_build_object('status','invalid_request'); end if; end if;
 if p_patch ? 'risk' then n_risk:=private.rp_clean(p_patch->>'risk'); if length(n_risk)>400 then return jsonb_build_object('status','invalid_request'); end if; end if;
 if n_stage=x.stage and n_who=x.who and n_when=x.when_text and n_date is not distinct from x.when_date and n_by=x.by_whom and n_hear=x.what_they_hear and n_risk=x.risk then return jsonb_build_object('status','unchanged'); end if;
 update private.visibility_plan_rows set stage=n_stage,who=n_who,when_text=n_when,when_date=n_date,by_whom=n_by,what_they_hear=n_hear,risk=n_risk,touched=true,reviewed_at=null,reviewed_by=null where id=x.id;
 perform private.vp_settle(x.plan_id,true);
 return jsonb_build_object('status','ok');
end $$;

-- Add a row by hand. p_row holds stage and who (required) and any of when_text, when_date, by_whom, what_they_hear and risk. It goes last and is the facilitator's own.
create function private.visibility_plan_row_add(p_engagement uuid,p_row jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); pl private.visibility_plans; v_stage text; v_who text; v_when text; v_date date; v_by text; v_hear text; v_risk text; v text; v_id uuid;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if jsonb_typeof(p_row) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 v_stage:=coalesce(p_row->>'stage','other'); v_who:=private.rp_clean(p_row->>'who'); v_when:=private.rp_clean(p_row->>'when_text'); v_by:=private.rp_clean(p_row->>'by_whom');
 v_hear:=private.rp_clean(p_row->>'what_they_hear'); v_risk:=private.rp_clean(p_row->>'risk');
 if v_stage not in ('lead_pastor','participants','board','staff','key_leaders','congregation','other') or length(v_who) not between 1 and 200 or length(v_when)>120 or length(v_by)>200 or length(v_hear)>600 or length(v_risk)>400
  then return jsonb_build_object('status','invalid_request'); end if;
 v:=btrim(coalesce(p_row->>'when_date',''));
 if v<>'' then
  if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('status','invalid_request'); end if;
  begin v_date:=v::date; exception when others then return jsonb_build_object('status','invalid_request'); end;
  if v_date not between date '2020-01-01' and date '2100-12-31' then return jsonb_build_object('status','invalid_request'); end if;
 end if;
 perform private.discover_lock(p_engagement);
 pl:=private.vp_plan(p_engagement);
 insert into private.visibility_plan_rows(engagement_id,plan_id,position,stage,who,when_text,when_date,by_whom,what_they_hear,risk,origin,touched)
  values(p_engagement,pl.id,coalesce((select max(x.position) from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted),0)+1,v_stage,v_who,v_when,v_date,v_by,v_hear,v_risk,'facilitator',true) returning id into v_id;
 perform private.vp_settle(pl.id,true);
 return jsonb_build_object('status','ok','id',v_id);
end $$;

create function private.visibility_plan_row_remove(p_engagement uuid,p_row uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); x private.visibility_plan_rows;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_row is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into x from private.visibility_plan_rows where id=p_row and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 update private.visibility_plan_sources set deleted=true where row_id=x.id and not deleted;
 update private.visibility_plan_rows set deleted=true where id=x.id;
 perform private.vp_settle(x.plan_id,true);
 return jsonb_build_object('status','ok');
end $$;

-- Move a row one place up or down. A moved row is the facilitator's choice, so it is touched and stays through a redraft.
create function private.visibility_plan_row_move(p_engagement uuid,p_row uuid,p_direction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); x private.visibility_plan_rows; ids uuid[]; i integer; j integer; tmp uuid;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_row is null or p_direction is null or p_direction not in ('up','down') then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into x from private.visibility_plan_rows where id=p_row and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select array_agg(y.id order by y.position,y.id) into ids from private.visibility_plan_rows y where y.plan_id=x.plan_id and not y.deleted;
 i:=array_position(ids,x.id);
 j:=case p_direction when 'up' then i-1 else i+1 end;
 if j<1 or j>cardinality(ids) then return jsonb_build_object('status','unchanged'); end if;
 tmp:=ids[i]; ids[i]:=ids[j]; ids[j]:=tmp;
 update private.visibility_plan_rows y set position=o.ord from unnest(ids) with ordinality o(id,ord) where y.id=o.id;
 update private.visibility_plan_rows set touched=true where id=x.id;
 perform private.vp_settle(x.plan_id,true);
 return jsonb_build_object('status','ok');
end $$;

create function private.visibility_plan_row_reviewed(p_engagement uuid,p_row uuid,p_reviewed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,true); x private.visibility_plan_rows; pl private.visibility_plans;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_row is null or p_reviewed is null then return jsonb_build_object('status','invalid_request'); end if;
 perform private.discover_lock(p_engagement);
 select * into x from private.visibility_plan_rows where id=p_row and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into pl from private.visibility_plans where id=x.plan_id;
 if pl.status='drafting' then return jsonb_build_object('status','busy'); end if;
 if p_reviewed then
  if x.reviewed_at is not null then return jsonb_build_object('status','unchanged'); end if;
  if x.origin='ai' and not private.vp_row_sourced(x.id) then return jsonb_build_object('status','unsourced'); end if;
  update private.visibility_plan_rows set reviewed_at=clock_timestamp(),reviewed_by=private.clearway_user_id() where id=x.id;
 else
  if x.reviewed_at is null then return jsonb_build_object('status','unchanged'); end if;
  update private.visibility_plan_rows set reviewed_at=null,reviewed_by=null where id=x.id;
 end if;
 perform private.vp_settle(x.plan_id,false);
 return jsonb_build_object('status','ok');
end $$;

-- ---------- The page's state ----------
create function private.visibility_plan_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,false); pl private.visibility_plans; rd private.visibility_plan_rounds; ai boolean; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 select * into pl from private.visibility_plans where engagement_id=p_engagement and not deleted;
 select * into rd from private.visibility_plan_rounds where engagement_id=p_engagement and not deleted;
 select coalesce(e.settings->>'ai_enabled','false')='true' into ai from public.engagements e where e.id=p_engagement;
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'ai',coalesce(ai,false),'lead',coalesce(private.is_lead(p_engagement),false),
  'report_draft',exists(select 1 from private.report_drafts d where d.engagement_id=p_engagement and not d.deleted),
  'plan',case when pl.id is not null then jsonb_build_object('id',pl.id,'moment',pl.moment,'public_date',pl.public_date,'status',pl.status,'error',pl.error,'dropped',pl.dropped,'drafted_at',pl.drafted_at) end,
  'round',case when rd.id is not null then jsonb_build_object('status',rd.status,'requested_at',rd.requested_at,'attempts',rd.attempts,'error',rd.last_error,'ok_at',rd.last_ok_at,'kept',rd.last_kept,'dropped',rd.last_dropped) end,
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'position',r.position,'stage',r.stage,'who',r.who,'when_text',r.when_text,'when_date',r.when_date,'by_whom',r.by_whom,
    'what_they_hear',r.what_they_hear,'risk',r.risk,'origin',r.origin,'touched',r.touched,'needs_source',r.origin='ai' and not private.vp_row_sourced(r.id),
    'reviewed',case when r.reviewed_at is not null then jsonb_build_object('at',r.reviewed_at,'by',(select u.name from public.clearway_users u where u.id=r.reviewed_by)) end,
    'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'ref_id',s.ref_id,'excerpt',s.excerpt,'room',false,'broken',not private.rp_source_live(p_engagement,s.kind,s.ref_id),'info',
      case when s.kind='record' then jsonb_build_object('label','Record','text',s.excerpt) else private.rp_source_info(p_engagement,s.kind,s.ref_id) end) order by s.position,s.id)
      from private.visibility_plan_sources s where s.row_id=r.id and not s.deleted),'[]'::jsonb)) order by r.position,r.id)
    from private.visibility_plan_rows r where r.plan_id=pl.id and not r.deleted),'[]'::jsonb)) into out;
 return out;
end $$;

-- ---------- The contract with the report (step 1 shipped a fixture; this is the real function) ----------
-- Rows of the visibility plan for the report's Make the Vision Visible section: the rows that are not deleted, in position order. when_text is the row's
-- words and its date together. sources is [{kind, ref_id, excerpt, room}].
create or replace function private.visibility_plan_for_report(p_engagement uuid)
returns table(row_id uuid,"position" integer,who text,when_text text,by_whom text,what_they_hear text,risk text,reviewed boolean,sources jsonb)
language sql stable security definer set search_path='' as $$
 select r.id,r.position,r.who,nullif(concat_ws(', ',nullif(btrim(r.when_text),''),private.rp_date(r.when_date)),''),nullif(btrim(r.by_whom),''),nullif(btrim(r.what_they_hear),''),nullif(btrim(r.risk),''),
  r.reviewed_at is not null,
  coalesce((select jsonb_agg(jsonb_build_object('kind',s.kind,'ref_id',s.ref_id,'excerpt',s.excerpt,'room',false) order by s.position,s.id) from private.visibility_plan_sources s where s.row_id=r.id and not s.deleted),'[]'::jsonb)
 from private.visibility_plan_rows r join private.visibility_plans p on p.id=r.plan_id and p.engagement_id=r.engagement_id and not p.deleted
 where r.engagement_id=p_engagement and not r.deleted order by r.position,r.id
$$;

-- ---------- Public entry points (invokers; every check is in the private functions) ----------
create function public.visibility_plan_state(p_engagement uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.visibility_plan_state(p_engagement) $$;
create function public.visibility_plan_set(p_engagement uuid,p_moment text,p_date date) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_set(p_engagement,p_moment,p_date) $$;
create function public.visibility_plan_start(p_engagement uuid,p_id uuid,p_confirm boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_start(p_engagement,p_id,p_confirm) $$;
create function public.visibility_plan_row_edit(p_engagement uuid,p_row uuid,p_patch jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_row_edit(p_engagement,p_row,p_patch) $$;
create function public.visibility_plan_row_add(p_engagement uuid,p_row jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_row_add(p_engagement,p_row) $$;
create function public.visibility_plan_row_remove(p_engagement uuid,p_row uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_row_remove(p_engagement,p_row) $$;
create function public.visibility_plan_row_move(p_engagement uuid,p_row uuid,p_direction text) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_row_move(p_engagement,p_row,p_direction) $$;
create function public.visibility_plan_row_reviewed(p_engagement uuid,p_row uuid,p_reviewed boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_row_reviewed(p_engagement,p_row,p_reviewed) $$;
create function public.visibility_plan_due(p_engagement uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.visibility_plan_due(p_engagement) $$;
create function public.visibility_plan_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_claim(p_engagement,p_lease,p_model,p_versions) $$;
create function public.visibility_plan_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_apply(p_run,p_lease,p_output,p_usage) $$;
create function public.visibility_plan_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.visibility_plan_fail(p_run,p_lease,p_error,p_usage) $$;

-- ---------- Grants ----------
-- Nothing is callable by a browser or an anonymous caller unless it is listed below: every function this file made starts with its execute taken away.
do $grants$
declare f record;
begin
 for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='private' and (p.proname like 'vp\_%' or p.proname like 'visibility\_plan\_%'))
      or (n.nspname='public' and p.proname like 'visibility\_plan\_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 end loop;
end $grants$;
grant execute on function private.visibility_plan_state(uuid),private.visibility_plan_set(uuid,text,date),private.visibility_plan_start(uuid,uuid,boolean),private.visibility_plan_row_edit(uuid,uuid,jsonb),
 private.visibility_plan_row_add(uuid,jsonb),private.visibility_plan_row_remove(uuid,uuid),private.visibility_plan_row_move(uuid,uuid,text),private.visibility_plan_row_reviewed(uuid,uuid,boolean),
 public.visibility_plan_state(uuid),public.visibility_plan_set(uuid,text,date),public.visibility_plan_start(uuid,uuid,boolean),public.visibility_plan_row_edit(uuid,uuid,jsonb),
 public.visibility_plan_row_add(uuid,jsonb),public.visibility_plan_row_remove(uuid,uuid),public.visibility_plan_row_move(uuid,uuid,text),public.visibility_plan_row_reviewed(uuid,uuid,boolean) to authenticated;
grant execute on function private.visibility_plan_due(uuid),private.visibility_plan_claim(uuid,uuid,text,jsonb),private.visibility_plan_apply(uuid,uuid,jsonb,jsonb),private.visibility_plan_fail(uuid,uuid,text,jsonb),
 public.visibility_plan_due(uuid),public.visibility_plan_claim(uuid,uuid,text,jsonb),public.visibility_plan_apply(uuid,uuid,jsonb,jsonb),public.visibility_plan_fail(uuid,uuid,text,jsonb),
 private.visibility_plan_for_report(uuid),private.vp_inputs(uuid) to service_role;

-- ---------- The practice room's reset and Clear test answers ----------
-- Each is the newest definition (step 1's wrapper) renamed to _pre_visibility_plan and wrapped, so every earlier step's clearing stays in place whichever step
-- merges first. The practice reset puts away the plan, its rows, sources and round. Clear test answers puts away what a rehearsal made (the test rows).
create function private.vp_clear(p_engagement uuid,p_only_test boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 update private.visibility_plan_sources set deleted=true where engagement_id=p_engagement and not deleted and row_id in (
  select r.id from private.visibility_plan_rows r join private.visibility_plans p on p.id=r.plan_id where r.engagement_id=p_engagement and (not p_only_test or p.test));
 update private.visibility_plan_rows set deleted=true where engagement_id=p_engagement and not deleted and plan_id in (
  select p.id from private.visibility_plans p where p.engagement_id=p_engagement and (not p_only_test or p.test));
 update private.visibility_plans set deleted=true,status='empty',error=null where engagement_id=p_engagement and not deleted and (not p_only_test or test);
 update private.visibility_plan_rounds set deleted=true where engagement_id=p_engagement and not deleted and (not p_only_test or test);
end $$;

alter function private.reset_practice_room() rename to reset_practice_room_pre_visibility_plan;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_visibility_plan;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_pre_visibility_plan();
 if ok then perform private.vp_clear(eng,false); end if;
 return ok;
end $$;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.rehearsal_control_pre_visibility_plan(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement is not null and out->>'status'='ok' then perform private.vp_clear(p_engagement,true); end if;
 return out;
end $$;

revoke all on function private.vp_clear(uuid,boolean),private.reset_practice_room_pre_visibility_plan(),private.reset_practice_room(),private.rehearsal_control_pre_visibility_plan(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;

commit;
