-- Image functions follow the house pattern: the checks live in private security definer
-- functions, and the public functions the app calls are security invoker wrappers.

alter function public.image_begin(uuid,uuid,text,text,integer) set schema private;
alter function public.image_finish(uuid,uuid,integer,integer) set schema private;
alter function public.image_list(uuid) set schema private;
alter function public.image_read(uuid,uuid) set schema private;

create function public.image_begin(p_engagement uuid,p_id uuid,p_name text,p_mime text,p_bytes integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.image_begin(p_engagement,p_id,p_name,p_mime,p_bytes) $$;
create function public.image_finish(p_engagement uuid,p_id uuid,p_width integer,p_height integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.image_finish(p_engagement,p_id,p_width,p_height) $$;
create function public.image_list(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.image_list(p_engagement) $$;
create function public.image_read(p_engagement uuid,p_image uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.image_read(p_engagement,p_image) $$;

revoke all on function public.image_begin(uuid,uuid,text,text,integer),public.image_finish(uuid,uuid,integer,integer),public.image_list(uuid),public.image_read(uuid,uuid) from public,anon;
grant execute on function public.image_begin(uuid,uuid,text,text,integer),public.image_finish(uuid,uuid,integer,integer),public.image_list(uuid),public.image_read(uuid,uuid) to authenticated,service_role;
revoke all on function private.image_begin(uuid,uuid,text,text,integer),private.image_finish(uuid,uuid,integer,integer),private.image_list(uuid),private.image_read(uuid,uuid) from public,anon;
grant execute on function private.image_begin(uuid,uuid,text,text,integer),private.image_finish(uuid,uuid,integer,integer),private.image_list(uuid),private.image_read(uuid,uuid) to authenticated,service_role;

