-- Milestone 6 practice-room fixes, batch B (the November 7 run): the silent-theme count, the rehearsal count and what Clear test answers says
-- it cleared, the themes round after a clear, and the redraft check for a theme that says what one on the page already says.
--
-- Shared objects this migration redefines (each a superset of its newest definition on main; nothing an earlier step does is dropped):
--   private.signal_state                    20261106050100_signal, with one expression changed: the silent themes held back (see below). Every other key is as it was
--   private.discover_theme_apply            20261106030000_discover_themes, with one line widened: the check that drops a theme whose label is already on the page
--                                           now also drops one whose meaningful words mostly match a label already there (new helpers discover_words and discover_label_alike)
--   private.control_status                  the newest definition (20261106070000_read_back's patch over step 1's and step 2's), patched in place: test_answers is now the
--                                           one sum private.rehearsal_counts gives (the same items as before, in the same total), a test_counts breakdown beside it, and
--                                           last_clear gains themes, signals and other
--   private.rehearsal_control               the newest definition (the read-back's wrapper), renamed rehearsal_control_pre_fixes_b and wrapped: Clear test answers says what
--                                           it cleared (answers, drafted themes, signals, other test items) and puts the themes round to idle when no drafted theme is left
-- New: private.rehearsal_counts, private.discover_words, private.discover_label_alike; private.rehearsal_log gains themes, signals and other.
-- Not touched: reset_practice_room, ai_on, ai_claim, ai_apply, ai_runs_job_check, and every grant that is not listed in this file.
begin;

-- ---------- The silent themes held back until phones first go down ----------
-- It was the strong accepted themes minus the themes that have an aligned or divergent card. A divergent card is often on a thin theme (young families),
-- so the subtraction took one off a strong theme the room had never spoken of, and the panel said 1 where 2 could still come. It is now the strong accepted
-- themes with no card in this step at all (any kind, dismissed or not: a dismissed card stays dismissed, and a theme the room has spoken of or that is already up
-- is not waiting). Strong is read from private.discover_accepted_themes, the rule the signal's apply step uses, so the count is exactly the set a silent card can still come for.
do $patch$
declare def text; patched text;
begin
 def:=pg_get_functiondef('private.signal_state(uuid,uuid)'::regprocedure);
 patched:=replace(def,'greatest(0,v_held-(select count(distinct g.theme_id) from private.signals g where g.session_id=s.id and not g.deleted and g.dismissed_at is null and g.kind in (''aligned'',''divergent''))::integer)',
  '(select count(*) from private.discover_accepted_themes(p_engagement) q where q.strong'||chr(10)||
  '     and not exists(select 1 from private.signals g where g.session_id=s.id and g.theme_id=q.theme_id and not g.deleted))::integer');
 if patched=def then raise exception 'The held count in signal_state did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- ---------- A theme that says what one on the page already says ----------
-- The meaningful words of a label: lower case, no short or filler words, plurals and -ed and -ing endings trimmed. Negations (not, no, never, without,
-- cannot, cant, dont and the like) and the comparatives more, fewer and less are kept: they change what a label says.
create function private.discover_words(p_text text) returns text[]
language sql immutable security invoker set search_path='' as $$
 select coalesce(array_agg(distinct w),array[]::text[]) from (
  select case when x=any(array['not','no','never','without','cannot','cant','dont','wont','isnt','arent','doesnt','didnt','nothing','none','fewer','less','more']) then x
   when length(x)>5 and x like '%ing' then left(x,-3) when length(x)>4 and x like '%ed' then left(x,-2) when length(x)>3 and x like '%s' and x not like '%ss' then left(x,-1) else x end as w
  from unnest(regexp_split_to_array(lower(translate(coalesce(p_text,''),'‘’''','')),'[^a-z0-9]+')) x
  where (length(x)>=3 and x<>all(array['the','and','are','was','were','have','has','had','for','with','that','this','from','our','their','they','them','but','can','too','very',
   'most','some','any','all','who','what','when','where','how','why','its','into','about','there','here','been','being','will','would','should','could','you','your','also','than','then','just']))
   or x=any(array['not','no'])) s
$$;

-- True when a label says the same as one already there: it shares at least two meaningful words, and at least three quarters of the shorter label's words.
-- "Roles of staff are unclear" against "Staff roles have blurred and are unclear" shares role, staff and unclear: all of the shorter one.
-- Two labels are different, whatever they share, when only one of them carries a negation ("Newcomers do not feel welcome" against "Newcomers feel
-- welcome") or when they differ by an opposite (hard and easy, more and fewer or less, strong and weak, clear and unclear).
create function private.discover_label_alike(p_label text,p_seen text[]) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare a text[]:=private.discover_words(p_label); b text[]; s text; shared integer; smaller integer;
 neg text[]:=array['not','no','never','without','cannot','cant','dont','wont','isnt','arent','doesnt','didnt','nothing','none'];
 opp text[]:=array['hard','easy','more','fewer','more','less','strong','weak','clear','unclear'];
 differs boolean;
begin
 if cardinality(a)<2 then return false; end if;
 foreach s in array coalesce(p_seen,array[]::text[]) loop
  b:=private.discover_words(s);
  if cardinality(b)<2 then continue; end if;
  if (a&&neg)<>(b&&neg) then continue; end if;
  differs:=false;
  for i in 1..cardinality(opp)/2 loop
   if (opp[2*i-1]=any(a) and opp[2*i]=any(b) and not opp[2*i-1]=any(b)) or (opp[2*i]=any(a) and opp[2*i-1]=any(b) and not opp[2*i]=any(b)) then differs:=true; end if;
  end loop;
  if differs then continue; end if;
  select count(*) into shared from unnest(a) x where x=any(b);
  smaller:=least(cardinality(a),cardinality(b));
  if shared>=2 and shared::numeric/smaller>=0.75 then return true; end if;
 end loop;
 return false;
end $$;

-- The apply keeps every check it has. The exact-repeat check stays as it was, across every source. A near repeat is dropped only against labels of the same source
-- (accepted, offered or rejected, a renamed theme's old name, and the themes kept earlier in the same run), and the drop is written to the run's refused
-- output with the reason 'repeat'.
do $patch$
declare def text; patched text;
begin
 def:=pg_get_functiondef('private.discover_theme_apply(uuid,uuid,jsonb,jsonb)'::regprocedure);
 patched:=replace(def,'if private.ov_norm(v_label)=any(seen) then continue; end if;',
  'if private.ov_norm(v_label)=any(seen) then continue; end if;'||chr(10)||
  '  if private.discover_label_alike(v_label,(select coalesce(array_agg(private.ov_norm(l)),array[]::text[]) from private.discover_themes x cross join lateral unnest(array[x.label,x.original_label]) l'||chr(10)||
  '   where x.engagement_id=run.engagement_id and x.source=kind and not x.deleted and l is not null)) then'||chr(10)||
  '   refused:=refused||jsonb_build_array(jsonb_build_object(''label'',left(v_label,60),''reason'',''repeat'')); continue; end if;');
 if patched=def then raise exception 'The repeat check in discover_theme_apply did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- ---------- The rehearsal count, and what Clear test answers says it cleared ----------
alter table private.rehearsal_log add column themes integer not null default 0 check(themes>=0);
alter table private.rehearsal_log add column signals integer not null default 0 check(signals>=0);
alter table private.rehearsal_log add column other integer not null default 0 check(other>=0);

-- Every test item Clear test answers removes, counted once, with the parts the app names: answers, drafted themes, signals and the rest (votes, agrees,
-- suggestions, scribe cards and files, read-back corrections and items, What We Heard drafts). total is the sum, and is the number on the control surface.
create function private.rehearsal_counts(p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with c as (select
   (select count(*) from public.submissions y where y.engagement_id=p_engagement and y.test and not y.deleted)::integer as answers,
   (select count(*) from private.discover_themes y where y.engagement_id=p_engagement and y.test and not y.deleted)::integer as themes,
   (select count(*) from private.signals y where y.engagement_id=p_engagement and y.test and not y.deleted)::integer as signals,
   ((select count(*) from private.qa_votes y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.ranking_suggestions y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.candidate_suggestions y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.scribe_cards y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.scribe_files y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.read_back_corrections y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.read_back_items y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.heard_drafts y where y.engagement_id=p_engagement and y.test and not y.deleted)
    +(select count(*) from private.four_list_agrees y where y.engagement_id=p_engagement and y.test and not y.deleted))::integer as other)
 select jsonb_build_object('answers',answers,'themes',themes,'signals',signals,'other',other,'total',answers+themes+signals+other) from c
$$;

-- control_status keeps every line it has. The one sum becomes the helper's total (the same items, so the same number), with the parts beside it, and the
-- last clear reports its parts as well.
do $patch$
declare def text; patched text; a integer; b integer;
begin
 def:=pg_get_functiondef('private.control_status(uuid)'::regprocedure);
 a:=position('''test_answers'',' in def);
 b:=position(E',\n   ''last_clear''' in def);
 if a=0 or b=0 or b<a then raise exception 'The rehearsal count in control_status did not find its place'; end if;
 patched:=substr(def,1,a-1)||'''test_answers'',(tcounts->>''total'')::integer,''test_counts'',tcounts'||substr(def,b);
 def:=patched;
 -- The counts are read once for the whole status.
 patched:=replace(def,'declare r public.room_states;','declare tcounts jsonb:=private.rehearsal_counts(p_engagement); r public.room_states;');
 if patched=def then raise exception 'The declare block in control_status did not patch cleanly'; end if;
 def:=patched;
 patched:=replace(def,'''answers'',last_clear.answers,','''answers'',last_clear.answers,''themes'',last_clear.themes,''signals'',last_clear.signals,''other'',last_clear.other,');
 if patched=def then raise exception 'The last clear in control_status did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- The clear says what it cleared. The count is read before the clear, by the same function the control surface reads, so the label and the result agree:
-- answers is what the earlier definition cleared, themes and signals are the drafted themes and signals put away, and other is every remaining test item.
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_pre_fixes_b;

create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb; before jsonb; n_themes integer; n_signals integer; n_other integer; n_answers integer; lg private.rehearsal_log;
begin
 if p_action='clear' and p_engagement is not null then before:=private.rehearsal_counts(p_engagement); end if;
 out:=private.rehearsal_control_pre_fixes_b(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement is not null then
  if out->>'status'='ok' and before is not null then
   n_answers:=coalesce((out->>'answers')::integer,0);
   n_themes:=(before->>'themes')::integer; n_signals:=(before->>'signals')::integer;
   n_other:=greatest(0,(before->>'total')::integer-n_answers-n_themes-n_signals);
   update private.rehearsal_log set themes=n_themes,signals=n_signals,other=n_other where id=p_id and engagement_id=p_engagement;
   -- The themes round says "AI offered N themes". When the drafted themes are gone it has nothing left to say, so it goes quiet (as What We Heard's does).
   update private.discover_theme_rounds set status='idle' where engagement_id=p_engagement and not deleted and status='ready'
    and not exists(select 1 from private.discover_themes t where t.engagement_id=p_engagement and not t.deleted and t.source<>'survey' and t.ai_run is not null);
   out:=out||jsonb_build_object('themes',n_themes,'signals',n_signals,'other',n_other,'items',n_answers+n_themes+n_signals+n_other);
  elsif out->>'status'='duplicate' then
   select * into lg from private.rehearsal_log where id=p_id and engagement_id=p_engagement;
   if lg.id is not null then
    out:=out||jsonb_build_object('themes',lg.themes,'signals',lg.signals,'other',lg.other,'items',lg.answers+lg.themes+lg.signals+lg.other);
   end if;
  end if;
 end if;
 return out;
end $$;

-- ---------- Grants ----------
revoke all on function private.discover_words(text),private.discover_label_alike(text,text[]),private.rehearsal_counts(uuid),
 private.rehearsal_control_pre_fixes_b(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.rehearsal_control(uuid,uuid,text) to authenticated;
commit;
