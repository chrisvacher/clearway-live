begin;

alter table public.engagements add column archived_at timestamptz;

-- Archiving changes the Engagements list only. Existing room links, answers, results and export keep working.
create function private.engagement_list_archive(p_engagement uuid, p_archived boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
  if not private.is_person() or not (private.is_admin() or private.can_facilitate(p_engagement)) then
    return jsonb_build_object('status','denied');
  end if;
  update public.engagements
  set archived_at=case when p_archived then coalesce(archived_at,now()) end
  where id=p_engagement and not deleted and type<>'practice'
  returning archived_at into stamp;
  if not found then return jsonb_build_object('status','missing'); end if;
  return jsonb_build_object('status','ok','archived_at',stamp);
end $$;

-- public.engagement_archive(uuid) already exports the engagement. Keep its signature and behaviour.
create function public.engagement_hide_from_list(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.engagement_list_archive(p_engagement,true) $$;

create function public.engagement_restore(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.engagement_list_archive(p_engagement,false) $$;

revoke all on function private.engagement_list_archive(uuid,boolean),public.engagement_hide_from_list(uuid),public.engagement_restore(uuid) from public,anon,authenticated;
grant execute on function private.engagement_list_archive(uuid,boolean),public.engagement_hide_from_list(uuid),public.engagement_restore(uuid) to authenticated;

commit;
