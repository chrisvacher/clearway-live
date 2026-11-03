-- Milestone 3, step 6b: templates (SET-08) and the drag-to-build run of show (SET-07, pass 3
-- change 15). Live only, after merge and Chris's approval.
--
-- Shared changes (step 6b only, as the milestone 3 brief allows):
--  * private.show_write is redefined with every existing action, check and status kept
--    exactly, plus:
--      - save: a new session may carry "index" to land at that place in its part (a drop);
--        a session moved to another part by its Part setting goes to the end of that part.
--      - place: moves one session to a part and an index (dragging a row, or the keyboard).
--      - every change recalculates the planned starts in each part it touched from the
--        durations (change 15). A part starts at its first live session's planned start;
--        editing that start moves the whole part. Self-paced sessions keep their own times
--        and take no room time. A part with no times stays untimed.
-- Nothing else shared is redefined. show_read is unchanged.
begin;

-- ---------- Planned times from the durations ----------
-- The part's start: its first live session's planned start, or the earliest one set.
create function private.show_anchor(p_engagement uuid,p_part text) returns timestamptz
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select planned_start from public.sessions where engagement_id=p_engagement and part=p_part and not deleted and mode='live' order by position,id limit 1),
  (select min(planned_start) from public.sessions where engagement_id=p_engagement and part=p_part and not deleted and mode='live'))
$$;
-- A planned start worked out from the durations is not an edit: it keeps the session's
-- revision, so an open editor and a stale-editor check are unaffected. Only while
-- show_retime runs, and only when nothing but the planned start changed.
create function private.session_revision_keep() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_setting('cwl.retime',true)='on' and to_jsonb(new)-'planned_start'-'revision'-'updated_at'=to_jsonb(old)-'planned_start'-'revision'-'updated_at' then
  new.revision:=old.revision;
 end if;
 return new;
end $$;
-- Fires after session_revision (triggers run in name order).
create trigger session_revision_keep before update on public.sessions for each row execute function private.session_revision_keep();
-- Each live session starts when the one before it ends. Only changed rows are written.
create function private.show_retime(p_engagement uuid,p_part text,p_anchor timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_anchor is null or not isfinite(p_anchor) then return; end if;
 perform set_config('cwl.retime','on',true);
 update public.sessions s set planned_start=t.at from (
  select id,p_anchor+make_interval(mins=>coalesce(sum(planned_minutes) over(order by position,id rows between unbounded preceding and 1 preceding),0)::integer) as at
  from public.sessions where engagement_id=p_engagement and part=p_part and not deleted and mode='live') t
 where s.id=t.id and s.planned_start is distinct from t.at;
 perform set_config('cwl.retime','off',true);
end $$;
-- A part whose start was cleared goes back to untimed.
create function private.show_untime(p_engagement uuid,p_part text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform set_config('cwl.retime','on',true);
 update public.sessions set planned_start=null where engagement_id=p_engagement and part=p_part and not deleted and mode='live' and planned_start is not null;
 perform set_config('cwl.retime','off',true);
end $$;
-- The part's sessions in run-of-show order, and a new order written as positions 0 to n-1.
create function private.show_order(p_engagement uuid,p_part text) returns uuid[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(id order by position,id),array[]::uuid[]) from public.sessions where engagement_id=p_engagement and part=p_part and not deleted
$$;
create function private.show_set_order(p_engagement uuid,p_ids uuid[]) returns void
language sql security definer set search_path='' as $$
 update public.sessions x set position=t.ord-1 from unnest(p_ids) with ordinality t(id,ord) where x.id=t.id and x.engagement_id=p_engagement and x.position<>t.ord-1
$$;
-- p_ids with p_id placed at p_index (clamped to the list).
create function private.show_insert(p_ids uuid[],p_id uuid,p_index integer) returns uuid[]
language sql immutable security definer set search_path='' as $$
 with rest as (select array_remove(coalesce(p_ids,array[]::uuid[]),p_id) as a),
  at as (select greatest(0,least(coalesce(p_index,cardinality(a)),cardinality(a))) as i,a from rest)
 select coalesce(a[1:i],array[]::uuid[])||p_id||coalesce(a[i+1:cardinality(a)],array[]::uuid[]) from at
$$;

-- ---------- Run of show (redefined: index, place and recalculated times) ----------
create or replace function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; saved public.sessions; requested public.sessions; k private.interaction_kinds; sid uuid; notes text; ids uuid[]; n integer; entry jsonb; opts jsonb; anon boolean;
 anchors jsonb; touched text[]:=array[]::text[]; target text; idx integer; reanchor boolean:=false; p text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if jsonb_typeof(p_input) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 -- Each part's start before this change, so a drop, a move or a removal keeps the day's start.
 select jsonb_object_agg(x,private.show_anchor(p_engagement,x)) into anchors from unnest(array['Pre-call','Day 1','Day 2','Follow-up']) x;
 if p_action='reorder' then
  if p_input->>'part' not in ('Pre-call','Day 1','Day 2','Follow-up') or jsonb_typeof(p_input->'order') is distinct from 'array' then return jsonb_build_object('status','invalid_request'); end if;
  select array_agg((v->>'id')::uuid order by ord) into ids from jsonb_array_elements(p_input->'order') with ordinality t(v,ord);
  select count(*) into n from public.sessions where engagement_id=p_engagement and part=p_input->>'part' and not deleted;
  if coalesce(cardinality(ids),0)<>n or (select count(distinct v) from unnest(ids)v)<>n then return jsonb_build_object('status','conflict'); end if;
  for entry in select v from jsonb_array_elements(p_input->'order')v loop
   if not exists(select 1 from public.sessions where id=(entry->>'id')::uuid and engagement_id=p_engagement and part=p_input->>'part'
     and not deleted and revision=(entry->>'revision')::integer) then return jsonb_build_object('status','conflict'); end if;
  end loop;
  update public.sessions x set position=t.ord-1 from unnest(ids) with ordinality t(id,ord) where x.id=t.id;
  touched:=array[p_input->>'part'];
 elsif p_action='place' then
  -- One session to a part and an index: a dragged row, or the keyboard's Move.
  sid:=(p_input->>'id')::uuid; target:=p_input->>'part';
  if sid is null or target is null or target not in ('Pre-call','Day 1','Day 2','Follow-up') or jsonb_typeof(p_input->'index') is distinct from 'number' then return jsonb_build_object('status','invalid_request'); end if;
  idx:=(p_input->>'index')::integer;
  if idx<0 then return jsonb_build_object('status','invalid_request'); end if;
  select * into s from public.sessions where id=sid for update;
  if not found or s.engagement_id<>p_engagement or s.deleted or (p_input->>'revision')::integer is distinct from s.revision then return jsonb_build_object('status','conflict'); end if;
  if s.part<>target then update public.sessions set part=target where id=sid; end if;
  perform private.show_set_order(p_engagement,private.show_insert(private.show_order(p_engagement,target),sid,idx));
  if s.part<>target then perform private.show_set_order(p_engagement,private.show_order(p_engagement,s.part)); end if;
  touched:=array[s.part,target];
  select * into saved from public.sessions where id=sid;
 elsif p_action in ('save','remove') then
  sid:=(p_input->>'id')::uuid;
  if sid is null then return jsonb_build_object('status','invalid_request'); end if;
  select * into s from public.sessions where id=sid for update;
  if found then
   if s.engagement_id<>p_engagement or s.deleted or (p_input->>'revision')::integer is distinct from s.revision then return jsonb_build_object('status','conflict'); end if;
  elsif p_action='remove' or p_input->>'revision' is not null then return jsonb_build_object('status','conflict'); end if;
  if p_action='remove' then
   if s.id=r.live_session_id or s.state in ('live','phones_down','open') then return jsonb_build_object('status','running'); end if;
   update public.sessions set deleted=true where id=sid;
   update private.session_notes set deleted=true where session_id=sid;
   touched:=array[s.part];
  else
   requested:=jsonb_populate_record(null::public.sessions,p_input-'options'-'index');
   notes:=p_input->>'notes';
   k:=private.kind(requested.interaction);
   opts:=private.session_options(requested.interaction,coalesce(p_input->'options','{}'::jsonb),p_engagement);
   anon:=case when jsonb_typeof(requested.settings->'anonymous')='boolean' then (requested.settings->>'anonymous')::boolean end;
   if requested.title is null or length(btrim(requested.title)) not between 1 and 200 or requested.part is null or requested.part not in ('Pre-call','Day 1','Day 2','Follow-up')
    or requested.mode is null or requested.mode not in ('live','self_paced') or k.kind is null or opts is null
    or requested.state is null or requested.state not in ('draft','ready','open','live','phones_down','closed')
    or requested.prompt is null or length(requested.prompt)>4000 or requested.phone_depth is null or length(requested.phone_depth)>20000
    or notes is null or length(notes)>30000 or length(btrim(coalesce(requested.segment,'')))>100 or requested.lands_in is null or length(requested.lands_in)>200
    or requested.planned_minutes is null or requested.planned_minutes not between 1 and 1440
    or requested.max_sends is null or requested.max_sends not between 1 and 100
    or requested.max_characters is null or requested.max_characters not between 1 and 280
    or requested.max_words is null or requested.max_words not between 1 and 50
    or requested.settings is null or anon is null or (k.named='never' and not anon) or (k.named='always' and anon)
    or requested.settings->'burst_minutes' is null or requested.settings->'burst_minutes' not in ('3'::jsonb,'4'::jsonb,'5'::jsonb)
    or jsonb_typeof(requested.settings->'join_strip') is distinct from 'boolean'
    or (requested.planned_start is not null and not isfinite(requested.planned_start))
    or (requested.opens_at is not null and not isfinite(requested.opens_at)) or (requested.closes_at is not null and not isfinite(requested.closes_at))
    or (requested.mode='self_paced' and (requested.opens_at is null or requested.closes_at is null or requested.opens_at>=requested.closes_at))
    or (p_input ? 'index' and (jsonb_typeof(p_input->'index') is distinct from 'number' or (p_input->>'index')::integer<0))
   then return jsonb_build_object('status','invalid_request'); end if;
   if (s.id is null and requested.state not in ('draft','ready'))
     or (s.state in ('draft','ready') and requested.state not in ('draft','ready'))
     or (s.state not in ('draft','ready') and requested.state<>s.state) then return jsonb_build_object('status','invalid_state'); end if;
   if s.id is not null and (s.id=r.live_session_id or s.state in ('live','phones_down','open') or exists(select 1 from public.submissions where session_id=sid and not deleted))
    and (requested.interaction<>s.interaction or requested.mode<>s.mode) then return jsonb_build_object('status','running'); end if;
   if opts ? 'media' and not exists(select 1 from private.session_media where id=(opts->>'media')::uuid and session_id=sid and not deleted) then return jsonb_build_object('status','invalid_request'); end if;
   if s.id is null then
    insert into public.sessions(id,engagement_id,segment,title,part,position,planned_start,planned_minutes,mode,opens_at,closes_at,interaction,prompt,phone_depth,state,max_sends,max_characters,max_words,settings,options,lands_in)
    values(sid,p_engagement,btrim(coalesce(requested.segment,'')),btrim(requested.title),requested.part,coalesce((select max(position)+1 from public.sessions where engagement_id=p_engagement and not deleted),0),requested.planned_start,requested.planned_minutes,requested.mode,requested.opens_at,requested.closes_at,requested.interaction,requested.prompt,requested.phone_depth,requested.state,requested.max_sends,requested.max_characters,requested.max_words,
    jsonb_build_object('anonymous',anon,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),opts,requested.lands_in) returning * into saved;
    -- A drop lands where the gap opened.
    if p_input ? 'index' then perform private.show_set_order(p_engagement,private.show_insert(private.show_order(p_engagement,requested.part),sid,(p_input->>'index')::integer)); end if;
    touched:=array[requested.part];
   else
    update public.sessions set segment=btrim(coalesce(requested.segment,'')),title=btrim(requested.title),part=requested.part,planned_start=requested.planned_start,planned_minutes=requested.planned_minutes,mode=requested.mode,opens_at=requested.opens_at,closes_at=requested.closes_at,interaction=requested.interaction,prompt=requested.prompt,phone_depth=requested.phone_depth,state=requested.state,max_sends=requested.max_sends,max_characters=requested.max_characters,max_words=requested.max_words,
    settings=jsonb_build_object('anonymous',anon,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),options=opts,lands_in=requested.lands_in,
    position=case when requested.part<>s.part then coalesce((select max(position)+1 from public.sessions where engagement_id=p_engagement and part=requested.part and not deleted),0) else position end
    where id=sid returning * into saved;
    touched:=array[s.part,requested.part];
    -- Editing the start of a part's first live session moves the whole part.
    reanchor:=requested.part=s.part and requested.mode='live' and requested.planned_start is distinct from s.planned_start
     and sid=(select id from public.sessions where engagement_id=p_engagement and part=requested.part and not deleted and mode='live' order by position,id limit 1);
   end if;
   insert into private.session_notes(session_id,engagement_id,notes) values(sid,p_engagement,notes)
    on conflict(session_id) do update set notes=excluded.notes,deleted=false;
  end if;
 else return jsonb_build_object('status','invalid_request'); end if;
 -- Times recalculate from the durations in every part this change touched.
 foreach p in array (select array_agg(distinct x) from unnest(touched) x) loop
  if reanchor and p=saved.part then
   if saved.planned_start is null then perform private.show_untime(p_engagement,p); else perform private.show_retime(p_engagement,p,saved.planned_start); end if;
  else perform private.show_retime(p_engagement,p,coalesce((anchors->>p)::timestamptz,private.show_anchor(p_engagement,p))); end if;
 end loop;
 if sid is not null and p_action<>'remove' then select * into saved from public.sessions where id=sid; end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 return jsonb_build_object('status','ok','id',sid,'revision',saved.revision);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation or foreign_key_violation then
 return jsonb_build_object('status','invalid_request');
end $$;

-- ---------- Templates (SET-08) ----------
-- A template is a saved run of show (PRD "Templates"): each session's part, place, title,
-- interaction, prompt, phone depth, settings, options, timing and presenter notes. Times are
-- kept as minutes from the template's first start, so a template starts on any date.
-- Answers, attendees, dates and room state are never kept.
create table private.templates (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(btrim(name)) between 1 and 120 and name=btrim(name)),
 description text not null default '' check(length(description)<=500),
 kind text not null default 'saved' check(kind in ('shipped','saved')),
 shared boolean not null default true,
 created_by uuid references public.clearway_users(id),
 source_engagement_id uuid references public.engagements(id),
 sessions jsonb not null check(jsonb_typeof(sessions)='array' and jsonb_array_length(sessions) between 1 and 500 and pg_column_size(sessions)<=8388608),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 check(kind='shipped' or created_by is not null)
);
create index templates_created_by_idx on private.templates(created_by);
create index templates_source_idx on private.templates(source_engagement_id);
alter table private.templates enable row level security;
alter table private.templates force row level security;
revoke all on private.templates from public,anon,authenticated;
grant select,insert,update,delete on private.templates to service_role;
create trigger touch_record before update on private.templates for each row execute function private.touch_live_record('id');

-- Who sees a template: the ones that ship with the app, the ones shared with the Clearway
-- team, a facilitator's own, and every one for an admin.
create function private.template_visible(p_template private.templates) returns boolean
language sql stable security definer set search_path='' as $$
 select not p_template.deleted and (select private.clearway_user_id()) is not null
  and (p_template.kind='shipped' or p_template.shared or p_template.created_by=(select private.clearway_user_id()) or (select private.is_admin()))
$$;
create function private.template_public(p_template private.templates) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p_template.id,'name',p_template.name,'description',p_template.description,'kind',p_template.kind,'shared',p_template.shared,
  'mine',p_template.created_by is not null and p_template.created_by=(select private.clearway_user_id()),
  'can_remove',p_template.kind='saved' and (p_template.created_by=(select private.clearway_user_id()) or (select private.is_admin())),
  'by',(select u.name from public.clearway_users u where u.id=p_template.created_by),'created_at',p_template.created_at,
  'count',jsonb_array_length(p_template.sessions),
  'minutes',(select coalesce(sum((e->>'planned_minutes')::integer),0) from jsonb_array_elements(p_template.sessions) e where e->>'mode'='live'),
  'sessions',(select coalesce(jsonb_agg(jsonb_build_object('title',e->>'title','part',e->>'part','interaction',e->>'interaction','screen',e->'options'->>'screen',
     'planned_minutes',(e->>'planned_minutes')::integer,'mode',e->>'mode','state',e->>'state') order by private.part_order(e->>'part'),(e->>'position')::integer,n),'[]'::jsonb)
    from jsonb_array_elements(p_template.sessions) with ordinality t(e,n)))
$$;

create function private.template_read() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); admin boolean:=coalesce(private.is_admin(),false);
begin
 if me is null then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok',
  'templates',coalesce((select jsonb_agg(private.template_public(t) order by t.kind='saved',t.name,t.id) from private.templates t where private.template_visible(t)),'[]'::jsonb),
  -- Where a template can start: open engagements this facilitator runs (every one for an admin).
  'engagements',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'church',c.name,'timezone',c.timezone,'type',e.type,
     'sessions',(select count(*) from public.sessions s where s.engagement_id=e.id and not s.deleted)) order by e.created_at desc,e.id)
   from (select * from public.engagements x where not x.deleted and x.status<>'closed' and (admin or private.can_facilitate(x.id)) order by x.created_at desc,x.id limit 200) e
   join public.churches c on c.id=e.church_id and not c.deleted),'[]'::jsonb));
end $$;

-- Save as template (any run of show), Remove template (your own), and Start an engagement
-- from a template (its sessions copied into the engagement, after any it already has).
create function private.template_write(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); eng uuid; t private.templates; tid uuid; v_name text; v_list jsonb; anchor timestamptz;
 e jsonb; k private.interaction_kinds; opts jsonb; anon boolean; sid uuid; mid uuid; v_mode text; v_start timestamptz; base timestamptz; v_count integer:=0; anchors jsonb; p text; v_state text;
begin
 if me is null then return jsonb_build_object('status','denied'); end if;
 if jsonb_typeof(p_input) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if p_action='save' then
  eng:=(p_input->>'engagement')::uuid; v_name:=btrim(regexp_replace(coalesce(p_input->>'name',''),'\s+',' ','g'));
  if eng is null or not coalesce(private.show_allowed(eng),false) then return jsonb_build_object('status','denied'); end if;
  if length(v_name) not between 1 and 120 or length(coalesce(p_input->>'description',''))>500 or jsonb_typeof(coalesce(p_input->'shared','true'::jsonb)) is distinct from 'boolean' then return jsonb_build_object('status','invalid_request'); end if;
  -- The template's start is its first live session (the time Start an engagement asks for);
  -- self-paced windows keep their place around it, before or after. Without live times,
  -- the first self-paced opening.
  select coalesce((select min(planned_start) from public.sessions where engagement_id=eng and not deleted and mode='live'),
   (select min(opens_at) from public.sessions where engagement_id=eng and not deleted and mode='self_paced')) into anchor;
  select jsonb_agg(jsonb_build_object('title',s.title,'part',s.part,'position',s.position,'segment',s.segment,'mode',s.mode,'interaction',s.interaction,
    'prompt',s.prompt,'phone_depth',s.phone_depth,'lands_in',s.lands_in,'notes',coalesce(n.notes,''),'planned_minutes',s.planned_minutes,
    'offset',case when s.planned_start is not null and anchor is not null then round(extract(epoch from s.planned_start-anchor)/60)::integer end,
    'opens',case when s.mode='self_paced' then round(extract(epoch from s.opens_at-anchor)/60)::integer end,
    'closes',case when s.mode='self_paced' then round(extract(epoch from s.closes_at-anchor)/60)::integer end,
    'settings',s.settings,'options',s.options-'media','media',s.options->'media','max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,
    'state',case when s.state='draft' then 'draft' else 'ready' end) order by private.part_order(s.part),s.position,s.id) into v_list
  from (select * from public.sessions where engagement_id=eng and not deleted order by private.part_order(part),position,id limit 501) s
  left join private.session_notes n on n.session_id=s.id and not n.deleted;
  if v_list is null then return jsonb_build_object('status','empty'); end if;
  if jsonb_array_length(v_list)>500 then return jsonb_build_object('status','too_large'); end if;
  insert into private.templates(name,description,kind,shared,created_by,source_engagement_id,sessions)
   values(v_name,btrim(coalesce(p_input->>'description','')),'saved',coalesce((p_input->>'shared')::boolean,true),me,eng,v_list) returning id into tid;
  return jsonb_build_object('status','ok','id',tid,'count',jsonb_array_length(v_list));
 elsif p_action='remove' then
  select * into t from private.templates where id=(p_input->>'template')::uuid for update;
  if not found or not private.template_visible(t) then return jsonb_build_object('status','missing'); end if;
  if t.kind<>'saved' or not (t.created_by=me or coalesce(private.is_admin(),false)) then return jsonb_build_object('status','denied'); end if;
  update private.templates set deleted=true where id=t.id;
  return jsonb_build_object('status','ok','id',t.id);
 elsif p_action='apply' then
  eng:=(p_input->>'engagement')::uuid;
  if eng is null then return jsonb_build_object('status','invalid_request'); end if;
  if eng='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(eng::text,7)); end if;
  perform 1 from public.room_states where engagement_id=eng and not deleted for update;
  if not found or not coalesce(private.show_allowed(eng),false) then return jsonb_build_object('status','denied'); end if;
  if exists(select 1 from public.engagements where id=eng and status='closed') then return jsonb_build_object('status','closed'); end if;
  select * into t from private.templates where id=(p_input->>'template')::uuid;
  if not found or not private.template_visible(t) then return jsonb_build_object('status','missing'); end if;
  if p_input->>'start' is not null then v_start:=(p_input->>'start')::timestamptz; if not isfinite(v_start) then return jsonb_build_object('status','invalid_request'); end if; end if;
  select jsonb_object_agg(x,private.show_anchor(eng,x)) into anchors from unnest(array['Pre-call','Day 1','Day 2','Follow-up']) x;
  base:=coalesce(v_start,date_trunc('minute',now()));
  for e in select v from jsonb_array_elements(t.sessions) with ordinality x(v,n) order by private.part_order(v->>'part'),(v->>'position')::integer,n loop
   k:=private.kind(e->>'interaction'); v_mode:=coalesce(e->>'mode','live');
   if k.kind is null or e->>'part' not in ('Pre-call','Day 1','Day 2','Follow-up') or v_mode not in ('live','self_paced') then return jsonb_build_object('status','invalid_request'); end if;
   opts:=private.session_options(k.kind,coalesce(e->'options','{}'::jsonb)-'media',eng);
   anon:=case when jsonb_typeof(e->'settings'->'anonymous')='boolean' then (e->'settings'->>'anonymous')::boolean end;
   if opts is null or anon is null or (k.named='never' and not anon) or (k.named='always' and anon) or length(coalesce(e->>'notes',''))>30000 then return jsonb_build_object('status','invalid_request'); end if;
   v_state:=case when e->>'state'='ready' then 'ready' else 'draft' end;
   sid:=gen_random_uuid();
   insert into public.sessions(id,engagement_id,segment,title,part,position,planned_start,planned_minutes,mode,opens_at,closes_at,interaction,prompt,phone_depth,state,max_sends,max_characters,max_words,settings,options,lands_in)
   values(sid,eng,btrim(coalesce(e->>'segment','')),btrim(e->>'title'),e->>'part',
    coalesce((select max(position)+1 from public.sessions where engagement_id=eng and part=e->>'part' and not deleted),0),
    case when v_mode='live' and v_start is not null and e->>'offset' is not null then v_start+make_interval(mins=>(e->>'offset')::integer) end,
    (e->>'planned_minutes')::integer,v_mode,
    case when v_mode='self_paced' then base+make_interval(mins=>coalesce((e->>'opens')::integer,0)) end,
    case when v_mode='self_paced' then base+make_interval(mins=>coalesce((e->>'closes')::integer,60)) end,
    k.kind,coalesce(e->>'prompt',''),coalesce(e->>'phone_depth',''),v_state,(e->>'max_sends')::integer,(e->>'max_characters')::integer,(e->>'max_words')::integer,
    jsonb_build_object('anonymous',anon,'burst_minutes',e->'settings'->'burst_minutes','join_strip',coalesce(e->'settings'->'join_strip','false'::jsonb)),opts,coalesce(e->>'lands_in',''));
   insert into private.session_notes(session_id,engagement_id,notes) values(sid,eng,coalesce(e->>'notes',''));
   -- An image or document page brings its image along as the new session's own copy.
   if k.kind='content' and e->>'media' is not null then
    mid:=null;
    insert into private.session_media(engagement_id,session_id,mime,width,height,data)
     select eng,sid,m.mime,m.width,m.height,m.data from private.session_media m where m.id=(e->>'media')::uuid returning id into mid;
    if mid is not null then update public.sessions set options=opts||jsonb_build_object('media',mid) where id=sid; end if;
   end if;
   v_count:=v_count+1;
  end loop;
  -- A part that already had sessions keeps its start; a new one starts at the template's time.
  foreach p in array array['Pre-call','Day 1','Day 2','Follow-up'] loop
   perform private.show_retime(eng,p,coalesce((anchors->>p)::timestamptz,private.show_anchor(eng,p),case when v_start is not null and exists(select 1 from public.sessions where engagement_id=eng and part=p and not deleted and mode='live') then v_start end));
  end loop;
  update public.room_states set results=private.live_results(eng) where engagement_id=eng;
  return jsonb_build_object('status','ok','engagement',eng,'count',v_count);
 end if;
 return jsonb_build_object('status','invalid_request');
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation or foreign_key_violation then
 return jsonb_build_object('status','invalid_request');
end $$;

create function public.template_read() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.template_read() $$;
create function public.template_write(p_action text,p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.template_write(p_action,p_input) $$;

-- ---------- The team workshop template (the Mentimeter replacement) ----------
-- Ninety minutes, entirely on phones and the TV, from the interaction library. Every prompt
-- and note is a starting point; the facilitator edits them for each team.
insert into private.templates(id,name,description,kind,shared,sessions) values('c1ea0000-0000-4000-8000-000000000001','Team workshop',
 'A 90-minute team workshop that runs entirely on phones and the TV. Prompts and notes are starting points.','shipped',true,$tpl$[
 {"title":"Screen check","part":"Day 1","position":0,"mode":"live","interaction":"content","offset":0,"planned_minutes":5,"state":"ready",
  "prompt":"","phone_depth":"","segment":"","lands_in":"","options":{"screen":"screen_check"},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Run this before the team arrives. Use the edge lines and the circle to fix overscan and aspect on the TV, then go to the welcome."},
 {"title":"Welcome","part":"Day 1","position":1,"mode":"live","interaction":"content","offset":5,"planned_minutes":5,"state":"ready",
  "prompt":"","phone_depth":"","segment":"","lands_in":"",
  "options":{"screen":"holding","outline":"Welcome and prayer\nCheck-in and one word\nWhat's working\nWhere to focus\nYour questions\nOur commitment"},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":true},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Put this up as people arrive. Ask everyone to join on their phone with the room link before you begin."},
 {"title":"Opening prayer","part":"Day 1","position":2,"mode":"live","interaction":"content","offset":10,"planned_minutes":5,"state":"ready",
  "prompt":"Let's begin in prayer.","phone_depth":"","segment":"","lands_in":"","options":{"screen":"prayer"},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Pray for the team and for the conversation ahead. Invite someone on the team to pray if that fits the room."},
 {"title":"Check-in","part":"Day 1","position":3,"mode":"live","interaction":"scale","offset":15,"planned_minutes":5,"state":"ready",
  "prompt":"How full is your tank this week?","phone_depth":"","segment":"","lands_in":"","options":{"max":5,"low":"Running on empty","high":"Full and ready"},
  "settings":{"anonymous":true,"burst_minutes":3,"join_strip":true},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"A quick read on the room, not a test. Name what you see in the spread before you move on."},
 {"title":"One word for this season","part":"Day 1","position":4,"mode":"live","interaction":"word_cloud","offset":20,"planned_minutes":10,"state":"ready",
  "prompt":"In one word, how would you describe this season for our team?","phone_depth":"","segment":"","lands_in":"","options":{},
  "settings":{"anonymous":true,"burst_minutes":3,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Let the cloud fill for a minute or two. Ask about the biggest words first, then the surprising small ones."},
 {"title":"What's working","part":"Day 1","position":5,"mode":"live","interaction":"wall","offset":30,"planned_minutes":15,"state":"ready",
  "prompt":"What's working on our team that we should protect?","phone_depth":"","segment":"","lands_in":"","options":{},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":280,"max_words":50,
  "notes":"Give people four minutes to write. Read a few cards aloud and ask the team what they notice."},
 {"title":"Where to focus","part":"Day 1","position":6,"mode":"live","interaction":"points","offset":45,"planned_minutes":15,"state":"ready",
  "prompt":"Spend 100 points on where our team should focus in the next season.","phone_depth":"","segment":"","lands_in":"",
  "options":{"items":[{"key":"o1","text":"Clearer communication"},{"key":"o2","text":"Shared priorities"},{"key":"o3","text":"Raising new leaders"},{"key":"o4","text":"Caring for each other"},{"key":"o5","text":"Better meetings"}],"cut":3},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Edit the five options to fit this team before the workshop. Everyone places all 100 points. Look at the top three above the line, then ask what the spread tells us."},
 {"title":"Effort and impact","part":"Day 1","position":7,"mode":"live","interaction":"grid","offset":60,"planned_minutes":10,"state":"ready",
  "prompt":"Place each focus area by the effort it takes and the impact it would have.","phone_depth":"","segment":"","lands_in":"",
  "options":{"preset":"custom","x_label":"Effort","x_low":"Low","x_high":"High","y_label":"Impact","y_low":"Low","y_high":"High","legend":"Focus areas",
   "items":[{"key":"i1","text":"Clearer communication"},{"key":"i2","text":"Shared priorities"},{"key":"i3","text":"Raising new leaders"},{"key":"i4","text":"Caring for each other"},{"key":"i5","text":"Better meetings"}]},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Use the same items as Where to focus. Start the conversation with what sits high on impact and low on effort."},
 {"title":"Your questions","part":"Day 1","position":8,"mode":"live","interaction":"qa","offset":70,"planned_minutes":10,"state":"ready",
  "prompt":"What questions do you have for each other or for us?","phone_depth":"","segment":"","lands_in":"","options":{"any_time":false},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":10,"max_characters":200,"max_words":50,
  "notes":"Answer the top questions together. Mark each one Answered as you go, and follow up on the rest after the workshop."},
 {"title":"Our commitment","part":"Day 1","position":9,"mode":"live","interaction":"sign","offset":80,"planned_minutes":5,"state":"ready",
  "prompt":"Sign our shared commitment","phone_depth":"","segment":"","lands_in":"",
  "options":{"text":"## What we commit to\nWe'll protect what's working on our team.\nWe'll give our best energy to the priorities we chose today.\nWe'll speak up when something isn't working, and listen when others do.\nWe'll pray for each other by name this season."},
  "settings":{"anonymous":false,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Shape the commitment with the team before you open signing. Read it aloud once, then invite everyone to sign."},
 {"title":"Sending prayer","part":"Day 1","position":10,"mode":"live","interaction":"content","offset":85,"planned_minutes":5,"state":"ready",
  "prompt":"Go in peace.","phone_depth":"","segment":"","lands_in":"","options":{"screen":"prayer"},
  "settings":{"anonymous":true,"burst_minutes":4,"join_strip":false},"max_sends":3,"max_characters":28,"max_words":3,
  "notes":"Close by praying over the commitment and the people who signed it."}
]$tpl$::jsonb) on conflict(id) do nothing;

revoke all on function private.session_revision_keep(),private.show_anchor(uuid,text),private.show_retime(uuid,text,timestamptz),private.show_untime(uuid,text),private.show_order(uuid,text),
 private.show_set_order(uuid,uuid[]),private.show_insert(uuid[],uuid,integer),
 private.template_visible(private.templates),private.template_public(private.templates),private.template_read(),private.template_write(text,jsonb),
 public.template_read(),public.template_write(text,jsonb) from public,anon,authenticated;
grant execute on function private.template_read(),private.template_write(text,jsonb),public.template_read(),public.template_write(text,jsonb) to authenticated;
commit;
