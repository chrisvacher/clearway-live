-- Who sees answers, per step (November 20). The facilitator chooses on each answering step whether the answers show to the
-- room (TV and phones) or only to the facilitators. The first use: the NPS question at the end of a workshop as a private 1 to 10
-- scale, and a private testimonial wall.
--
-- 1. The setting lives in sessions.options as "visibility": "public" (the default, also when absent) or "private". It is
--    validated in the options wrapper chain, like untitled, image and timer, so no options_<kind> function changes. Content
--    screens have no setting (the key is dropped). The private form is always private: it stores "private" whatever is sent.
--    The general kinds can be private (interaction_kinds.private_ok). The Wayfinding process kinds (lens wall, four lists,
--    candidates, intent, goals, outcome bullets and confirm, read-back, lens summary) are built around a shared board, so
--    they refuse "private" rather than half-enforce it.
-- 2. A step is private when it is the form, when its visibility is private, or when it is seeded from a private step. While a
--    private step is live, the room state stores counts only ({total, people}): a trigger on room_states strips every write,
--    whichever path made it, so the TV, phones (which can read room_states), the snapshot and every broadcast carry no answer
--    values. The snapshot, the broadcast's answer patch and the facilitator's TV preview send no answers for a private step.
-- 3. Q&A: a private Q&A's questions are never spotlit on the TV, and phones cannot upvote them (they never see the list).
-- 4. A public step cannot be seeded from a private one.
-- 5. Public options carry "visibility": "private" for every private step, so the TV and phones draw the private screens.
-- Facilitator surfaces (control_status items, results, CSV export, recap, AI status) are unchanged and show every answer.
begin;

-- ---------- 1. Which kinds can be private ----------
alter table private.interaction_kinds add column private_ok boolean not null default false;
update private.interaction_kinds set private_ok=true where kind in ('word_cloud','wall','qa','choice','scale','ranking','points','statements','grid','sign','form');

-- ---------- 2. Whether a step is private ----------
create function private.step_private(p_kind text,p_options jsonb,p_seeded uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_kind='form' or coalesce(p_options->>'visibility','')='private'
  or (p_seeded is not null and exists(select 1 from public.sessions f where f.id=p_seeded and (f.interaction='form' or coalesce(f.options->>'visibility','')='private')))
$$;
create function private.session_is_private(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select private.step_private(s.interaction,s.options,s.seeded_from) from public.sessions s where s.id=p_session),false)
$$;
-- Counts only, in the shape every surface reads (words stays an empty list).
create function private.visible_results(p_results jsonb,p_private boolean) returns jsonb
language sql immutable set search_path='' as $$
 select case when not coalesce(p_private,false) or p_results is null then p_results
  else jsonb_build_object('total',coalesce(p_results->'total','0'::jsonb),'people',coalesce(p_results->'people','0'::jsonb),'words','[]'::jsonb) end
$$;
revoke all on function private.step_private(text,jsonb,uuid),private.session_is_private(uuid),private.visible_results(jsonb,boolean) from public,anon,authenticated;

-- ---------- 1. The option ----------
alter function private.session_options(text,jsonb,uuid) rename to session_options_pre_visibility;
create function private.session_options(p_kind text,p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v text; out jsonb; k private.interaction_kinds;
begin
 if jsonb_typeof(coalesce(p,'{}'::jsonb))<>'object' then return private.session_options_pre_visibility(p_kind,p,p_engagement); end if;
 if p ? 'visibility' and (jsonb_typeof(p->'visibility')<>'string' or p->>'visibility' not in ('public','private')) then return null; end if;
 v:=p->>'visibility';
 out:=private.session_options_pre_visibility(p_kind,coalesce(p,'{}'::jsonb)-'visibility',p_engagement);
 if out is null then return null; end if;
 if p_kind='form' then return out||'{"visibility":"private"}'::jsonb; end if;
 select * into k from private.interaction_kinds where kind=p_kind and not deleted;
 if k.kind is null or not k.input then return out; end if;
 if v='private' and not k.private_ok then return null; end if;
 return case when v is null then out else out||jsonb_build_object('visibility',v) end;
end $$;
revoke all on function private.session_options(text,jsonb,uuid),private.session_options_pre_visibility(text,jsonb,uuid) from public,anon,authenticated;

-- ---------- 5. Public options say when a step is private ----------
alter function private.public_options(public.sessions,jsonb) rename to public_options_pre_visibility;
create function private.public_options(p_session public.sessions,p_settings jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.public_options_pre_visibility(p_session,p_settings)
  ||case when private.step_private(p_session.interaction,p_session.options,p_session.seeded_from) then '{"visibility":"private"}'::jsonb else '{}'::jsonb end
$$;
revoke all on function private.public_options(public.sessions,jsonb),private.public_options_pre_visibility(public.sessions,jsonb) from public,anon,authenticated;

-- ---------- 2. The room state holds counts only while a private step is live ----------
-- Runs after every other before trigger on room_states (lens_on_air, ls_on_air, rb_on_air and team_block_guard also write
-- results), so nothing written to the row, and so nothing broadcast or read from it, carries a private step's answers.
create function private.room_private_results() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.live_session_id is not null and new.results is not null and private.session_is_private(new.live_session_id) then
  new.results:=private.visible_results(new.results,true);
 end if;
 return new;
end $$;
revoke all on function private.room_private_results() from public,anon,authenticated;
create trigger zz_private_results before insert or update on public.room_states for each row execute function private.room_private_results();

-- A live step switched between Everyone and Facilitators only (or reseeded) redraws at once: its results are recounted, which
-- also broadcasts the new options.
create function private.room_visibility_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.room_states r set results=private.live_results(r.engagement_id)
 where r.engagement_id=new.engagement_id and not r.deleted and r.live_session_id is not null
   and (r.live_session_id=new.id or exists(select 1 from public.sessions x where x.id=r.live_session_id and x.seeded_from=new.id and not x.deleted));
 return new;
end $$;
revoke all on function private.room_visibility_changed() from public,anon,authenticated;
create trigger room_visibility_changed after update of options,seeded_from on public.sessions for each row
 when (old.options->'visibility' is distinct from new.options->'visibility' or old.seeded_from is distinct from new.seeded_from)
 execute function private.room_visibility_changed();

-- No room's stored results are rewritten here: no step is private yet, and the form's results were already counts only. The
-- trigger applies from the next write, so this migration changes no engagement's data.

-- ---------- 2. The snapshot, the broadcast and the facilitator's preview ----------
-- Each keeps its own text; only the "does this step share answers" test also asks whether the step is private, and the
-- preview's results are counts only for a private step (it draws the TV as the room would see it).
do $patch$
declare def text; patched text; fn text;
begin
 foreach fn in array array['private.live_snapshot(uuid,uuid,bigint)','private.live_broadcast()'] loop
  def:=pg_get_functiondef(fn::regprocedure);
  patched:=replace(def,'select coalesce(k.shares_answers,true) into shares from public.sessions s join private.interaction_kinds k on k.kind=s.interaction',
   'select coalesce(k.shares_answers,true) and not private.step_private(s.interaction,s.options,s.seeded_from) into shares from public.sessions s join private.interaction_kinds k on k.kind=s.interaction');
  if patched=def then raise exception 'The shares test in % did not patch cleanly',fn; end if;
  execute patched;
 end loop;
 def:=pg_get_functiondef('private.session_preview(uuid,uuid)'::regprocedure);
 patched:=replace(def,'select coalesce(k.shares_answers,true) into shares from private.interaction_kinds k where k.kind=s.interaction',
  'select coalesce(k.shares_answers,true) and not private.step_private(s.interaction,s.options,s.seeded_from) into shares from private.interaction_kinds k where k.kind=s.interaction');
 if patched=def then raise exception 'The shares test in session_preview did not patch cleanly'; end if;
 def:=patched;
 patched:=replace(def,'''results'',private.live_results_for(p_engagement,s.id,s.hidden_keys)',
  '''results'',private.visible_results(private.live_results_for(p_engagement,s.id,s.hidden_keys),private.step_private(s.interaction,s.options,s.seeded_from))');
 if patched=def then raise exception 'The results in session_preview did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- ---------- 3. Q&A ----------
-- A private Q&A's question never comes up in the spotlight; the any-time pool still lets phones ask (title and the count only).
alter function private.qa_public(uuid) rename to qa_public_pre_visibility;
create function private.qa_public(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb:=private.qa_public_pre_visibility(p_engagement);
begin
 if jsonb_typeof(b->'spotlight')='object' and private.session_is_private((b->'spotlight'->>'session_id')::uuid) then b:=b||jsonb_build_object('spotlight',null); end if;
 return b;
end $$;
revoke all on function private.qa_public(uuid),private.qa_public_pre_visibility(uuid) from public,anon,authenticated;

-- Phones never see a private Q&A's questions, so they cannot upvote them either.
alter function private.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision) rename to qa_vote_pre_visibility;
create function private.qa_vote(p_engagement uuid,p_id uuid,p_question uuid,p_revision integer,p_on boolean,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_question is not null and exists(select 1 from public.submissions x join public.sessions s on s.id=x.session_id
   where x.id=p_question and x.engagement_id=p_engagement and private.step_private(s.interaction,s.options,s.seeded_from)) then
  if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
  return jsonb_build_object('status','closed');
 end if;
 return private.qa_vote_pre_visibility(p_engagement,p_id,p_question,p_revision,p_on,p_sent,p_queued,p_uncertainty);
end $$;
revoke all on function private.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision),
 private.qa_vote_pre_visibility(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision) from public,anon,authenticated;
grant execute on function private.qa_vote(uuid,uuid,uuid,integer,boolean,timestamptz,timestamptz,double precision) to authenticated;

-- ---------- 4. Seeding ----------
-- A public step seeded from a private one would publish the private answers, so it is refused (a save carrying it fails whole).
alter function private.show_seed_from(uuid,uuid,uuid,integer) rename to show_seed_from_pre_visibility;
create function private.show_seed_from(p_engagement uuid,p_session uuid,p_from uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; f public.sessions;
begin
 if p_from is not null and coalesce(private.show_allowed(p_engagement),false) then
  select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
  select * into f from public.sessions where id=p_from and engagement_id=p_engagement and not deleted;
  if s.id is not null and f.id is not null and not (s.interaction='form' or coalesce(s.options->>'visibility','')='private')
    and private.step_private(f.interaction,f.options,f.seeded_from) then
   return jsonb_build_object('status','private_source');
  end if;
 end if;
 return private.show_seed_from_pre_visibility(p_engagement,p_session,p_from,p_revision);
end $$;
revoke all on function private.show_seed_from(uuid,uuid,uuid,integer),private.show_seed_from_pre_visibility(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.show_seed_from(uuid,uuid,uuid,integer) to authenticated;

commit;
