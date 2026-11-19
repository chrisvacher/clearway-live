begin;

-- Two guests joined with different verified Auth identities. Keep both existing device sessions
-- bound to their original principals after consolidating their attendance and answers.
create table private.merged_guest_devices (
  device_session_id uuid primary key references public.device_sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email ~ '@(?:guest|practice)\.clearway\.invalid$')
);
alter table private.merged_guest_devices enable row level security;
alter table private.merged_guest_devices force row level security;
revoke all on private.merged_guest_devices from public,anon,authenticated;
create index merged_guest_devices_user_idx on private.merged_guest_devices(auth_user_id);

create function private.room_device_attests(p_device public.device_sessions, p_person public.attendees, p_user uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select coalesce((p_person).auth_user_id=p_user and (p_person).verified_at is not null,false)
    or exists(select 1 from private.merged_guest_devices identity
      where identity.device_session_id=(p_device).id and identity.auth_user_id=p_user
        and (p_person).room_role='participant' and (p_person).email ~ '@(?:guest|practice)\.clearway\.invalid$'
        and private.room_auth_identity(p_user,(p_device).auth_session_id,identity.email))
$$;
revoke all on function private.room_device_attests(public.device_sessions,public.attendees,uuid) from public,anon,authenticated;

create or replace function private.room_attendee_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.id from public.attendees a
    join public.device_sessions d on d.attendee_id = a.id and d.engagement_id = a.engagement_id
    join public.engagements e on e.id = a.engagement_id
    join public.churches c on c.id = e.church_id
  where (select auth.uid()) is not null and (select private.has_auth_session())
    and private.room_device_attests(d, a, (select auth.uid()))
    and d.auth_session_id = (select private.auth_session_id())
    and not a.deleted and not d.deleted and d.revoked_at is null
    and not e.deleted and e.status <> 'closed' and not c.deleted
$$;

create or replace function private.live_fingerprint(p_engagement uuid) returns text
language sql stable security definer set search_path='' as $$
  select md5(coalesce(string_agg(s.id::text,',' order by s.id),'')) from auth.sessions s join auth.users u on u.id=s.user_id
  where u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) and (
    exists(select 1 from public.device_sessions d join public.attendees a on a.id=d.attendee_id
      where d.engagement_id=p_engagement and d.auth_session_id=s.id and private.room_device_attests(d,a,s.user_id)
      and not a.deleted and not d.deleted and d.revoked_at is null)
    or exists(select 1 from private.live_tv_sessions t where t.engagement_id=p_engagement and t.auth_session_id=s.id
      and t.auth_user_id=s.user_id and not t.deleted and t.revoked_at is null)
    or exists(select 1 from public.clearway_users c where c.auth_user_id=s.user_id and not c.deleted and c.email=lower(u.email)
      and u.email_confirmed_at is not null and c.email ~ '^[^@[:space:]]+@clearway\.co$'
      and exists(select 1 from auth.mfa_amr_claims m where m.session_id=s.id and m.authentication_method='oauth')
      and exists(select 1 from auth.identities i where i.user_id=s.user_id and i.provider='google'
        and lower(i.identity_data->>'email')=c.email and i.identity_data->>'email_verified'='true')
      and (c.is_admin or exists(select 1 from public.engagement_facilitators f where f.engagement_id=p_engagement and f.clearway_user_id=c.id and not f.deleted)))
  )
$$;

create or replace function private.room_presence(p_engagement uuid)
returns table(attendee_id uuid,device_count bigint,present boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) or not private.room_is_open(p_engagement) then return; end if;
  return query select d.attendee_id,count(*),bool_or(d.last_seen_at>now()-interval '45 seconds')
    from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    join auth.sessions s on s.id=d.auth_session_id
    join auth.users u on u.id=s.user_id
    where d.engagement_id=p_engagement and not d.deleted and d.revoked_at is null and not a.deleted
      and private.room_device_attests(d,a,s.user_id) and (s.user_id is distinct from a.auth_user_id or lower(u.email)=a.email) and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<now()) and (s.not_after is null or s.not_after>now())
    group by d.attendee_id;
end $$;

create or replace function private.tv_room_info_pre_skin(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with present as (
  select a.id,split_part(btrim(a.name),' ',1) as name,min(d.created_at) as arrived
  from public.attendees a join public.device_sessions d on d.attendee_id=a.id and d.engagement_id=a.engagement_id
  where a.engagement_id=p_engagement and not a.deleted and (a.verified_at is not null or exists(
    select 1 from private.merged_guest_devices g where g.device_session_id=d.id
      and private.room_device_attests(d,a,g.auth_user_id))) and not d.deleted and d.revoked_at is null
  group by a.id,a.name
 )
 select jsonb_build_object('display',jsonb_build_object('church',c.name,'title',e.title,'logo_url',c.logo_url,'room_code',e.room_code,
  'theme',case when e.settings->>'tv_theme'='light' then 'light' else 'dark' end,'texture',coalesce((e.settings->>'texture')::boolean,true),
  'room_size',case when e.settings->>'room_size' in ('very_small','small','medium','large','very_large') then e.settings->>'room_size' else 'very_small' end,
  'reduced_motion',coalesce((e.settings->>'reduced_motion')::boolean,false),'lens_names',to_jsonb(e.lens_names)),
  'presence',jsonb_build_object('count',(select count(*) from present),'names',coalesce((select jsonb_agg(jsonb_build_object('key',md5(p.id::text||e.id::text),'name',p.name) order by p.arrived,p.id) from (select * from present order by arrived,id limit 14)p),'[]'::jsonb)))
 from public.engagements e join public.churches c on c.id=e.church_id where e.id=p_engagement and not e.deleted and not c.deleted
$$;

-- A guest still resolves their canonical row using the signed-in device, never by submitted user ID.
create function private.room_merged_attendee(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',a.id,'name',a.name,'room_role',a.room_role)
  from public.attendees a
  where a.engagement_id=p_engagement and not a.deleted and a.id in(select private.room_attendee_ids())
    and exists(select 1 from public.device_sessions d join private.merged_guest_devices g on g.device_session_id=d.id
      where d.attendee_id=a.id and d.engagement_id=p_engagement and not d.deleted and d.revoked_at is null
        and d.auth_session_id=(select private.auth_session_id()) and g.auth_user_id=(select auth.uid()))
  limit 1
$$;
create function public.room_merged_attendee(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.room_merged_attendee(p_engagement) $$;
revoke all on function private.room_merged_attendee(uuid),public.room_merged_attendee(uuid) from public,anon,authenticated;
grant execute on function private.room_merged_attendee(uuid),public.room_merged_attendee(uuid) to authenticated;

create function private.attendee_merge(p_engagement uuid,p_keep uuid,p_merge uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  person public.attendees;
  all_people uuid[];
  normalized_name text;
begin
  if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
  if p_keep is null or coalesce(cardinality(p_merge),0) not between 1 and 499
    or p_keep=any(p_merge) or cardinality(p_merge)<>(select count(distinct id) from unnest(p_merge) id) then
    return jsonb_build_object('status','invalid');
  end if;
  -- Follow the room engine's lock order, then lock the roster rows deterministically.
  perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7));
  if not exists(select 1 from public.engagements where id=p_engagement and not deleted and type in ('team_workshop','practice')) then
    return jsonb_build_object('status','invalid');
  end if;
  all_people:=array_prepend(p_keep,p_merge);
  perform 1 from public.attendees where engagement_id=p_engagement and id=any(all_people) order by id for update;
  select * into person from public.attendees where engagement_id=p_engagement and id=any(all_people) and not deleted order by created_at,id limit 1;
  if person.id is distinct from p_keep then return jsonb_build_object('status','invalid'); end if;
  normalized_name:=lower(regexp_replace(btrim(person.name),'[[:space:]]+',' ','g'));
  if cardinality(all_people)<>(select count(*) from public.attendees
      where engagement_id=p_engagement and id=any(all_people) and not deleted
        and email ~ '@(?:guest|practice)\.clearway\.invalid$' and room_role='participant'
        and lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=normalized_name)
    or exists(select 1 from private.team_blocks where engagement_id=p_engagement and attendee_id=any(all_people)
        and ended_at is null and not deleted)
    or exists(select 1 from public.room_states where engagement_id=p_engagement and remote_holder_id=any(all_people) and not deleted) then
    return jsonb_build_object('status','invalid');
  end if;

  insert into private.merged_guest_devices(device_session_id,auth_user_id,email)
    select d.id,a.auth_user_id,a.email from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    where d.engagement_id=p_engagement and d.attendee_id=any(p_merge) and not d.deleted and d.revoked_at is null
      and a.verified_at is not null and private.room_auth_identity(a.auth_user_id,d.auth_session_id,a.email)
    on conflict(device_session_id) do nothing;
  -- A repeated Auth session can only assert one original identity. Prefer its verified binding.
  with copies as (
    select d.id,row_number() over(partition by d.auth_session_id order by
      (d.revoked_at is null and private.room_device_attests(d,a,s.user_id)) desc, (d.attendee_id=p_keep) desc,d.id) as rank
    from public.device_sessions d join public.attendees a on a.id=d.attendee_id
    left join auth.sessions s on s.id=d.auth_session_id
    where d.engagement_id=p_engagement and d.attendee_id=any(all_people) and not d.deleted
  )
  update public.device_sessions d set deleted=true,revoked_at=coalesce(d.revoked_at,now()) from copies c where c.id=d.id and c.rank>1;
  update public.device_sessions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.room_auth_devices set attendee_id=p_keep,granted_at=null,claim_id=null,claim_started_at=null
    where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.room_auth_challenges set attendee_id=p_keep,consumed_at=coalesce(consumed_at,now())
    where engagement_id=p_engagement and attendee_id=any(p_merge);
  update public.join_requests set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  -- Answer rows stay intact. Distinct attendee aggregations now count the merged person once.
  update public.submissions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.bullet_drafts set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.candidate_suggestions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.ranking_suggestions set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.lens_sentences set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.scribe_cards set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.scribe_files set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.read_back_corrections set by_attendee=p_keep where engagement_id=p_engagement and by_attendee=any(p_merge);
  update private.goals set owner_attendee_id=p_keep where engagement_id=p_engagement and owner_attendee_id=any(p_merge);
  update private.goals set proposed_by=p_keep where engagement_id=p_engagement and proposed_by=any(p_merge);
  update private.first_steps set owner_attendee_id=p_keep where engagement_id=p_engagement and owner_attendee_id=any(p_merge);
  update private.risks set added_by=p_keep where engagement_id=p_engagement and added_by=any(p_merge);
  update private.followup_access set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.team_blocks set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update private.check_in_recipients set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);
  update public.room_states set remote_holder_id=p_keep where engagement_id=p_engagement and remote_holder_id=any(p_merge);

  -- Deduplicate per-person votes according to the same uniqueness rules as a normal room.
  with copies as (
    select id,row_number() over(partition by question_id order by (attendee_id=p_keep) desc,id) as rank
    from private.qa_votes where engagement_id=p_engagement and attendee_id=any(all_people) and not deleted
  )
  update private.qa_votes v set deleted=true from copies c where c.id=v.id and c.rank>1;
  update private.qa_votes set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  with copies as (
    select id,row_number() over(partition by card_id,test order by (attendee_id=p_keep) desc,id) as rank
    from private.four_list_agrees where engagement_id=p_engagement and attendee_id=any(all_people) and not deleted
  )
  update private.four_list_agrees v set deleted=true from copies c where c.id=v.id and c.rank>1;
  update private.four_list_agrees set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  with copies as (
    select id,row_number() over(partition by version_id order by updated_at desc,id) as rank
    from private.lens_summary_responses where engagement_id=p_engagement and attendee_id=any(all_people) and not deleted
  )
  update private.lens_summary_responses v set deleted=true from copies c where c.id=v.id and c.rank>1;
  update private.lens_summary_responses set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  with copies as (
    select card_id,attendee_id,row_number() over(partition by card_id order by deleted,(attendee_id=p_keep) desc,attendee_id) as rank
    from private.intent_card_people where engagement_id=p_engagement and attendee_id=any(all_people)
  )
  delete from private.intent_card_people v using copies c where v.card_id=c.card_id and v.attendee_id=c.attendee_id and c.rank>1;
  update private.intent_card_people set attendee_id=p_keep where engagement_id=p_engagement and attendee_id=any(p_merge);

  update public.attendees set deleted=true where engagement_id=p_engagement and id=any(p_merge);
  return jsonb_build_object('status','ok');
end $$;

create function public.attendee_merge(p_engagement uuid,p_keep uuid,p_merge uuid[]) returns jsonb
language sql security invoker set search_path='' as $$ select private.attendee_merge(p_engagement,p_keep,p_merge) $$;
revoke all on function private.attendee_merge(uuid,uuid,uuid[]),public.attendee_merge(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.attendee_merge(uuid,uuid,uuid[]),public.attendee_merge(uuid,uuid,uuid[]) to authenticated;

commit;
