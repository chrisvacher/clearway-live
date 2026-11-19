begin;

-- Availability returns only a status. A facilitator can check names for their event.
-- Creating a new event still requires an admin, including checking a name before it exists.
create function private.engagement_link_name_status(p_name text,p_engagement uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (private.is_admin() or (p_engagement is not null and private.can_facilitate(p_engagement))) then
    return 'denied';
  end if;
  if p_name is null or p_name !~ '^[a-z0-9]{3,24}$' or p_name ~ '^[a-f0-9]{8}$' then return 'invalid_name'; end if;
  if private.link_name_reserved(p_name) then return 'reserved_name'; end if;
  if exists(select 1 from public.engagements e where e.link_name=p_name and e.id is distinct from p_engagement and not e.deleted) then
    return 'taken_name';
  end if;
  return 'available';
end $$;

create function public.engagement_link_name_status(p_name text,p_engagement uuid) returns text
language sql stable security invoker set search_path='' as $$ select private.engagement_link_name_status(p_name,p_engagement) $$;

-- Check and reserve the name within the same transaction that creates the engagement.
-- The unique index serializes two competing writes, so a refused name cannot leave a partial event.
alter function private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) rename to save_engagement_pre_named_create;
create function private.save_engagement(p_id uuid,p_church jsonb,p_engagement jsonb,p_lead uuid,p_co uuid,p_client uuid,p_hub_engagement uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare requested text:=nullif(p_engagement->>'link_name',''); availability text; target uuid; conflicting text;
begin
  if p_id is null and requested is not null then
    if not private.is_admin() then raise insufficient_privilege; end if;
    if p_engagement->>'type' is distinct from 'team_workshop' then raise check_violation using message='Choose a link name for a workshop.'; end if;
    availability:=private.engagement_link_name_status(requested,null);
    if availability='taken_name' then raise unique_violation using constraint='engagements_link_name_unique',message='engagements_link_name_unique'; end if;
    if availability is distinct from 'available' then raise check_violation using message='Choose an available link name.'; end if;
  end if;
  target:=private.save_engagement_pre_named_create(p_id,p_church,p_engagement-'link_name',p_lead,p_co,p_client,p_hub_engagement);
  if p_id is null and requested is not null then
    update public.engagements set link_name=requested where id=target;
  end if;
  return target;
exception when unique_violation then
  get stacked diagnostics conflicting=constraint_name;
  if conflicting='engagements_link_name_unique' then
    raise unique_violation using constraint=conflicting,message='engagements_link_name_unique';
  end if;
  raise;
end $$;

-- Make a new, unlinked event at the same church and copy the design through the template rules.
-- The intermediate template is private and exists only within the duplicate transaction.
create function private.engagement_duplicate(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare source public.engagements; target uuid; snapshot jsonb; template_id uuid; applied jsonb;
begin
  if auth.uid() is null or not private.is_admin() then return jsonb_build_object('status','denied'); end if;
  select * into source from public.engagements where id=p_engagement and not deleted and type<>'practice';
  if not found then return jsonb_build_object('status','missing'); end if;
  insert into public.engagements(church_id,team_hub_client_id,title,type,base_year,lens_names,settings,how_the_room_decides,skin)
  values(source.church_id,source.team_hub_client_id,left(source.title,193)||' (copy)',source.type,source.base_year,source.lens_names,
    source.settings,source.how_the_room_decides,source.skin)
  returning id into target;
  insert into public.engagement_facilitators(engagement_id,clearway_user_id,role)
  values(target,private.clearway_user_id(),'lead');
  snapshot:=private.template_write('save',jsonb_build_object('engagement',p_engagement,'name','New event','shared',false));
  if snapshot->>'status'='empty' then return jsonb_build_object('status','ok','id',target); end if;
  if snapshot->>'status' is distinct from 'ok' then raise check_violation using message='We could not copy the run of show.'; end if;
  template_id:=(snapshot->>'id')::uuid;
  applied:=private.template_write('apply',jsonb_build_object('engagement',target,'template',template_id,'start',null));
  if applied->>'status' is distinct from 'ok' then raise check_violation using message='We could not copy the run of show.'; end if;
  delete from private.templates where id=template_id;
  return jsonb_build_object('status','ok','id',target);
end $$;

create function public.engagement_duplicate(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.engagement_duplicate(p_engagement) $$;

revoke all on function private.engagement_link_name_status(text,uuid),public.engagement_link_name_status(text,uuid),
  private.save_engagement_pre_named_create(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid),
  private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid),
  private.engagement_duplicate(uuid),public.engagement_duplicate(uuid)
from public,anon,authenticated;
grant execute on function private.engagement_link_name_status(text,uuid),public.engagement_link_name_status(text,uuid),
  private.save_engagement(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid),
  private.engagement_duplicate(uuid),public.engagement_duplicate(uuid)
to authenticated;

commit;
