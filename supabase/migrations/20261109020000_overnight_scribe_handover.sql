begin;

-- Overnight acceptance fixes, part 1 of 2: the remote can be handed over from the first step of the
-- team-led block, as the PRD's 1:00 row has it ("The team takes the remote"), and still from
-- the commander's intent step.
--
-- private.team_run is redefined as a superset of its definition in
-- 20261104140000_handover_intent.sql. A live step that is a commander's intent or sign step
-- gives the run around it, exactly as before. A live step flagged team-led that is neither,
-- and that sits directly before such a run, gives the run that follows it: the block the team
-- facilitator will run. The hand-over step itself is not part of the block, so the team remote
-- still lists only the intent and affirming steps.
create or replace function private.team_run(p_engagement uuid,p_session uuid) returns uuid[]
language sql stable security definer set search_path='' as $$
 with ordered as (
  select s.id,s.interaction,s.team_led,row_number() over(order by private.part_order(s.part),s.position,s.id) rn
  from public.sessions s where s.engagement_id=p_engagement and not s.deleted and s.mode='live'),
 marked as (select id,rn,rn-row_number() over(order by rn) grp from ordered where interaction in('intent','sign')),
 start as (
  select p_session as id where exists(select 1 from marked where id=p_session)
  union all
  select n.id from ordered o join ordered n on n.rn=o.rn+1
   where o.id=p_session and o.team_led and o.interaction not in('intent','sign') and exists(select 1 from marked m where m.id=n.id))
 select array_agg(id order by rn) from marked where grp=(select grp from marked where id=(select id from start limit 1))
$$;

-- ---------- Part 2 of 2: a scribe's Mitigation card lands on the pre-mortem risk ----------
-- The PRD and the milestone 5 brief say a Mitigation card is linked to the risk it answers, and
-- private.risk_mitigations already carries recorded_by = 'scribe' for it. Until now nothing wrote
-- the row. The scribe names the risk in the card's own words (the risk detail, no pick list), so
-- the link is made by those words: a risk of this engagement whose words match, ignoring case,
-- spacing and closing punctuation, and only when exactly one does. A reason holds at most three
-- mitigations (docs/premortem-goals.md), so a card that would be the fourth stays a card and is
-- not linked. Each row remembers its card, so an edit of the card moves or updates the row.
alter table private.risk_mitigations add column card_id uuid references private.scribe_cards(id);
create unique index risk_mitigations_card_idx on private.risk_mitigations(card_id) where card_id is not null and not deleted;

create function private.risk_words(p_text text) returns text
language sql immutable set search_path='' as $$
 select lower(btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g'),' .,;:!?'))
$$;
revoke all on function private.risk_words(text) from public,anon,authenticated;

-- Idempotent: makes the card's row match what the card says now. Returns nothing.
create function private.scribe_link_mitigation(p_engagement uuid,p_card uuid) returns void
language plpgsql security definer set search_path='' as $$
declare k private.scribe_cards; existing private.risk_mitigations; v_risk uuid; n integer; v_words text; changed uuid[]:=array[]::uuid[];
begin
 select * into k from private.scribe_cards where id=p_card and engagement_id=p_engagement and not deleted;
 if not found or k.kind<>'mitigation' then return; end if;
 perform private.reasons_sync(p_engagement,k.session_id);
 v_words:=private.risk_words(k.detail->>'risk');
 if v_words<>'' then
  select min(r.id::text)::uuid,count(*) into v_risk,n from private.risks r where r.engagement_id=p_engagement and not r.deleted and private.risk_words(r.text)=v_words;
  if n<>1 then v_risk:=null; end if;
 end if;
 -- One writer at a time on a risk, so two scribes cannot both take its last place.
 if v_risk is not null then
  perform 1 from private.risks where id=v_risk and engagement_id=p_engagement for update;
  if (select count(*) from private.risk_mitigations m where m.risk_id=v_risk and not m.deleted and m.card_id is distinct from p_card)>=3 then v_risk:=null; end if;
 end if;
 select * into existing from private.risk_mitigations where card_id=p_card and not deleted for update;
 if existing.id is not null and existing.risk_id is distinct from v_risk then
  update private.risk_mitigations set deleted=true,updated_at=now() where id=existing.id;
  changed:=changed||existing.risk_id;
  existing:=null;
 end if;
 if v_risk is not null then
  if existing.id is null then
   insert into private.risk_mitigations(engagement_id,risk_id,text,recorded_by,card_id,created_at) values(p_engagement,v_risk,left(k.text,300),'scribe',p_card,clock_timestamp());
   changed:=changed||v_risk;
  elsif existing.text is distinct from left(k.text,300) then
   update private.risk_mitigations set text=left(k.text,300),updated_at=now() where id=existing.id;
   changed:=changed||v_risk;
  end if;
 end if;
 -- The TV and the control surface read the room's results: refresh them when the live step is the pre-mortem.
 if cardinality(changed)>0 then
  update public.room_states set results=private.live_results(p_engagement)
   where engagement_id=p_engagement and not deleted and live_session_id in(select session_id from private.risks where id=any(changed));
 end if;
end $$;
revoke all on function private.scribe_link_mitigation(uuid,uuid) from public,anon,authenticated;

alter function private.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz) rename to scribe_capture_pre_mitigation;
revoke all on function private.scribe_capture_pre_mitigation(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz) from public,anon,authenticated;
create function private.scribe_capture(p_engagement uuid,p_id uuid,p_session uuid,p_kind text,p_text text,p_detail jsonb,p_speaker text,p_captured timestamptz,p_queued timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.scribe_capture_pre_mitigation(p_engagement,p_id,p_session,p_kind,p_text,p_detail,p_speaker,p_captured,p_queued);
 if out->>'status'='accepted' and p_kind='mitigation' then perform private.scribe_link_mitigation(p_engagement,p_id); end if;
 return out;
end $$;
revoke all on function private.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function private.scribe_capture(uuid,uuid,uuid,text,text,jsonb,text,timestamptz,timestamptz) to authenticated;

alter function private.scribe_edit(uuid,uuid,text,jsonb,text,integer) rename to scribe_edit_pre_mitigation;
revoke all on function private.scribe_edit_pre_mitigation(uuid,uuid,text,jsonb,text,integer) from public,anon,authenticated;
create function private.scribe_edit(p_engagement uuid,p_id uuid,p_text text,p_detail jsonb,p_speaker text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.scribe_edit_pre_mitigation(p_engagement,p_id,p_text,p_detail,p_speaker,p_revision);
 if out->>'status'='ok' then perform private.scribe_link_mitigation(p_engagement,p_id); end if;
 return out;
end $$;
revoke all on function private.scribe_edit(uuid,uuid,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function private.scribe_edit(uuid,uuid,text,jsonb,text,integer) to authenticated;

-- A mitigation card says whether it is on a risk, so the scribe is never left guessing.
alter function private.scribe_state(uuid) rename to scribe_state_pre_mitigation;
revoke all on function private.scribe_state_pre_mitigation(uuid) from public,anon,authenticated;
create function private.scribe_state(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when b->>'status'='ok' then b||jsonb_build_object('cards',coalesce((select jsonb_agg(
   case when t.c->>'kind'='mitigation' then t.c||jsonb_build_object('linked',exists(select 1 from private.risk_mitigations m where m.card_id=(t.c->>'id')::uuid and not m.deleted)) else t.c end order by t.o)
   from jsonb_array_elements(b->'cards') with ordinality as t(c,o)),'[]'::jsonb)) else b end
 from (select private.scribe_state_pre_mitigation(p_engagement) b) x
$$;
revoke all on function private.scribe_state(uuid) from public,anon,authenticated;
grant execute on function private.scribe_state(uuid) to authenticated;

commit;
