-- An admin can always delete a step from the run of show (Chris, November 20). Until now a step that was live, open or
-- phones down could not be removed by anyone ('running'), and steps stay open until they are ended, so a rehearsed step
-- could not be deleted without first stopping its answers in the live room. For an admin, removing such a step now first
-- takes it off the TV if it is the live step (exactly as Home does, through the room engine), then stops its answers, and
-- then removes it the usual way. Everyone else keeps the rule as it was. Nothing else about removing changes: the revision
-- must still match, and the removal itself is still the run of show's own.
begin;

alter function private.show_write(uuid,text,jsonb) rename to show_write_pre_admin_delete;
create function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 s public.sessions; v_live uuid; done jsonb; v_rev integer;
begin
 if p_action='remove' and jsonb_typeof(p_input)='object' and (select private.is_admin())
    and coalesce(p_input->>'id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and coalesce(p_input->>'revision','') ~ '^[0-9]{1,9}$' then
  -- The room first, then the step: the same order the room engine takes its locks in.
  select live_session_id into v_live from public.room_states where engagement_id=p_engagement and not deleted for update;
  select * into s from public.sessions where id=(p_input->>'id')::uuid and engagement_id=p_engagement and not deleted for update;
  if found and (p_input->>'revision')::integer=s.revision and (s.id is not distinct from v_live or s.state in ('live','open','phones_down')) then
   if s.id is not distinct from v_live then
    -- Off the TV, as Home does: the room engine bumps the room's version, so the TV and every screen redraw.
    done:=private.room_control(p_engagement,gen_random_uuid(),'nothing_live',jsonb_build_object('from',s.id));
    if coalesce(done->>'status','') not in ('ok','unchanged') then return jsonb_build_object('status','running'); end if;
   end if;
   update public.sessions set state='closed',closed_at=clock_timestamp(),closed_by='stop' where id=s.id returning revision into v_rev;
   p_input:=jsonb_set(p_input,'{revision}',to_jsonb(v_rev));
  end if;
 end if;
 return private.show_write_pre_admin_delete(p_engagement,p_action,p_input);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid_request');
end $$;

revoke all on function private.show_write(uuid,text,jsonb),private.show_write_pre_admin_delete(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.show_write(uuid,text,jsonb) to authenticated;

commit;
