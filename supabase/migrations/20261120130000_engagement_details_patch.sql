begin;

-- Details saves only edited values. A co-facilitator change never retires an event-link assignment.
create function private.engagement_details_patch(p_engagement uuid, p_change jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  event_row public.engagements;
  next_event public.engagements;
  church_row public.churches;
  next_church public.churches;
  e jsonb := coalesce(p_change->'event', '{}'::jsonb);
  c jsonb := coalesce(p_change->'church', '{}'::jsonb);
  s jsonb := coalesce(p_change->'settings', '{}'::jsonb);
  a jsonb := coalesce(p_change->'assignments', '{}'::jsonb);
  lead_id uuid;
  co_id uuid;
begin
  if auth.uid() is null or not (private.is_admin() or private.can_facilitate(p_engagement)) then return 'denied'; end if;
  if jsonb_typeof(p_change) is distinct from 'object'
     or p_change - array['event','church','settings','assignments'] <> '{}'::jsonb
     or jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(c) is distinct from 'object'
     or jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(a) is distinct from 'object'
     or e - array['title','start_date','end_date','pre_call_at','retreat_start_date','retreat_end_date','base_year','lens_names','skin'] <> '{}'::jsonb
     or c - array['name','timezone','logo_url','governance_body_name','mission','purpose','values','strategy','leadership_rhythms'] <> '{}'::jsonb
     or s - array['ai_enabled','scripture_translation'] <> '{}'::jsonb
     or a - array['lead','co'] <> '{}'::jsonb
     or (s ? 'ai_enabled' and jsonb_typeof(s->'ai_enabled') <> 'boolean')
     or (s ? 'scripture_translation' and jsonb_typeof(s->'scripture_translation') <> 'string')
  then return 'invalid'; end if;
  if ((e ? 'skin' or a ? 'lead') and not private.is_admin())
     or (a <> '{}'::jsonb and not private.is_person()) then return 'denied'; end if;
  if p_change = '{}'::jsonb then return 'ok'; end if;

  select * into event_row from public.engagements where id = p_engagement and not deleted for update;
  if not found then return 'missing'; end if;
  if event_row.type = 'team_workshop' and (
    e - array['title','start_date','end_date','skin'] <> '{}'::jsonb
    or c - array['name','timezone','logo_url'] <> '{}'::jsonb
    or s ? 'scripture_translation'
  ) then return 'invalid'; end if;

  next_event := jsonb_populate_record(event_row, e);
  if length(btrim(next_event.title)) not between 1 and 200
     or next_event.skin is null or next_event.skin not in ('clearway','novetera')
     or (next_event.end_date < next_event.start_date)
     or (next_event.retreat_end_date < next_event.retreat_start_date)
     or length(coalesce(s->>'scripture_translation','')) > 100 then return 'invalid'; end if;

  if c <> '{}'::jsonb then
    select * into church_row from public.churches where id = event_row.church_id and not deleted for update;
    if not found then return 'missing'; end if;
    next_church := jsonb_populate_record(church_row, c);
    if length(btrim(next_church.name)) not between 1 and 200
       or (c ? 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names where name = next_church.timezone))
       or (c ? 'logo_url' and next_church.logo_url is not null and (length(next_church.logo_url) > 2000 or next_church.logo_url !~ '^(https://|http://(localhost|127[.]0[.]0[.]1)([:/]|$))'))
    then return 'invalid'; end if;
  end if;

  if a <> '{}'::jsonb then
    if a ? 'lead' then
      lead_id := (a->>'lead')::uuid;
      if not exists (select 1 from public.clearway_users where id = lead_id and kind = 'person' and not deleted) then return 'invalid'; end if;
    else
      select f.clearway_user_id into lead_id from public.engagement_facilitators f where f.engagement_id = p_engagement and f.role = 'lead' and not f.deleted;
    end if;
    if a ? 'co' then
      co_id := (a->>'co')::uuid;
      if co_id is not null and (co_id = lead_id or not exists (select 1 from public.clearway_users where id = co_id and kind = 'person' and not deleted)) then return 'invalid'; end if;
    elsif exists (select 1 from public.engagement_facilitators f where f.engagement_id = p_engagement and f.clearway_user_id = lead_id and not f.deleted and f.role = 'co_facilitator') then
      return 'invalid';
    end if;
  end if;

  if c <> '{}'::jsonb then
    update public.churches set name = next_church.name, timezone = next_church.timezone,
      logo_url = next_church.logo_url, governance_body_name = next_church.governance_body_name,
      mission = next_church.mission, purpose = next_church.purpose, "values" = next_church."values",
      strategy = next_church.strategy, leadership_rhythms = next_church.leadership_rhythms
      where id = event_row.church_id;
  end if;
  if e <> '{}'::jsonb or s <> '{}'::jsonb then
    update public.engagements set title = next_event.title, start_date = next_event.start_date,
      end_date = next_event.end_date, pre_call_at = next_event.pre_call_at, retreat_start_date = next_event.retreat_start_date,
      retreat_end_date = next_event.retreat_end_date, base_year = next_event.base_year,
      lens_names = next_event.lens_names, skin = next_event.skin, settings = event_row.settings || s
      where id = p_engagement;
  end if;

  if a ? 'co' then
    update public.engagement_facilitators f set deleted = true
      from public.clearway_users u where u.id = f.clearway_user_id and u.kind = 'person'
        and f.engagement_id = p_engagement and f.role = 'co_facilitator' and not f.deleted
        and f.clearway_user_id is distinct from co_id;
  end if;
  if a ? 'lead' then
    update public.engagement_facilitators set deleted = true where engagement_id = p_engagement
      and role = 'lead' and not deleted and clearway_user_id <> lead_id;
    insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(p_engagement,lead_id,'lead')
      on conflict(engagement_id,clearway_user_id) where not deleted do update set role = 'lead';
  end if;
  if a ? 'co' and co_id is not null then
    insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(p_engagement,co_id,'co_facilitator')
      on conflict(engagement_id,clearway_user_id) where not deleted do update set role = 'co_facilitator';
  end if;
  return 'ok';
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range
  or invalid_datetime_format or datetime_field_overflow then
  return 'invalid';
end $$;

revoke all on function private.engagement_details_patch(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.engagement_details_patch(uuid,jsonb) to authenticated;
create function public.engagement_details_patch(p_engagement uuid,p_change jsonb) returns text
language sql security invoker set search_path = '' as $$ select private.engagement_details_patch(p_engagement,p_change) $$;
revoke all on function public.engagement_details_patch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.engagement_details_patch(uuid,jsonb) to authenticated;
commit;
