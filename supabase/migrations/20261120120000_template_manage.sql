begin;

create function private.template_manage(p_action text, p_template uuid, p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select private.clearway_user_id());
  source private.templates;
  result_id uuid;
  title text;
begin
  if auth.uid() is null or caller is null or not (select private.is_person()) then
    return jsonb_build_object('status','denied');
  end if;
  if coalesce(p_action,'') not in ('rename','duplicate') or p_template is null then
    return jsonb_build_object('status','invalid_request');
  end if;
  select * into source from private.templates where id=p_template for update;
  if not found or not private.template_visible(source) then return jsonb_build_object('status','missing'); end if;
  if p_action='rename' then
    if source.kind <> 'saved' or not (source.created_by=caller or (select private.is_admin())) then
      return jsonb_build_object('status','denied');
    end if;
    title := btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g'));
    if length(title) not between 1 and 120 then return jsonb_build_object('status','invalid_request'); end if;
    update private.templates set name=title where id=source.id;
    result_id := source.id;
  else
    insert into private.templates(name,description,kind,shared,created_by,source_engagement_id,sessions,block)
      values(rtrim(left(source.name,113))||' (copy)',source.description,'saved',false,caller,source.source_engagement_id,source.sessions,source.block)
      returning id into result_id;
  end if;
  return jsonb_build_object('status','ok','id',result_id);
end $$;

create function public.template_manage(p_action text, p_template uuid, p_name text) returns jsonb
language sql security invoker set search_path='' as $$
  select private.template_manage(p_action,p_template,p_name)
$$;

alter function private.template_public(private.templates) rename to template_public_pre_manage;
create function private.template_public(p_template private.templates) returns jsonb
language sql stable security definer set search_path='' as $$
  select private.template_public_pre_manage(p_template)||jsonb_build_object('engagement_type',
    case when p_template.id='c1ea0000-0000-4000-8000-000000000001' then 'team_workshop'
         when p_template.id='c1ea0000-0000-4000-8000-000000000002' then 'wayfinding'
         when p_template.id='c1ea0000-0000-4000-8000-000000000003' then 'day_and_a_half'
         else (select e.type::text from public.engagements e where e.id=p_template.source_engagement_id)
    end)
$$;

alter function private.template_read() rename to template_read_pre_manage;
create function private.template_read() returns jsonb
language sql stable security definer set search_path='' as $$
  select private.template_read_pre_manage()||jsonb_build_object('can_manage',(select private.is_person()))
$$;

revoke all on function private.template_public_pre_manage(private.templates),private.template_public(private.templates),
  private.template_read_pre_manage(),private.template_read(),private.template_manage(text,uuid,text),public.template_manage(text,uuid,text)
from public,anon,authenticated;
grant execute on function private.template_read(),private.template_manage(text,uuid,text),public.template_manage(text,uuid,text) to authenticated;

commit;
