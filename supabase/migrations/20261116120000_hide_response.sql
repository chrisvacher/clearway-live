-- Batch 1 (November 15): hide a response (MD-1).
--
-- Hiding is already in the room: a free-text answer is hidden by its id (submissions.hidden) and a word by its key
-- (sessions.hidden_keys), and the TV, the count badges and AI grouping already leave hidden answers out. This adds:
-- 1. Who hid it and when, for the Responses list: hidden_by and hidden_at on an answer, and hidden_meta (key to who and
--    when) beside a step's hidden words. Triggers fill them on every path that hides, so no control function changes.
-- 2. Only the facilitator and co-facilitator hide. A team facilitator's remote no longer can (the scribe never could).
-- 3. The Room admin's "Answered this session" leaves out a person whose only answers are hidden, like the TV's people badge.
-- 4. The report leaves hidden answers out: a hidden answer is no longer a live source for a report sentence.
-- 5. The control surface's item list carries who hid each hidden item and when.
-- room_control and control_status keep every line they have; their definitions are read from the database and rewritten.
begin;

-- ---------- 1. Who and when ----------
alter table public.submissions add column hidden_by uuid references public.clearway_users(id) on delete set null, add column hidden_at timestamptz;
create index submissions_hidden_by_idx on public.submissions(hidden_by);
create function private.submission_hidden() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.hidden and not old.hidden then new.hidden_at:=now(); new.hidden_by:=private.clearway_user_id();
 elsif not new.hidden then new.hidden_at:=null; new.hidden_by:=null; end if;
 return new;
end $$;
revoke all on function private.submission_hidden() from public,anon,authenticated;
create trigger submission_hidden before update of hidden on public.submissions for each row execute function private.submission_hidden();

alter table public.sessions add column hidden_meta jsonb not null default '{}'::jsonb;
create function private.session_hidden_keys() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; meta jsonb:=coalesce(old.hidden_meta,'{}'::jsonb); who uuid:=private.clearway_user_id();
begin
 for k in select x from unnest(coalesce(new.hidden_keys,array[]::text[])) x except select y from unnest(coalesce(old.hidden_keys,array[]::text[])) y loop
  meta:=meta||jsonb_build_object(k,jsonb_build_object('by',who,'at',now()));
 end loop;
 for k in select y from unnest(coalesce(old.hidden_keys,array[]::text[])) y except select x from unnest(coalesce(new.hidden_keys,array[]::text[])) x loop
  meta:=meta-k;
 end loop;
 new.hidden_meta:=meta;
 return new;
end $$;
revoke all on function private.session_hidden_keys() from public,anon,authenticated;
create trigger session_hidden_keys before update of hidden_keys on public.sessions for each row
 when (old.hidden_keys is distinct from new.hidden_keys) execute function private.session_hidden_keys();

-- ---------- 5. Who hid each item, for the control surface ----------
create function private.items_with_hides(p_session uuid,p_items jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when coalesce((i->>'hidden')::boolean,false) then i||coalesce((
   select jsonb_build_object('hidden_at',h.at,'hidden_by',(select split_part(btrim(coalesce(u.name,'')),' ',1) from public.clearway_users u where u.id=h.by))
   from (select x.hidden_at at,x.hidden_by by from public.submissions x where x.session_id=p_session and x.id::text=i->>'key'
         union all select (s.hidden_meta->(i->>'key')->>'at')::timestamptz,(s.hidden_meta->(i->>'key')->>'by')::uuid from public.sessions s where s.id=p_session and s.hidden_meta ? (i->>'key')
         limit 1) h),'{}'::jsonb) else i end order by n),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end) with ordinality t(i,n)
$$;
revoke all on function private.items_with_hides(uuid,jsonb) from public,anon,authenticated;

do $patch$
declare def text; patched text;
begin
 -- ---------- 2. Only the facilitators hide ----------
 def:=pg_get_functiondef('private.room_control(uuid,uuid,text,jsonb)'::regprocedure);
 patched:=replace(def,'''phones_down'',''open_phones'',''spotlight'',''clear_spotlight'',''hide'',''unhide'',''room_size'')',
  '''phones_down'',''open_phones'',''spotlight'',''clear_spotlight'',''room_size'')');
 if patched=def then raise exception 'The team list in room_control did not patch cleanly'; end if;
 execute patched;

 -- ---------- 3 and 5. The control surface's counts and items ----------
 def:=pg_get_functiondef('private.control_status(uuid)'::regprocedure);
 patched:=replace(def,'''answered'',(select count(distinct attendee_id) from public.submissions where session_id=s.id and not deleted and not withdrawn),',
  '''answered'',(select count(distinct attendee_id) from public.submissions where session_id=s.id and not deleted and not withdrawn and not hidden),');
 if patched=def then raise exception 'The answered count in control_status did not patch cleanly'; end if;
 def:=patched;
 patched:=replace(def,'''items'',private.session_items(s.interaction,s.id,r.hidden_keys),','''items'',private.items_with_hides(s.id,private.session_items(s.interaction,s.id,r.hidden_keys)),');
 if patched=def then raise exception 'The items in control_status did not patch cleanly'; end if;
 execute patched;

 -- ---------- 4. The report ----------
 def:=pg_get_functiondef('private.rp_source_live(uuid,text,uuid)'::regprocedure);
 patched:=replace(def,'when ''submission'' then exists(select 1 from public.submissions x where x.id=p_ref and x.engagement_id=p_engagement and not x.deleted)',
  'when ''submission'' then exists(select 1 from public.submissions x where x.id=p_ref and x.engagement_id=p_engagement and not x.deleted and not x.hidden)');
 if patched=def then raise exception 'The submission source in rp_source_live did not patch cleanly'; end if;
 execute patched;
end $patch$;

commit;
