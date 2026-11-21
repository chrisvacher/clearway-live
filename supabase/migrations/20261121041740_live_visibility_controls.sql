begin;
alter function private.show_write(uuid,text,jsonb) rename to show_write_pre_live_visibility;
create function private.show_write(p_engagement uuid,p_action text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; opts jsonb;
begin
 if p_action<>'visibility' then return private.show_write_pre_live_visibility(p_engagement,p_action,p_input); end if;
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 perform 1 from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if jsonb_typeof(p_input) is distinct from 'object' or p_input-'session'-'visibility'<>'{}'::jsonb
  or coalesce(p_input->>'visibility','') not in ('public','private') or coalesce(p_input->>'session','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=(p_input->>'session')::uuid and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if s.interaction='form' or not exists(select 1 from private.interaction_kinds where kind=s.interaction and private_ok and not deleted)
 then return jsonb_build_object('status','invalid_request'); end if;
 if p_input->>'visibility'='public' and s.seeded_from is not null and private.session_is_private(s.seeded_from) then return jsonb_build_object('status','private_source'); end if;
 opts:=private.session_options(s.interaction,(s.options-'visibility')||jsonb_build_object('visibility',p_input->>'visibility'),p_engagement);
 if opts is null then return jsonb_build_object('status','invalid_request'); end if;
 update public.sessions set options=jsonb_set(s.options,'{visibility}',opts->'visibility') where id=s.id and s.options->'visibility' is distinct from opts->'visibility';
 if found then perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action','visibility')); end if;
 return jsonb_build_object('status','ok');
end $$;
revoke all on function private.show_write(uuid,text,jsonb),private.show_write_pre_live_visibility(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.show_write(uuid,text,jsonb) to authenticated;
-- Hidden and spotlit answer keys can be derived from the answer text. Keep them on the
-- authoritative row for moderation, and omit them from the room's public payload.
alter function private.live_public_state(uuid) rename to live_public_state_pre_live_visibility;
create function private.live_public_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 payload:=private.live_public_state_pre_live_visibility(p_engagement);
 if payload->'session'->'options'->>'visibility'='private' then
  payload:=jsonb_set(payload,'{state}',(payload->'state')-'spotlight_key'-'spotlight_id'-'hidden_keys'-'hidden_ids');
 end if;
 return payload;
end $$;
revoke all on function private.live_public_state(uuid),private.live_public_state_pre_live_visibility(uuid) from public,anon,authenticated;
commit;
