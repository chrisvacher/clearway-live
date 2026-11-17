-- Events without Team Hub (Chris, November 17): a Live event no longer has to be linked to a Team Hub engagement.
--
-- 1. Creating an engagement takes its church one of three ways: a church already in Live (p_church.id), a Team Hub church
--    (p_client, as before), or a new church by name and time zone with no Team Hub link. Linking a Team Hub engagement
--    (p_hub_engagement) is optional and needs its Team Hub church. A linked Team Hub engagement still opens one Live event
--    (engagements_team_hub_unique is unchanged).
-- 2. A new event for a church already in Live (by id or by its Team Hub link) leaves the church's details as they are.
-- 3. Saving an existing engagement is unchanged: its external links still can't be repointed.
-- save_engagement_pre_skin is redefined from 20261030044348_engagement_setup (renamed by 20261114100000_engagement_skin);
-- only the create branch changes. The skin wrapper, private.save_engagement, calls it as before.
begin;

create or replace function private.save_engagement_pre_skin(p_id uuid,p_church jsonb,p_engagement jsonb,p_lead uuid,p_co uuid,p_client uuid,p_hub_engagement uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.engagements; church uuid; church_client uuid; kept boolean:=false; target uuid:=coalesce(p_id,gen_random_uuid());
begin
  if p_id is null then
    if not (select private.is_admin()) then raise insufficient_privilege; end if;
    if p_hub_engagement is not null and p_client is null then raise check_violation using message='Choose the Team Hub church for that engagement.'; end if;
    if jsonb_typeof(p_church->'id')='string' then
      -- A church already in Live. A Team Hub church, if one is named, must be the one it is linked to.
      if p_church->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise check_violation using message='Choose a church.'; end if;
      select id,team_hub_client_id into church,church_client from public.churches where id=(p_church->>'id')::uuid and not deleted for update;
      if church is null then raise check_violation using message='Choose a church.'; end if;
      if p_client is not null and p_client is distinct from church_client then raise check_violation using message='That church is linked to another Team Hub church.'; end if;
      kept:=true;
    elsif p_client is not null then
      perform pg_advisory_xact_lock(hashtextextended(p_client::text,0));
      select id,team_hub_client_id into church,church_client from public.churches where team_hub_client_id=p_client and not deleted;
      if church is null then insert into public.churches(name,timezone,team_hub_client_id) values(p_church->>'name',p_church->>'timezone',p_client) returning id,team_hub_client_id into church,church_client;
      else kept:=true; end if;
    else
      -- A new church, with no Team Hub link.
      if length(btrim(coalesce(p_church->>'name',''))) not between 1 and 200 then raise check_violation using message='Name the church.'; end if;
      insert into public.churches(name,timezone) values(btrim(p_church->>'name'),p_church->>'timezone') returning id into church;
    end if;
    insert into public.engagements(id,church_id,title,team_hub_client_id,team_hub_engagement_id) values(target,church,p_engagement->>'title',church_client,p_hub_engagement);
  else
    if not ((select private.is_admin()) or private.can_facilitate(p_id)) then raise insufficient_privilege; end if;
    select * into e from public.engagements where id=p_id and not deleted for update;
    if not found then raise no_data_found; end if; church:=e.church_id;
    if p_client is not null and p_client is distinct from e.team_hub_client_id then raise insufficient_privilege; end if;
    if p_hub_engagement is not null and p_hub_engagement is distinct from e.team_hub_engagement_id then raise insufficient_privilege; end if;
    if (p_engagement->>'type'='practice') is distinct from (e.type='practice') then raise check_violation using message='Keep the practice room separate.'; end if;
  end if;
  if p_id is null and p_engagement->>'type'='practice' then raise check_violation; end if;
  if jsonb_typeof(p_church->'values')<>'array' or jsonb_typeof(p_church->'leadership_rhythms')<>'array' then raise check_violation; end if;
  if length(btrim(p_engagement->>'how_the_room_decides')) not between 1 and 4000 then raise check_violation; end if;
  -- A church already in Live keeps its details: the create form has none of them, and Details edits them.
  if not kept then update public.churches set name=p_church->>'name',timezone=p_church->>'timezone',logo_url=p_church->>'logo_url',mission=coalesce(p_church->>'mission',''),purpose=coalesce(p_church->>'purpose',''),"values"=p_church->'values',strategy=coalesce(p_church->>'strategy',''),leadership_rhythms=p_church->'leadership_rhythms',governance_body_name=coalesce(p_church->>'governance_body_name','') where id=church; end if;
  update public.engagements set title=p_engagement->>'title',type=(p_engagement->>'type')::public.engagement_type,status=(p_engagement->>'status')::public.engagement_status,start_date=(p_engagement->>'start_date')::date,end_date=(p_engagement->>'end_date')::date,retreat_start_date=(p_engagement->>'retreat_start_date')::date,retreat_end_date=(p_engagement->>'retreat_end_date')::date,pre_call_at=(p_engagement->>'pre_call_at')::timestamptz,base_year=(p_engagement->>'base_year')::smallint,lens_names=array(select jsonb_array_elements_text(p_engagement->'lens_names')),how_the_room_decides=p_engagement->>'how_the_room_decides',settings=settings||coalesce(p_engagement->'settings','{}'::jsonb) where id=target;
  if p_lead is not null then
    if not exists(select 1 from public.clearway_users where id=p_lead and not deleted) then raise check_violation; end if;
    if (select private.is_admin()) then
      update public.engagement_facilitators set deleted=true where engagement_id=target and role='lead' and not deleted;
      insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(target,p_lead,'lead') on conflict(engagement_id,clearway_user_id) where not deleted do update set role='lead';
    elsif not exists(select 1 from public.engagement_facilitators where engagement_id=target and clearway_user_id=p_lead and role='lead' and not deleted) then raise insufficient_privilege; end if;
  elsif p_id is null then raise check_violation using message='Choose a lead facilitator.';
  end if;
  if p_co is not null and (p_co=p_lead or not exists(select 1 from public.clearway_users where id=p_co and not deleted)) then raise check_violation; end if;
  update public.engagement_facilitators set deleted=true where engagement_id=target and role='co_facilitator' and not deleted;
  if p_co is not null then insert into public.engagement_facilitators(engagement_id,clearway_user_id,role) values(target,p_co,'co_facilitator'); end if;
  return target;
end $$;
revoke all on function private.save_engagement_pre_skin(uuid,jsonb,jsonb,uuid,uuid,uuid,uuid) from public,anon,authenticated;

commit;
