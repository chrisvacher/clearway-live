-- Milestone 5, step 3b: promoting a scribe quote to the TV (PromotedQuote, FAC-01).
--
-- A facilitator promotes a quote card from the scribe feed; every TV shows its words in the pass 3
-- spotlight with the Scripture screen's light and bold treatment, anonymously. Take down returns
-- the TV to the live step exactly as it was.
--
-- * The promotion lives on the card (private.scribe_cards), so Reset practice room and Clear test
--   answers, which already delete the cards, clear it with no change to either function.
-- * The words are copied at promotion (promoted_text): an edit on the scribe console afterwards
--   never changes what the TV shows.
-- * The shared room state carries `promoted_quote`: the words and the live step's name. Never the
--   card id, the speaker, the scribe or a time. private.live_public_state is wrapped (renamed to
--   live_public_state_pre_quote and called by the new one), so every field and rule it has stays.
-- * It comes down by itself when the live step changes or the TV leaves the step (a trigger on
--   room_states), and when a Spotlight starts (one thing over the screen at a time).
-- * private.scribe_state is wrapped the same way to tell facilitators which card is on the TV.
-- Nothing here touches Team Hub or CORE.

-- ---------- The promotion, on the card ----------
alter table private.scribe_cards
 add column promoted_session uuid,
 add column promoted_text text check(promoted_text is null or length(btrim(promoted_text)) between 1 and 2000),
 add column promoted_at timestamptz,
 add constraint scribe_cards_promoted_together check((promoted_session is null)=(promoted_text is null) and (promoted_text is null)=(promoted_at is null));
-- One promoted quote at a time per engagement.
create unique index scribe_cards_one_promoted on private.scribe_cards(engagement_id) where promoted_at is not null and not deleted;

-- The card on the TV now: promoted for the step that is live, with the TV on that step.
create function private.promoted_card(p_engagement uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select k.id from private.scribe_cards k join public.room_states r on r.engagement_id=k.engagement_id and not r.deleted
 where k.engagement_id=p_engagement and not k.deleted and k.kind='quote' and k.promoted_at is not null
  and r.tv_content='session' and r.live_session_id is not null and k.promoted_session=r.live_session_id
$$;

-- What every screen gets: the words and the step's name. No id, no speaker, no scribe, no time.
create function private.promoted_quote_public(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('text',k.promoted_text,'session',s.title)
 from private.scribe_cards k join public.sessions s on s.id=k.promoted_session and s.engagement_id=k.engagement_id and not s.deleted
 where k.id=private.promoted_card(p_engagement)
$$;

-- ---------- The shared state carries it ----------
alter function private.live_public_state(uuid) rename to live_public_state_pre_quote;
revoke all on function private.live_public_state_pre_quote(uuid) from public,anon,authenticated;
create function private.live_public_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select b||jsonb_build_object('promoted_quote',private.promoted_quote_public(p_engagement)) from (select private.live_public_state_pre_quote(p_engagement) b) x
$$;
revoke all on function private.live_public_state(uuid) from public,anon,authenticated;

-- ---------- Facilitators learn which card is on the TV ----------
alter function private.scribe_state(uuid) rename to scribe_state_pre_quote;
revoke all on function private.scribe_state_pre_quote(uuid) from public,anon,authenticated;
create function private.scribe_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b->>'status'='ok' and b->>'role'='facilitator' then b||jsonb_build_object('promoted',private.promoted_card(p_engagement)) else b end
 from (select private.scribe_state_pre_quote(p_engagement) b) x
$$;
revoke all on function private.scribe_state(uuid) from public,anon,authenticated;
grant execute on function private.scribe_state(uuid) to authenticated;

-- ---------- Promote and take down ----------
-- Facilitators of this engagement only (the lead, a co-facilitator, an admin). Decided under the
-- room lock, so two remotes pressing together leave one quote. A repeat does nothing.
create function private.quote_promote(p_engagement uuid,p_card uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; k private.scribe_cards;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if p_card is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into s from public.sessions where id=r.live_session_id and engagement_id=p_engagement and not deleted;
 if r.tv_content<>'session' or not found then return jsonb_build_object('status','nothing_live'); end if;
 if s.team_led then return jsonb_build_object('status','team_led'); end if;
 select * into k from private.scribe_cards where id=p_card and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if k.kind<>'quote' then return jsonb_build_object('status','not_a_quote'); end if;
 if length(btrim(k.text))=0 then return jsonb_build_object('status','no_words'); end if;
 if private.promoted_card(p_engagement)=p_card then return jsonb_build_object('status','unchanged','version',r.version); end if;
 update private.scribe_cards set promoted_session=null,promoted_text=null,promoted_at=null where engagement_id=p_engagement and promoted_at is not null and id<>p_card;
 update private.scribe_cards set promoted_session=s.id,promoted_text=btrim(k.text),promoted_at=clock_timestamp() where id=p_card;
 -- One thing over the screen at a time: a spotlight on an item or a question gives way to the quote.
 update public.room_states set spotlight_key=null,spotlight_id=null where engagement_id=p_engagement returning * into r;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','promoted'));
 return jsonb_build_object('status','ok','version',r.version);
end $$;

create function private.quote_take_down(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if not exists(select 1 from private.scribe_cards where engagement_id=p_engagement and promoted_at is not null and not deleted) then return jsonb_build_object('status','unchanged','version',r.version); end if;
 update private.scribe_cards set promoted_session=null,promoted_text=null,promoted_at=null where engagement_id=p_engagement and promoted_at is not null;
 update public.room_states set spotlight_key=spotlight_key where engagement_id=p_engagement returning * into r;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','promoted'));
 return jsonb_build_object('status','ok','version',r.version);
end $$;

-- ---------- It comes down by itself ----------
-- When the live step changes, the TV leaves the step (holding, join, screen check) or a spotlight
-- starts. Each happens in a room_states update, so the same version carries the change to every screen.
create function private.promoted_quote_clear() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.live_session_id is distinct from old.live_session_id or new.tv_content is distinct from old.tv_content
  or (new.spotlight_key is not null and new.spotlight_key is distinct from old.spotlight_key)
  or (new.spotlight_id is not null and new.spotlight_id is distinct from old.spotlight_id) then
  update private.scribe_cards set promoted_session=null,promoted_text=null,promoted_at=null where engagement_id=new.engagement_id and promoted_at is not null;
 end if;
 return new;
end $$;
revoke all on function private.promoted_quote_clear() from public,anon,authenticated;
create trigger promoted_quote_clear before update on public.room_states for each row execute function private.promoted_quote_clear();

-- ---------- Public entry points (invokers; the checks are in the private functions) ----------
create function public.quote_promote(p_engagement uuid,p_card uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.quote_promote(p_engagement,p_card) $$;
create function public.quote_take_down(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.quote_take_down(p_engagement) $$;

revoke all on function private.promoted_card(uuid),private.promoted_quote_public(uuid),private.quote_promote(uuid,uuid),private.quote_take_down(uuid),
 public.quote_promote(uuid,uuid),public.quote_take_down(uuid) from public,anon,authenticated;
grant execute on function private.quote_promote(uuid,uuid),private.quote_take_down(uuid),public.quote_promote(uuid,uuid),public.quote_take_down(uuid) to authenticated;
