-- Milestone 2, PR 5: participant phones in the live room.
-- Live only, after merge. No data is seeded here.
begin;

-- A phone's own view of the room: the steps the room has reached (never ahead),
-- with the public prompt and phone depth, and the person's own answers. Nothing
-- about anyone else, no presenter notes, planning times or hidden flags.
create function private.phone_room(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare who uuid; base integer;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
 if who is null then return jsonb_build_object('status','denied'); end if;
 select base_year into base from public.engagements where id=p_engagement;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),
  'name',(select split_part(btrim(name),' ',1) from public.attendees where id=who),
  'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'part',s.part,'segment',s.segment,'interaction',s.interaction,'state',s.state,
    'prompt',private.fill_years(s.prompt,base),'phone_depth',private.fill_years(s.phone_depth,base),
    'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'closed_at',s.closed_at)
    order by private.part_order(s.part),s.position,s.id)
   from (select * from public.sessions where engagement_id=p_engagement and not deleted and mode='live' and shown_at is not null
     order by private.part_order(part),position,id limit 500) s),'[]'::jsonb),
  'answers',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'session_id',x.session_id,'text',x.text,'revision',x.revision,'withdrawn',x.withdrawn,'created_at',x.created_at)
    order by x.created_at,x.id)
   from (select * from public.submissions where engagement_id=p_engagement and attendee_id=who and not deleted order by created_at,id limit 2000) x),'[]'::jsonb));
end $$;
create function public.phone_room(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.phone_room(p_engagement) $$;
revoke all on function private.phone_room(uuid),public.phone_room(uuid) from public,anon,authenticated;
grant execute on function private.phone_room(uuid),public.phone_room(uuid) to authenticated;
commit;
