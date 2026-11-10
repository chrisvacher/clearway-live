begin;
-- Retain the live admin checks and ACLs while keeping privileged code unexposed.
alter function public.ops_state() set schema private;
alter function public.ops_backup_chunk(uuid,integer) set schema private;
create function public.ops_state() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.ops_state() $$;
create function public.ops_backup_chunk(p_backup uuid,p_part integer) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.ops_backup_chunk(p_backup,p_part) $$;
revoke all on function public.ops_state(),public.ops_backup_chunk(uuid,integer) from public,anon,authenticated;
grant execute on function public.ops_state(),public.ops_backup_chunk(uuid,integer) to authenticated,service_role;
commit;
