begin;

create function private.clearway_user_admin_list() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (select private.is_admin()) then return jsonb_build_object('status','denied'); end if;
  return jsonb_build_object('status','ok','users',coalesce((
    select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'email',c.email,
      'is_admin',c.is_admin,'last_sign_in_at',u.last_sign_in_at) order by c.name,c.id)
    from public.clearway_users c left join auth.users u on u.id=c.auth_user_id and u.deleted_at is null
    where c.kind='person' and not c.deleted
  ),'[]'::jsonb));
end $$;

create function private.clearway_user_admin_change(p_user uuid, p_action text) returns text
language plpgsql security definer set search_path='' as $$
declare target public.clearway_users;
begin
  if auth.uid() is null or not (select private.is_admin()) then return 'denied'; end if;
  if p_user is null or coalesce(p_action,'') not in ('make_admin','make_facilitator','remove') then return 'invalid_request'; end if;
  -- Serialize role changes so two admins cannot concurrently remove the last admin.
  perform pg_advisory_xact_lock(hashtextextended('clearway_user_admin_change',0));
  if not (select private.is_admin()) then return 'denied'; end if;
  select * into target from public.clearway_users where id=p_user and kind='person' and not deleted for update;
  if not found then return 'missing'; end if;
  if target.is_admin and p_action in ('make_facilitator','remove') and
      not exists(select 1 from public.clearway_users c where c.kind='person' and c.is_admin and not c.deleted and c.id<>p_user) then
    return 'last_admin';
  end if;
  if p_action='remove' then
    -- Keep the profile and assignments for history and free the binding so
    -- an admin can later add the same verified Google account again.
    update public.clearway_users set deleted=true,auth_user_id=null where id=p_user;
  else
    update public.clearway_users set is_admin=(p_action='make_admin') where id=p_user;
  end if;
  return 'ok';
end $$;

create function public.clearway_user_admin_list() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.clearway_user_admin_list() $$;
create function public.clearway_user_admin_change(p_user uuid,p_action text) returns text
language sql security invoker set search_path='' as $$ select private.clearway_user_admin_change(p_user,p_action) $$;

revoke all on function private.clearway_user_admin_list(),private.clearway_user_admin_change(uuid,text),
  public.clearway_user_admin_list(),public.clearway_user_admin_change(uuid,text) from public,anon,authenticated;
grant execute on function private.clearway_user_admin_list(),private.clearway_user_admin_change(uuid,text),
  public.clearway_user_admin_list(),public.clearway_user_admin_change(uuid,text) to authenticated;

commit;
