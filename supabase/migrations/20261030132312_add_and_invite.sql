begin;

-- Save the reviewed people and their immutable invitation snapshot together.
-- A retry reuses the snapshot and never repeats an import over later edits.
create function private.import_and_queue_invites(p_engagement uuid,p_batch uuid,p_people jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare stored_batch private.invitation_batches; attendee_ids uuid[]; requested_people jsonb; saved_people jsonb;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
  if jsonb_typeof(p_people) is distinct from 'array' then raise check_violation; end if;
  if jsonb_array_length(p_people) not between 1 and 50 then raise check_violation; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,1));
  select * into stored_batch from private.invitation_batches where id=p_batch and not deleted;
  if found then
    if stored_batch.engagement_id<>p_engagement then raise insufficient_privilege; end if;
    select jsonb_agg(jsonb_build_object('name',btrim(x->>'name'),'email',lower(btrim(x->>'email'))) order by lower(btrim(x->>'email')))
      into requested_people from jsonb_array_elements(p_people) x;
    select jsonb_agg(jsonb_build_object('name',x->>'name','email',x->>'email') order by x->>'email'),array_agg((x->>'id')::uuid)
      into saved_people,attendee_ids from jsonb_array_elements(stored_batch.payload->'people') x;
    if requested_people is distinct from saved_people then raise check_violation using message='Check the invite recipients before retrying.'; end if;
    return private.queue_engagement_invites(p_engagement,p_batch,attendee_ids);
  end if;
  perform private.import_attendees(p_engagement,p_people);
  select array_agg(a.id order by a.id) into attendee_ids from public.attendees a
    where a.engagement_id=p_engagement and not a.deleted
      and lower(a.email) in(select lower(btrim(x->>'email')) from jsonb_array_elements(p_people) x);
  if cardinality(attendee_ids) is distinct from jsonb_array_length(p_people) then raise check_violation; end if;
  return private.queue_engagement_invites(p_engagement,p_batch,attendee_ids);
end $$;
revoke all on function private.import_and_queue_invites(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.import_and_queue_invites(uuid,uuid,jsonb) to authenticated;
create function public.import_and_queue_invites(p_engagement uuid,p_batch uuid,p_people jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.import_and_queue_invites(p_engagement,p_batch,p_people) $$;
revoke all on function public.import_and_queue_invites(uuid,uuid,jsonb) from public,anon;
grant execute on function public.import_and_queue_invites(uuid,uuid,jsonb) to authenticated;

commit;
