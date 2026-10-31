-- Milestone 2, PR 2: private run of show editing and print reads.
-- Apply only to Live, after merge. No data is seeded or made live.
begin;
alter table public.sessions
 add column revision integer not null default 0 check(revision>=0),
 add column settings jsonb not null default '{"anonymous":true,"burst_minutes":4,"join_strip":false}'
   check(jsonb_typeof(settings)='object' and settings ?& array['anonymous','burst_minutes','join_strip'] and settings->'anonymous'='true'::jsonb
     and settings->'burst_minutes' in ('3'::jsonb,'4'::jsonb,'5'::jsonb) and jsonb_typeof(settings->'join_strip')='boolean'),
 add column opens_at timestamptz check(opens_at is null or isfinite(opens_at)),
 add column closes_at timestamptz check(closes_at is null or isfinite(closes_at)),
 add column lands_in text not null default '' check(length(lands_in)<=200),
 add constraint sessions_window check(mode<>'self_paced' or (opens_at is not null and closes_at is not null and opens_at<closes_at));

create function private.session_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revision:=old.revision+1; return new; end $$;
create trigger session_revision before update on public.sessions for each row execute function private.session_revision();
revoke all on function private.session_revision() from public,anon,authenticated;

create function private.show_allowed(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select ((select private.is_admin()) or (select private.can_facilitate(p_engagement))) and exists(
   select 1 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and not c.deleted)
$$;
create function private.show_version(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(coalesce((select string_agg(s.id::text||':'||s.revision::text,',' order by s.id) from public.sessions s where s.engagement_id=e.id and not s.deleted),'')
   ||e.base_year::text||c.timezone||e.title||c.name||e.status)
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement
$$;
create function private.show_read(p_engagement uuid,p_after uuid,p_version text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare version text; page jsonb; next_id uuid;
begin
 if not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 version:=private.show_version(p_engagement);
 if p_version is not null and version<>p_version then return jsonb_build_object('status','changed'); end if;
 if p_after is not null and p_version is null then return jsonb_build_object('status','invalid_request'); end if;
 select coalesce(jsonb_agg(to_jsonb(rows) order by id),'[]'::jsonb) into page from (
   select s.id,s.engagement_id,s.title,s.part,s.position,s.planned_start,s.planned_minutes,s.mode,s.opens_at,s.closes_at,s.interaction,
     s.prompt,s.phone_depth,s.settings,s.lands_in,s.state,s.max_sends,s.max_characters,s.max_words,s.revision,coalesce(n.notes,'') as notes
   from public.sessions s left join private.session_notes n on n.session_id=s.id and not n.deleted
   where s.engagement_id=p_engagement and not s.deleted and (p_after is null or s.id>p_after) order by s.id limit 501
 ) rows;
 if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
 return jsonb_build_object('status','ok','version',version,'sessions',page,'next',next_id,'context',(
  select jsonb_build_object('id',e.id,'title',e.title,'church',c.name,'timezone',c.timezone,'base_year',e.base_year,'closed',e.status='closed')
  from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement));
end $$;

create function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; saved public.sessions; requested public.sessions; sid uuid; notes text; ids uuid[]; n integer; entry jsonb;
begin
 -- All writers use reset -> room -> session lock order. Recheck native access after waiting.
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if jsonb_typeof(p_input) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
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
  else
   -- Populate only known, validated columns. Client never supplies position, room, audit or closed_at.
   requested:=jsonb_populate_record(null::public.sessions,p_input);
   notes:=p_input->>'notes';
   if requested.title is null or length(btrim(requested.title)) not between 1 and 200 or requested.part is null or requested.part not in ('Pre-call','Day 1','Day 2','Follow-up')
    or requested.mode is null or requested.mode not in ('live','self_paced') or requested.interaction is null or requested.interaction not in ('word_cloud','wall','content')
    or requested.state is null or requested.state not in ('draft','ready','open','live','phones_down','closed')
    or requested.prompt is null or length(requested.prompt)>4000 or requested.phone_depth is null or length(requested.phone_depth)>20000
    or notes is null or length(notes)>30000 or requested.lands_in is null or length(requested.lands_in)>200
    or requested.planned_minutes is null or requested.planned_minutes not between 1 and 1440
    or requested.max_sends is null or requested.max_sends not between 1 and 100
    or requested.max_characters is null or requested.max_characters not between 1 and 280
    or requested.max_words is null or requested.max_words not between 1 and 50
    or requested.settings is null or requested.settings->'anonymous' is distinct from 'true'::jsonb
    or requested.settings->'burst_minutes' is null or requested.settings->'burst_minutes' not in ('3'::jsonb,'4'::jsonb,'5'::jsonb)
    or jsonb_typeof(requested.settings->'join_strip') is distinct from 'boolean'
    or (requested.planned_start is not null and not isfinite(requested.planned_start))
    or (requested.opens_at is not null and not isfinite(requested.opens_at)) or (requested.closes_at is not null and not isfinite(requested.closes_at))
    or (requested.mode='self_paced' and (requested.opens_at is null or requested.closes_at is null or requested.opens_at>=requested.closes_at))
   then return jsonb_build_object('status','invalid_request'); end if;
   if (s.id is null and requested.state not in ('draft','ready'))
     or (s.state in ('draft','ready') and requested.state not in ('draft','ready'))
     or (s.state not in ('draft','ready') and requested.state<>s.state) then return jsonb_build_object('status','invalid_state'); end if;
   if s.id is not null and (s.id=r.live_session_id or s.state in ('live','phones_down','open') or exists(select 1 from public.submissions where session_id=sid and not deleted))
    and (requested.interaction<>s.interaction or requested.mode<>s.mode) then return jsonb_build_object('status','running'); end if;
   if s.id is null then
    insert into public.sessions(id,engagement_id,title,part,position,planned_start,planned_minutes,mode,opens_at,closes_at,interaction,prompt,phone_depth,state,max_sends,max_characters,max_words,settings,lands_in)
    values(sid,p_engagement,btrim(requested.title),requested.part,coalesce((select max(position)+1 from public.sessions where engagement_id=p_engagement and not deleted),0),requested.planned_start,requested.planned_minutes,requested.mode,requested.opens_at,requested.closes_at,requested.interaction,requested.prompt,requested.phone_depth,requested.state,requested.max_sends,requested.max_characters,requested.max_words,
    jsonb_build_object('anonymous',true,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),requested.lands_in) returning * into saved;
   else
    update public.sessions set title=btrim(requested.title),part=requested.part,planned_start=requested.planned_start,planned_minutes=requested.planned_minutes,mode=requested.mode,opens_at=requested.opens_at,closes_at=requested.closes_at,interaction=requested.interaction,prompt=requested.prompt,phone_depth=requested.phone_depth,state=requested.state,max_sends=requested.max_sends,max_characters=requested.max_characters,max_words=requested.max_words,
    settings=jsonb_build_object('anonymous',true,'burst_minutes',requested.settings->'burst_minutes','join_strip',requested.settings->'join_strip'),lands_in=requested.lands_in where id=sid returning * into saved;
   end if;
   insert into private.session_notes(session_id,engagement_id,notes) values(sid,p_engagement,notes)
    on conflict(session_id) do update set notes=excluded.notes,deleted=false;
  end if;
 else return jsonb_build_object('status','invalid_request'); end if;
 -- One committed Save, one verified private broadcast, never per keystroke.
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement;
 return jsonb_build_object('status','ok','id',sid,'revision',saved.revision);
exception when invalid_text_representation or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then
 return jsonb_build_object('status','invalid_request');
end $$;

create function public.show_read(p_engagement uuid,p_after uuid default null,p_version text default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.show_read(p_engagement,p_after,p_version) $$;
create function public.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.show_write(p_engagement,p_action,p_input) $$;
revoke all on function private.show_allowed(uuid),private.show_version(uuid),private.show_read(uuid,uuid,text),private.show_write(uuid,text,jsonb),public.show_read(uuid,uuid,text),public.show_write(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.show_read(uuid,uuid,text),private.show_write(uuid,text,jsonb),public.show_read(uuid,uuid,text),public.show_write(uuid,text,jsonb) to authenticated;

-- Known horizon placeholders only, rendered on the server, no HTML evaluation.
create function private.fill_years(p_text text,p_base integer) returns text language sql immutable security invoker set search_path='' as $$
 select replace(regexp_replace(regexp_replace(regexp_replace(p_text,'\{base year\s*\+\s*10\}',(p_base+10)::text,'g'),'\{base year\s*\+\s*3\}',(p_base+3)::text,'g'),'\{base year\s*\+\s*1\}',(p_base+1)::text,'g'),'{base year}',p_base::text)
$$;
revoke all on function private.fill_years(text,integer) from public,anon,authenticated;
create or replace function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',jsonb_build_object('engagement_id',r.engagement_id,'live_session_id',r.live_session_id,'tv_content',r.tv_content,'phones_down',r.phones_down,'burst_ends_at',r.burst_ends_at,'spotlight_id',r.spotlight_id,'hidden_ids',r.hidden_ids,'remote_holder_id',r.remote_holder_id,'team_led_block_id',r.team_led_block_id,'show_tv_on_phones',r.show_tv_on_phones,'phone_refresh_version',r.phone_refresh_version,'results',r.results,'version',r.version),'session',case when s.id is not null then jsonb_build_object(
 'id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
 'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'settings',jsonb_build_object('anonymous',true,'burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')) end)
 from public.room_states r join public.engagements e on e.id=r.engagement_id left join public.sessions s on s.id=r.live_session_id and not s.deleted
 where r.engagement_id=p_engagement and not r.deleted
$$;
-- Keep the existing snapshot paging/authorization implementation, resolve phone-only depth server-side.
create or replace function private.live_snapshot(p_engagement uuid,p_after uuid,p_version bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare role text:=private.live_role(p_engagement); r public.room_states; page jsonb; next_id uuid;
begin
  if role is null then return jsonb_build_object('status','denied'); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted;
  if not found then return jsonb_build_object('status','missing'); end if;
  if p_version is not null and p_version<>r.version then return jsonb_build_object('status','changed','version',r.version); end if;
  if p_after is not null and p_version is null then return jsonb_build_object('status','invalid_request'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'session_id',session_id,'text',text,'answers',answers,'revision',revision,'created_at',created_at) order by id),'[]'::jsonb)
    into page from (select s.* from public.submissions s where s.engagement_id=p_engagement and s.session_id=r.live_session_id
      and not s.deleted and not s.withdrawn and not s.hidden and (p_after is null or s.id>p_after) order by s.id limit 501) page_rows;
  if jsonb_array_length(page)>500 then next_id:=(page->499->>'id')::uuid; page:=page-500; end if;
  return private.live_public_state(p_engagement)||jsonb_build_object('status','ok','role',role,'topic',private.live_topic(p_engagement),'version',r.version,'answers',page,'next',next_id,
    'phone_depth',case when role='participant' then (select private.fill_years(s.phone_depth,e.base_year) from public.sessions s join public.engagements e on e.id=s.engagement_id where s.id=r.live_session_id and not s.deleted) else null end,
    'server_time',clock_timestamp());
end $$;

create function private.show_year_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.base_year<>old.base_year and not new.deleted and new.status<>'closed' then
  update public.room_states set results=private.live_results(new.id) where engagement_id=new.id and not deleted;
 end if;
 return new;
end $$;
revoke all on function private.show_year_changed() from public,anon,authenticated;
create trigger show_year_changed after update of base_year on public.engagements for each row execute function private.show_year_changed();
commit;
