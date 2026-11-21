begin;
alter function private.control_status(uuid) rename to control_status_pre_private_results;
create function private.control_status(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; sid uuid; step public.sessions; recent jsonb;
begin
 payload:=private.control_status_pre_private_results(p_engagement);
 if payload->>'status' is distinct from 'ok' then return payload; end if;
 select live_session_id into sid from public.room_states where engagement_id=p_engagement and not deleted;
 select * into step from public.sessions where id=sid and not deleted;
 if step.interaction in ('word_cloud','wall','qa','form','sign') and private.session_is_private(sid) then
  select coalesce(jsonb_agg(jsonb_build_object('key',x.id,'text',case step.interaction
      when 'form' then (select string_agg(t.value,' · ' order by t.key) from jsonb_each_text(x.value->'answers') t)
      when 'sign' then coalesce(x.value->>'name',x.text)
      else x.text end) order by x.server_received_at desc,x.id),'[]'::jsonb) into recent
  from (select id,text,value,server_received_at from public.submissions where session_id=sid and not deleted and not withdrawn order by server_received_at desc,id limit 5) x;
 end if;
 return payload||jsonb_build_object('live_session_id',sid,'recent_items',coalesce(recent,'[]'::jsonb));
end $$;
revoke all on function private.control_status(uuid),private.control_status_pre_private_results(uuid) from public,anon,authenticated;
grant execute on function private.control_status(uuid) to authenticated;
commit;
