-- Milestone 6 practice-room fixes A: the Four Helpful Lists.
--
-- 1. The AI folded unrelated cards ("Giving is strong and generous" under "Preaching is strong and clear"). The prompt is tightened
--    (fold-four-lists@2, in lib/ai/prompts.ts) and, here, the database refuses any fold whose member shares no meaningful word with
--    its survivor: private.four_lists_share_word drops stop words and generic praise or judgement words, folds simple plurals and -ing,
--    and ai_apply refuses the group with the reason 'unrelated'.
-- 2. A folded card showed an agree nobody gave. The board counted the writer of every card folded beneath a survivor as agreeing
--    (the union in its people list, written in step 2 so that two people who wrote the same words counted as two). Agreement is now
--    the distinct people who pressed Agree on the survivor or on any card folded into it, never a writer of any card in the group.
--    It is the one number every screen and the CSV read (the TV, the phones, the control surface, SET-05).
--
-- Shared objects changed (each a superset of its newest earlier definition; nothing else changes):
--   private.ai_apply_pre_signal   step 2's fold_four_lists apply (20261106020000), reached through the ai_apply wrappers of
--                                 20261106050100 and 20261106070000: the same body plus one refusal ('unrelated') before the numbers check
--   private.four_lists_board      step 2's board (20261106020000): the people list no longer adds the writers of folded cards
-- New: private.four_lists_stems(text), private.four_lists_share_word(text,text).
begin;

-- The words that carry what a card is about: lower case, apostrophes dropped, split on anything that is not a letter or digit, stop words
-- and generic praise or judgement words removed (contractions count as stop words), then a simple stem: -ies to -y or a plural -s off, then -ing or -ed off,
-- a doubled last consonant undone, then a final -e off ("giving", "gives" and "give" meet; "roles" and "role" meet).
create or replace function private.four_lists_stems(p_text text) returns text[]
language plpgsql immutable security invoker set search_path='' as $$
declare w text; s text; out text[]:=array[]::text[];
 skip constant text[]:=array[
  'a','an','the','and','or','but','nor','so','of','to','in','on','at','for','with','by','from','as','into','about','over','than','then','if','too','also','just',
  'is','are','was','were','be','been','being','am','it','its','this','that','these','those','there','here','we','our','ours','us','you','your','they','their','them','he','she','his','her','i','my','me',
  'not','no','do','does','did','have','has','had','can','could','will','would','should','may','might','must','what','who','how','when','where','why','which','all','any','some','one',
  'more','less','most','least','very','really','much','many','lot','lots','enough','still','always','never','often','sometimes','now','today',
  'strong','stronger','strongest','strength','strengths','good','great','nice','fine','best','better','worse','worst','bad','poor','weak','weakness','big','small','real','clear','unclear',
  'confusing','confused','confusion','important','needs','need','needed','lack','lacking','lacks','missing','wrong','right','issue','issues','problem','problems','thing','things','way',
  'church','churches','people','person','everyone','someone','anyone','feel','feels','seem','seems','get','gets','make','makes',
  'dont','doesnt','didnt','isnt','arent','wasnt','werent','cant','couldnt','wont','wouldnt','shouldnt','havent','hasnt','hadnt','theres','theyre','youre','weve','ive','im','whats','lets','nobody','nothing',
  'amazing','excellent','awesome','wonderful','healthy','solid','positive','negative','hard','easy','well','high','low','team','time'];
begin
 for w in select x from regexp_split_to_table(lower(replace(replace(coalesce(p_text,''),chr(39),''),chr(8217),'')),'[^[:alnum:]]+') x loop
  continue when w='' or w=any(skip);
  s:=w;
  if s ~ '^.{3,}ies$' then s:=regexp_replace(s,'ies$','y');
  elsif length(s)>3 and s ~ 's$' and s !~ '(ss|us|is)$' then s:=left(s,-1);
  end if;
  -- The stop list again after the plural: "whats" is "what", "times" is "time".
  continue when s=any(skip);
  if s ~ '^.{3,}ing$' then s:=regexp_replace(s,'ing$','');
  elsif s ~ '^.{3,}ed$' then s:=regexp_replace(s,'ed$','');
  end if;
  -- A doubled last consonant goes whatever stripped it: "staffing" and "staff" meet, "planned" and "plan" meet.
  if s ~ '([b-df-hj-np-tv-z])\1$' then s:=left(s,-1); end if;
  if length(s)>3 and s ~ 'e$' then s:=left(s,-1); end if;
  out:=out||s;
 end loop;
 return out;
end $$;

-- True when two cards share at least one meaningful word.
create or replace function private.four_lists_share_word(p_a text,p_b text) returns boolean
language sql immutable security invoker set search_path='' as $$
 select private.four_lists_stems(p_a) && private.four_lists_stems(p_b)
$$;
revoke all on function private.four_lists_stems(text),private.four_lists_share_word(text,text) from public,anon,authenticated;
grant execute on function private.four_lists_stems(text),private.four_lists_share_word(text,text) to service_role;

-- ---------- The agree count ----------
-- Agreement is the distinct people who pressed Agree on the survivor or on any card folded beneath it. A person who wrote any card in
-- the group never counts (they cannot agree with their own, and a fold does not turn a writer into an agreer). Undoing a fold gives each
-- card back its own agreers only.
create or replace function private.four_lists_board(p_session uuid,p_all boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 with c as (
  select x.id,x.attendee_id,x.text,x.hidden,coalesce(x.server_received_at,x.created_at) as at,k.col,k.pinned,m.id as merge_id,m.survivor_id,m.made_by
  from public.submissions x join private.four_list_cards k on k.submission_id=x.id and not k.deleted
  left join private.four_list_folds m on m.member_id=x.id and m.undone_at is null and not m.deleted and (m.made_by<>'ai' or private.ai_on(p_session))
  where x.session_id=p_session and not x.deleted and not x.withdrawn
 ), standing as (select * from c where not hidden
 ), rooted as (
  select s.*,case when s.survivor_id is not null and exists(select 1 from standing r where r.id=s.survivor_id) then s.survivor_id else s.id end as root from standing s
 ), grouped as (
  select r.root,count(*)::integer-1 as folded,bool_or(r.made_by='ai' and r.id<>r.root) as ai,
   jsonb_agg(r.id order by r.at,r.id) as ids,
   jsonb_agg(jsonb_build_object('id',r.id,'text',r.text,'merge',r.merge_id,'by',r.made_by) order by r.at,r.id) filter (where r.id<>r.root) as members
  from rooted r group by r.root
 ), people as (
  select r.root,v.attendee_id from (select distinct on (a.card_id,a.attendee_id) a.* from private.four_list_agrees a where a.session_id=p_session and not a.deleted order by a.card_id,a.attendee_id,a.server_received_at desc,a.id) v
   join rooted r on r.id=v.card_id where v.agreed
 ), counted as (
  select p.root,count(distinct p.attendee_id)::integer as agree from people p
  where not exists(select 1 from rooted w where w.root=p.root and w.attendee_id=p.attendee_id) group by p.root
 ), ranked as (
  select g.*,rt.col,rt.text,rt.pinned,rt.at,coalesce(n.agree,0) as agree,
   row_number() over(partition by rt.col order by coalesce(n.agree,0) desc,rt.at,rt.id) as rank
  from grouped g join standing rt on rt.id=g.root left join counted n on n.root=g.root
 )
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',l.root,'column',l.col,'text',l.text,'agree',l.agree,'folded',l.folded,'ai',case when l.ai then true end,
   'pinned',case when l.pinned then true end,'ids',l.ids,'rank',l.rank,'at',(extract(epoch from l.at)*1000)::bigint,
   'members',case when p_all then coalesce(l.members,'[]'::jsonb) end))
   order by array_position(array['right','wrong','missing','confused'],l.col),l.rank),'[]'::jsonb)
  ||case when p_all then coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'column',h.col,'text',h.text,'agree',0,'folded',0,'ids',jsonb_build_array(h.id),'hidden',true,
     'pinned',h.pinned,'members','[]'::jsonb,'at',(extract(epoch from h.at)*1000)::bigint) order by h.at desc,h.id)
     from (select * from c where hidden and survivor_id is null order by at desc limit 100) h),'[]'::jsonb)
   else '[]'::jsonb end
 from ranked l
$$;

-- ---------- The fold limit ----------
-- The same apply as step 2's, with one more refusal: a member that shares no meaningful word with its survivor ('unrelated').
create or replace function private.ai_apply_pre_signal(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; t timestamptz:=clock_timestamp(); v_ms integer;
 applied jsonb:='[]'::jsonb; refused jsonb:='[]'::jsonb; v_changed boolean:=false; g jsonb; refs jsonb; cur jsonb; reason text; survivor jsonb; members jsonb; member jsonb;
 before integer; standing integer; used text[]:=array[]::text[];
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'fold_four_lists' then return private.ai_apply_base4(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 -- The room row first, as every writer takes it, then the session's lease.
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if not private.ai_on(run.session_id) or s.deleted then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  return jsonb_build_object('status','discarded');
 end if;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 -- Refs to the cards as the run saw them; the board as it stands now.
 select coalesce(jsonb_object_agg(c->>'ref',c||jsonb_build_object('column',col->>'column')),'{}'::jsonb) into refs
  from jsonb_array_elements(case when jsonb_typeof(run.inputs->'columns')='array' then run.inputs->'columns' else '[]'::jsonb end) col
  cross join lateral jsonb_array_elements(col->'cards') c;
 select coalesce(jsonb_object_agg(e->>'id',e),'{}'::jsonb) into cur from jsonb_array_elements(private.four_lists_board(run.session_id,false)) e;
 select count(*) into before from jsonb_object_keys(cur);
 standing:=before;
 for g in select v from jsonb_array_elements(case when jsonb_typeof(p_output->'groups')='array' then p_output->'groups' else '[]'::jsonb end) v limit 100 loop
  reason:=null; survivor:=refs->(g->>'survivor');
  members:=case when jsonb_typeof(g->'members')='array' then g->'members' else '[]'::jsonb end;
  if jsonb_typeof(g) is distinct from 'object' or survivor is null or jsonb_array_length(members)=0
    or exists(select 1 from jsonb_array_elements(members) x where jsonb_typeof(x)<>'string' or not refs ? (x#>>'{}') or x#>>'{}'=g->>'survivor')
    or (select count(distinct x#>>'{}') from jsonb_array_elements(members) x)<>jsonb_array_length(members)
    or g->>'survivor'=any(used) or exists(select 1 from jsonb_array_elements_text(members) x where x=any(used)) then reason:='unknown';
  elsif 1+jsonb_array_length(members)>4 then reason:='too_many';
  elsif not cur ? (survivor->>'id') then reason:='gone';
  elsif coalesce((cur->(survivor->>'id')->>'pinned')::boolean,false) then reason:='pinned';
  elsif private.ai_quoted(cur->(survivor->>'id')->>'text') then reason:='quote';
  else
   for member in select refs->x from jsonb_array_elements_text(members) x loop
    if not cur ? (member->>'id') or (cur->(member->>'id')->>'folded')::integer>0 then reason:='gone';
    elsif cur->(member->>'id')->>'column' is distinct from cur->(survivor->>'id')->>'column' then reason:='column';
    elsif coalesce((cur->(member->>'id')->>'pinned')::boolean,false) then reason:='pinned';
    elsif exists(select 1 from private.four_list_folds m where not m.deleted and (m.member_id=(member->>'id')::uuid
      or (m.member_id=(survivor->>'id')::uuid and m.survivor_id=(member->>'id')::uuid))) then reason:='kept_apart';
    elsif private.ai_quoted(cur->(member->>'id')->>'text') then reason:='quote';
    elsif not private.four_lists_share_word(cur->(member->>'id')->>'text',cur->(survivor->>'id')->>'text') then reason:='unrelated';
    elsif not private.ai_numbers(cur->(member->>'id')->>'text')<@private.ai_numbers(cur->(survivor->>'id')->>'text') then reason:='number';
    end if;
    exit when reason is not null;
   end loop;
   if reason is null and standing-jsonb_array_length(members)<0.6*before then reason:='standing'; end if;
  end if;
  if reason is null then
   insert into private.four_list_folds(engagement_id,session_id,survivor_id,member_id,made_by,detail,created_at)
    select run.engagement_id,run.session_id,(survivor->>'id')::uuid,(refs->x->>'id')::uuid,'ai',jsonb_build_object('run',run.id,'model',run.model,'prompt_version',run.prompt_version),t
    from jsonb_array_elements_text(members) x;
   standing:=standing-jsonb_array_length(members); v_changed:=true;
   used:=used||(g->>'survivor')||array(select jsonb_array_elements_text(members));
   applied:=applied||jsonb_build_array(jsonb_build_object('survivor',survivor->>'id','members',(select jsonb_agg(refs->x->>'id') from jsonb_array_elements_text(members) x)));
  else refused:=refused||jsonb_build_array(jsonb_build_object('group',g,'reason',reason)); end if;
 end loop;
 update private.ai_runs set status='ok',changed=v_changed,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 -- One version raise: the folds reach every screen as their own event.
 if v_changed and r.live_session_id=run.session_id then
  update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id;
 end if;
 return jsonb_build_object('status','ok','changed',v_changed,'applied',jsonb_array_length(applied),'refused',jsonb_array_length(refused));
end $$;

commit;
