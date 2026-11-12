-- Run of show sections and saved blocks (design pass 8, step 5).
--  * public.sessions.section: the name of the section a session sits in. A section is a run of sessions next to each other in
--    a part that carry the same name. It is a label for the people who plan and run the room: it changes no time, no state and
--    nothing on a phone or the TV. (A segment is different: it keeps late answers open. A part is a day.)
--  * private.templates.block: a saved block is a template made from some of a run's sessions. Applying it adds them to the run.
--  * The run of show's own functions are not rewritten. Each is renamed to ..._pre_section and wrapped, the way the scribe
--    console wrapped live_public_state: show_read adds each session's section; show_write keeps a section sent with save or
--    place and gains the action "section" (name a set of sessions); template_write keeps sections in a template, saves a
--    block from chosen sessions and gives applied sessions their sections; template_public says which templates are blocks.
begin;

alter table public.sessions add column section text not null default '' check(length(section)<=100 and section=btrim(section));
alter table private.templates add column block boolean not null default false;

alter function private.show_read(uuid,uuid,text) rename to show_read_pre_section;
create function private.show_read(p_engagement uuid,p_after uuid,p_version text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 r:=private.show_read_pre_section(p_engagement,p_after,p_version);
 if r->>'status' is distinct from 'ok' then return r; end if;
 return jsonb_set(r,'{sessions}',coalesce((select jsonb_agg(v||jsonb_build_object('section',s.section) order by n)
  from jsonb_array_elements(r->'sessions') with ordinality t(v,n) join public.sessions s on s.id=(v->>'id')::uuid),'[]'::jsonb));
end $$;

alter function private.show_write(uuid,text,jsonb) rename to show_write_pre_section;
create function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; v_name text; ids uuid[]; sid uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then return private.show_write_pre_section(p_engagement,p_action,p_input); end if;
 if p_input ? 'section' then
  if jsonb_typeof(p_input->'section')<>'string' then return jsonb_build_object('status','invalid_request'); end if;
  v_name:=btrim(regexp_replace(p_input->>'section','\s+',' ','g'));
  if length(v_name)>100 then return jsonb_build_object('status','invalid_request'); end if;
 end if;
 if p_action='section' then
  -- Name a set of sessions: a section renamed, a section's name taken away, or sessions gathered into one.
  if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
  perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
  if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
  if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
  if v_name is null or jsonb_typeof(p_input->'ids') is distinct from 'array' or jsonb_array_length(p_input->'ids') not between 1 and 500 then return jsonb_build_object('status','invalid_request'); end if;
  select array_agg(distinct (v#>>'{}')::uuid) into ids from jsonb_array_elements(p_input->'ids') v;
  if cardinality(ids)<>jsonb_array_length(p_input->'ids')
   or (select count(*) from public.sessions where id=any(ids) and engagement_id=p_engagement and not deleted)<>cardinality(ids) then return jsonb_build_object('status','conflict'); end if;
  update public.sessions set section=v_name where id=any(ids) and section is distinct from v_name;
  return jsonb_build_object('status','ok','count',cardinality(ids));
 end if;
 r:=private.show_write_pre_section(p_engagement,p_action,p_input-'section');
 if r->>'status'='ok' and p_action in ('save','place') and v_name is not null then
  sid:=(r->>'id')::uuid;
  update public.sessions set section=v_name where id=sid and engagement_id=p_engagement and section is distinct from v_name;
  if found then r:=r||jsonb_build_object('revision',(select revision from public.sessions where id=sid)); end if;
 end if;
 return r;
exception when invalid_text_representation or check_violation then return jsonb_build_object('status','invalid_request');
end $$;

alter function private.template_public(private.templates) rename to template_public_pre_section;
create function private.template_public(p_template private.templates) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.template_public_pre_section(p_template)||jsonb_build_object('block',p_template.block)
$$;

alter function private.template_write(text,jsonb) rename to template_write_pre_section;
create function private.template_write(p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; eng uuid; ids uuid[]; had uuid[]; keys text[]; t private.templates;
begin
 if jsonb_typeof(p_input) is distinct from 'object' or p_action not in ('save','apply') then return private.template_write_pre_section(p_action,p_input); end if;
 eng:=(p_input->>'engagement')::uuid;
 if p_action='save' then
  if p_input ? 'sessions' then
   -- A block: only these sessions of the run.
   if eng is null or not coalesce(private.show_allowed(eng),false) then return jsonb_build_object('status','denied'); end if;
   if jsonb_typeof(p_input->'sessions')<>'array' or jsonb_array_length(p_input->'sessions') not between 1 and 500 then return jsonb_build_object('status','invalid_request'); end if;
   select array_agg(distinct (v#>>'{}')::uuid) into ids from jsonb_array_elements(p_input->'sessions') v;
   select array_agg(s.part||':'||s.position) into keys from public.sessions s where s.id=any(ids) and s.engagement_id=eng and not s.deleted;
   if coalesce(cardinality(keys),0)<>jsonb_array_length(p_input->'sessions') then return jsonb_build_object('status','invalid_request'); end if;
  end if;
  r:=private.template_write_pre_section('save',p_input-'sessions');
  if r->>'status' is distinct from 'ok' then return r; end if;
  update private.templates x set block=keys is not null,
   sessions=(select jsonb_agg(e||jsonb_build_object('section',coalesce((select s.section from public.sessions s
      where s.engagement_id=eng and not s.deleted and s.part||':'||s.position=e->>'key' order by s.id limit 1),'')) order by n)
     from jsonb_array_elements(x.sessions) with ordinality q(e,n) where keys is null or e->>'key'=any(keys))
   where x.id=(r->>'id')::uuid returning * into t;
  return r||jsonb_build_object('count',jsonb_array_length(t.sessions));
 end if;
 -- Apply: the sessions it adds take the sections the template holds, in the same order it adds them.
 if eng is not null then
  if eng='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(eng::text,7)); end if;
  perform 1 from public.room_states where engagement_id=eng and not deleted for update;
  select coalesce(array_agg(id),array[]::uuid[]) into had from public.sessions where engagement_id=eng and not deleted;
 end if;
 r:=private.template_write_pre_section('apply',p_input);
 if r->>'status' is distinct from 'ok' then return r; end if;
 select * into t from private.templates where id=(p_input->>'template')::uuid;
 update public.sessions s set section=m.section from (
   select a.id,b.section from
    (select id,row_number() over(order by private.part_order(part),position,id) rn from public.sessions where engagement_id=eng and not deleted and not(id=any(had))) a
    join (select left(btrim(regexp_replace(coalesce(v->>'section',''),'\s+',' ','g')),100) section,row_number() over(order by private.part_order(v->>'part'),(v->>'position')::integer,n) rn
      from jsonb_array_elements(t.sessions) with ordinality x(v,n)) b using(rn)) m
  where s.id=m.id and m.section<>'';
 return r;
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then return jsonb_build_object('status','invalid_request');
end $$;

revoke all on function private.show_read(uuid,uuid,text),private.show_write(uuid,text,jsonb),private.template_public(private.templates),private.template_write(text,jsonb),
 private.show_read_pre_section(uuid,uuid,text),private.show_write_pre_section(uuid,text,jsonb),private.template_public_pre_section(private.templates),private.template_write_pre_section(text,jsonb)
 from public,anon,authenticated;
grant execute on function private.show_read(uuid,uuid,text),private.show_write(uuid,text,jsonb),private.template_write(text,jsonb) to authenticated;

commit;
