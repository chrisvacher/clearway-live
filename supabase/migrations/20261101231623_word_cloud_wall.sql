-- Milestone 2, PR 6: the word cloud and wall on the TV (D1-02, D1-03).
-- Live only, after merge. No session is started and no data is seeded here.
--
-- * The word filter keeps profanity off the TV in every session (PRD, Moderation).
--   It screens each answer before it is stored, so nothing filtered is ever
--   broadcast. It catches spaced, punctuated, repeated-letter, number-for-letter
--   and starred spellings. Scripture language (hell, damn, God) is never screened.
-- * Each word in the shared results carries its arrival order, so a TV that opens
--   mid-session lays out single mentions oldest to newest. Counts and sizes are
--   still computed once here and broadcast.
begin;

create function private.screen_text(p_text text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare
  -- Anywhere in a word: these never occur inside an innocent word in practice.
  v_anywhere constant text[]:=array['fuck','shit','cunt','bitch','nigger','nigga','faggot'];
  -- At the start of a word, so endings are caught (wanker, sluts, pissed).
  v_prefix constant text[]:=array['wank','twat','slut','piss','dickhead','asshole','arsehole','bollock'];
  -- Whole words only, so class, pass, assess and retardant stay.
  v_whole constant text[]:=array['ass','arse','fag','fags','retard','retards','retarded','jackass','dumbass','tits'];
  -- Checked again with doubled letters squeezed (fuuuck, shiiit).
  v_squeeze constant text[]:=array['fuck','shit','cunt','bitch','twat','wank'];
  words text[]:=array[]::text[]; run text:=''; tok text; w text; sq text; r text; win text;
begin
  if p_text is null or length(btrim(p_text))=0 then return false; end if;
  -- Numbers and symbols standing in for letters: sh1t, $hit, f@ck, 5lut.
  foreach tok in array regexp_split_to_array(btrim(translate(lower(p_text),'013457@$!+','oieastasit')),'\s+') loop
    tok:=regexp_replace(tok,'[^a-z*]','','g');
    if length(tok)=0 then continue; end if;
    -- Single letters separated by spaces join up: f u c k.
    if length(tok)=1 then run:=run||tok; continue; end if;
    if length(run)>1 then words:=words||run; end if;
    run:=''; words:=words||tok;
  end loop;
  if length(run)>1 then words:=words||run; end if;
  foreach w in array words loop
    if w=any(v_whole) then return true; end if;
    foreach r in array v_anywhere loop if position(r in w)>0 then return true; end if; end loop;
    foreach r in array v_prefix loop if left(w,length(r))=r then return true; end if; end loop;
    sq:=regexp_replace(w,'([a-z])\1+','\1','g');
    foreach r in array v_squeeze loop if position(r in sq)>0 then return true; end if; end loop;
    -- A star stands for one letter (f*ck, sh*t, f**k); the word must start with a letter.
    if position('*' in w)>0 and left(w,1)<>'*' then
      foreach r in array v_anywhere loop
        for j in 1..greatest(0,length(w)-length(r)+1) loop
          win:=substr(w,j,length(r));
          if left(win,1)<>'*' and r ~ ('^'||replace(win,'*','.')||'$') then return true; end if;
        end loop;
      end loop;
      foreach r in array v_prefix loop
        if length(w)>=length(r) and r ~ ('^'||replace(left(w,length(r)),'*','.')||'$') then return true; end if;
      end loop;
      foreach r in array v_whole loop
        if length(w)=length(r) and r ~ ('^'||replace(w,'*','.')||'$') then return true; end if;
      end loop;
    end if;
  end loop;
  return false;
end $$;

-- Arrival order rides with each word so single mentions keep their order on any TV.
create or replace function private.live_results_for(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
  with active as (
    select s.* from public.submissions s
    where s.engagement_id=p_engagement and s.session_id=p_session and not s.deleted and not s.withdrawn and not s.hidden
  ), items as (
    select active.attendee_id,coalesce(active.server_received_at,active.created_at) as arrived,a->>'key' as key,a->>'text' as text from active cross join lateral jsonb_array_elements(active.answers) a
    where not (a->>'key'=any(coalesce(p_hidden,array[]::text[])))
  ), words as (
    select key,min(text) as label,count(*)::integer as count,min(arrived) as first from items
    where exists(select 1 from public.sessions x where x.id=p_session and x.interaction='word_cloud') group by key
  ), sized as (select *,max(count) over() as maximum,row_number() over(order by first,key) as arrival from words)
  select jsonb_build_object('total',(select count(*) from items),'people',(select count(distinct attendee_id) from items),'words',coalesce((select jsonb_agg(jsonb_build_object(
      'key',key,'text',label,'count',count,'size',case when maximum<=1 then 56 else 56+112*(sqrt(count)-1)/(sqrt(maximum)-1) end,
      'level',case when count=maximum and count>1 then 'leader' when count>1 then 'repeated' else 'single' end,'order',arrival) order by key) from sized),'[]'::jsonb))
$$;

create or replace function private.live_submit(p_engagement uuid,p_id uuid,p_session uuid,p_revision integer,p_action text,p_text text,p_sent timestamptz,p_queued timestamptz,p_uncertainty double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; previous public.submissions; who uuid; parts text[]; item text; key text; words text[]; answers jsonb:='[]'::jsonb; received timestamptz:=clock_timestamp(); accepting boolean;
begin
  if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
  select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
  if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
  select id into who from public.attendees where engagement_id=p_engagement and id in(select private.room_attendee_ids());
  select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
  if not found or s.interaction not in ('word_cloud','wall') then return jsonb_build_object('status','invalid_session'); end if;
  if p_action is null or p_action not in ('submit','change','withdraw') or p_revision is null or p_revision<0 or p_revision>1000000 or p_id is null
    or p_sent is null or not isfinite(p_sent) or (p_queued is not null and not isfinite(p_queued)) or p_uncertainty is null or p_uncertainty not between 0 and 60000 or p_uncertainty='NaN'::float8
    or p_sent>received+interval '1 minute' or p_queued>received+interval '1 minute' then return jsonb_build_object('status','invalid_request'); end if;
  select * into previous from public.submissions where id=p_id;
  if found then
    if previous.attendee_id<>who or previous.engagement_id<>p_engagement or previous.session_id<>p_session or previous.deleted then return jsonb_build_object('status','conflict'); end if;
    if p_revision<=previous.revision then return jsonb_build_object('status','duplicate','id',p_id,'revision',previous.revision,'version',r.version); end if;
    if p_revision<>previous.revision+1 or p_action='submit' then return jsonb_build_object('status','conflict'); end if;
  elsif p_revision<>0 or p_action<>'submit' then return jsonb_build_object('status','conflict');
  end if;
  accepting:=case
    when r.live_session_id=p_session then s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>received)
    else s.state='open' and s.mode='live' end;
  if not accepting and not (p_action='submit' and p_queued is not null and s.state='closed' and s.closed_at is not null
      and p_queued<=s.closed_at and p_sent<=s.closed_at and received<=s.closed_at+interval '2 minutes') then return jsonb_build_object('status','closed'); end if;
  if p_action='withdraw' then answers:=previous.answers; p_text:=previous.text;
  else
    if p_text is null or length(btrim(p_text))=0 or length(p_text)>1404 then return jsonb_build_object('status','invalid_answer'); end if;
    parts:=case when s.interaction='word_cloud' then string_to_array(p_text,',') else array[p_text] end;
    if cardinality(parts)>5 then return jsonb_build_object('status','limit'); end if;
    foreach item in array parts loop
      item:=btrim(item);
      if length(item)=0 or length(item)>s.max_characters then return jsonb_build_object('status','limit'); end if;
      if private.screen_text(item) then return jsonb_build_object('status','filtered'); end if;
      key:=btrim(regexp_replace(lower(item),'[^[:alnum:][:space:]]','','g'));
      words:=regexp_split_to_array(key,'\s+');
      if s.interaction='word_cloud' then
        if cardinality(words)>s.max_words then return jsonb_build_object('status','limit'); end if;
        while cardinality(words)>1 and words[1]=any(array['a','an','the','in','my','our','of','to','for','on','at','with']) loop words:=words[2:]; end loop;
        for i in 1..cardinality(words) loop if length(words[i])>3 and right(words[i],1)='s' then words[i]:=left(words[i],-1); end if; end loop;
      end if;
      key:=array_to_string(words,' ');
      if length(key)=0 then return jsonb_build_object('status','invalid_answer'); end if;
      answers:=answers||jsonb_build_array(jsonb_build_object('text',item,'key',key));
    end loop;
    if p_action='submit' and (select count(*) from public.submissions where session_id=p_session and attendee_id=who and not deleted)>=s.max_sends then return jsonb_build_object('status','limit'); end if;
  end if;
  insert into public.submissions(id,engagement_id,session_id,attendee_id,text,answers,revision,phone_sent_at,queued_at,clock_uncertainty_ms,server_received_at)
    values(p_id,p_engagement,p_session,who,btrim(p_text),answers,p_revision,p_sent,p_queued,p_uncertainty,received)
    on conflict(id) do update set text=excluded.text,answers=excluded.answers,revision=excluded.revision,withdrawn=(p_action='withdraw');
  perform set_config('clearway.live_answer',jsonb_build_object('id',p_id,'session_id',p_session,'revision',p_revision,
    'withdrawn',p_action='withdraw','hidden',coalesce(previous.hidden,false),
    'text',case when p_action<>'withdraw' and not coalesce(previous.hidden,false) and p_session=r.live_session_id then btrim(p_text) end,
    'answers',case when p_action<>'withdraw' and not coalesce(previous.hidden,false) and p_session=r.live_session_id then answers else '[]'::jsonb end)::text,true);
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
  perform set_config('clearway.live_answer','',true);
  insert into private.latency_logs(engagement_id,submission_id,revision,room_version,phone_sent_at,server_received_at,clock_uncertainty_ms)
    values(p_engagement,p_id,p_revision,r.version,p_sent,received,p_uncertainty);
  return jsonb_build_object('status','accepted','id',p_id,'revision',p_revision,'version',r.version,'server_received_at',received);
end $$;

revoke all on function private.screen_text(text) from public,anon,authenticated;
commit;
