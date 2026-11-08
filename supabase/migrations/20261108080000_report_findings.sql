-- Fixes from the milestone 7 practice-room run of the report (F1, F2, F3).
--
-- F1. The number check refused a count lead. A record section's lead such as "The team set four goals for the year." or "The team made three decisions."
-- counted the table's rows, and report_check threw the sentence out, so the 1-year Outlook and Decisions sections always opened as Needs attention.
-- report_check now accepts a spelled or digit count equal to the number of distinct records the sentence's cited refs rest on, for a record section's
-- lead only (its refs are the table's own lines, b1, b2 and so on). Every other number still has to come from a cited ref. The lead prompt also tells the
-- model not to count (report-lead@2).
-- F2. The 1-year Outlook table showed the raw season code (JAN_APR, MAY_AUG, SEP_DEC). rp_season_label gives the Clearway Map's wording, with the year the
-- Map shows ("Jan to Apr 2027"), and report_build_block uses it. Tables already built and signed reports keep the raw code in their stored cells, so the
-- editor, the Word and PDF export and the read-only copy also read a raw code as the same label, in code.
-- F3. Redraft section kept sentences in the model's blind spot and moved them to the top. report_section_inputs (wrapped, the step 1 definition renamed to
-- report_section_inputs_pre_report_findings) now adds the text of the sentences the redraft keeps, so the prompt can tell the model not to repeat them, and
-- report_apply puts each new sentence in the place of an untouched AI sentence it replaces, in order, with any extras after. Kept sentences never move.
--
-- Nothing here changes a table. The wrapper chain of report_claim (report_claim, report_claim_pre_visibility_plan) is untouched.

begin;

-- ---------- F2: the season, worded as the Clearway Map words it ----------
create function private.rp_season_label(p_season text,p_end date) returns text
language sql immutable security invoker set search_path='' as $$
 select case when nullif(btrim(coalesce(p_season,'')),'') is null then null
  when p_season in ('SEP_DEC','JAN_APR','MAY_AUG') then (case p_season when 'SEP_DEC' then 'Sept to Dec' when 'JAN_APR' then 'Jan to Apr' else 'May to Aug' end)||case when p_end is not null then ' '||extract(year from p_end)::integer else '' end
  else btrim(p_season) end
$$;

-- ---------- F1: the number check ----------
-- Step 1's report_check, whole, with the count a record section's lead may give. rp_words_ok is unchanged: report_check adds that count to the digits it hands it.
create or replace function private.report_check(p_text text,p_cited jsonb,p_names text[]) returns text
language plpgsql immutable security invoker set search_path='' as $$
declare v_have text; v_digits text[]; v_marks integer; seg text; stripped text; v_room text; v_records integer;
begin
 if length(p_text) not between 1 and 600 then return 'text'; end if;
 if p_cited is null or jsonb_typeof(p_cited)<>'array' or jsonb_array_length(p_cited)=0 then return 'unsourced'; end if;
 if private.screen_text(p_text) then return 'text'; end if;
 if private.discover_has_name(p_text,p_names) then return 'name'; end if;
 select string_agg(x.value->>'text',E'\n')||E'\n'||coalesce((select string_agg(s.value->>'excerpt',E'\n') from jsonb_array_elements(p_cited) y cross join lateral jsonb_array_elements(coalesce(y.value->'sources','[]'::jsonb)) s),'')
  into v_have from jsonb_array_elements(p_cited) x;
 -- The three horizon terms (and "1-year goals", the PRD's own words) are exact wording, not numbers: they are taken out before the numbers are read and the terms checked.
 stripped:=regexp_replace(p_text,'10-year Future|3-year Vision|1-year Outlook|1-year goals?','','g');
 v_digits:=private.ai_numbers(v_have);
 -- A record section's lead (every ref it cites is one of the table's own lines, b1, b2 and so on) may count what it cites: "The team set four goals for the year."
 -- A count, in digits or spelled out, is allowed when it equals the number of distinct records the cited refs rest on. A ref with no record id of its own counts once.
 if not exists(select 1 from jsonb_array_elements(p_cited) c where coalesce(c.value->>'ref','') !~ '^b[0-9]+$') then
  select count(distinct z.k)::integer into v_records from (
   select (s.value->>'kind')||':'||(s.value->>'ref_id') as k
    from jsonb_array_elements(p_cited) c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.value->'sources')='array' then c.value->'sources' else '[]'::jsonb end) s
    where coalesce(s.value->>'ref_id','')<>''
   union
   select 'ref:'||(c.value->>'ref') from jsonb_array_elements(p_cited) c
    where not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(c.value->'sources')='array' then c.value->'sources' else '[]'::jsonb end) s where coalesce(s.value->>'ref_id','')<>'')) z;
  if v_records>0 then v_digits:=v_digits||v_records::text; end if;
 end if;
 if not private.ai_numbers(stripped)<@v_digits or not private.rp_words_ok(stripped,v_have,v_digits) then return 'number'; end if;
 if stripped ~* '\m(10|ten|3|three|1|one)[ -]year\M' or p_text ~* 'communications? plan' then return 'term'; end if;
 v_marks:=length(translate(p_text,'“”','""'))-length(replace(translate(p_text,'“”','""'),'"',''));
 if v_marks%2<>0 then return 'quote'; end if;
 -- Words in quotation marks must be word for word, letter for letter, in the room's own words among the cited sources.
 v_room:=private.rp_room_text(p_cited);
 foreach seg in array private.rp_quoted(p_text) loop
  if length(btrim(seg))>280 or length(btrim(regexp_replace(seg,'[.,!?…]+$','')))=0
   or position(private.rp_qnorm(regexp_replace(seg,'[.,!?…]+$','')) in v_room)=0 then return 'quote'; end if;
 end loop;
 return null;
end $$;

-- ---------- F2: the record blocks ----------
-- Step 1's report_build_block, whole, with the 1-year Outlook's Season cell worded as the Map words it.
create or replace function private.report_build_block(p_engagement uuid,p_section uuid,p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old jsonb; x record; y record; rows jsonb:='[]'::jsonb; parts jsonb; sid uuid; sid2 uuid; v_text text; v_owner text; mids jsonb; v_cols jsonb:='[]'::jsonb; v_kind text:=p_key;
 pt record;
begin
 select s.blocks into old from private.report_sections s where s.id=p_section;
 if old is not null then
  for pt in select (p.value->>'sentence_id')::uuid as id from jsonb_array_elements(coalesce(old->'rows','[]'::jsonb)) r cross join lateral jsonb_array_elements(coalesce(r.value->'parts','[]'::jsonb)) p loop
   perform private.rp_drop(pt.id);
  end loop;
 end if;
 if p_key='future' then
  -- The five lens summaries the room signed off on Day 1, word for word.
  for x in select g.lens from generate_series(1,5) g(lens) loop
   parts:='[]'::jsonb;
   for y in select s.id,s.text from private.lens_summaries l join private.lens_summary_sentences s on s.version_id=l.signed_off_version_id and s.engagement_id=l.engagement_id and not s.deleted
     where l.engagement_id=p_engagement and l.lens=x.lens and not l.deleted and l.state='signed_off' and l.signed_off_version_id is not null order by s.position,s.id loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','lens_summary_sentence','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','line','sentence_id',sid));
   end loop;
   rows:=rows||jsonb_build_array(jsonb_build_object('title',private.rp_lens_name(p_engagement,x.lens),'lens',x.lens,'empty',jsonb_array_length(parts)=0,'cells','[]'::jsonb,'parts',parts));
  end loop;
 elsif p_key='vision' then
  for x in select o.id,o.title,o.description,o.what_we_stop from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted and o.status='confirmed' order by o.position,o.id loop
   parts:='[]'::jsonb;
   if btrim(x.description)<>'' then
    sid:=private.rp_put(p_engagement,p_section,x.description,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','outcome','ref_id',x.id,'excerpt',x.description,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','description','sentence_id',sid));
   end if;
   for y in select i.id,i.text from private.outcome_indicators i where i.outcome_id=x.id and i.engagement_id=p_engagement and not i.deleted order by i.position,i.id loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','indicator','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','indicator','sentence_id',sid));
   end loop;
   if btrim(x.what_we_stop)<>'' then
    sid:=private.rp_put(p_engagement,p_section,x.what_we_stop,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','outcome','ref_id',x.id,'excerpt',x.what_we_stop,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','stop','sentence_id',sid));
   end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('title',x.title,'cells','[]'::jsonb,'parts',parts));
  end loop;
  parts:='[]'::jsonb;
  for y in select k.id,k.text from private.key_metrics k where k.engagement_id=p_engagement and not k.deleted and k.rank is not null order by k.rank,k.id loop
   sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','key_metric','ref_id',y.id,'excerpt',y.text,'room',false)));
   parts:=parts||jsonb_build_array(jsonb_build_object('role','metric','sentence_id',sid));
  end loop;
  if jsonb_array_length(parts)>0 then rows:=rows||jsonb_build_array(jsonb_build_object('title','What the team will measure','group','metrics','cells','[]'::jsonb,'parts',parts)); end if;
 elsif p_key='risks' then
  v_cols:='["Risk","Likelihood","Impact","What we will do"]'::jsonb;
  for x in select r.id,r.text,r.likelihood,r.impact from private.risks r where r.engagement_id=p_engagement and not r.deleted and r.merged_into is null
    order by coalesce(r.likelihood,0)*coalesce(r.impact,0) desc,r.created_at,r.id loop
   sid:=private.rp_put(p_engagement,p_section,x.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','risk','ref_id',x.id,'excerpt',x.text,'room',false)));
   parts:=jsonb_build_array(jsonb_build_object('role','risk','sentence_id',sid)); mids:='[]'::jsonb;
   for y in select m.id,m.text from private.risk_mitigations m where m.risk_id=x.id and m.engagement_id=p_engagement and not m.deleted order by m.created_at,m.id loop
    sid2:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','mitigation','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','mitigation','sentence_id',sid2));
    mids:=mids||to_jsonb(sid2);
   end loop;
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',private.rp_level(x.likelihood)),
    jsonb_build_object('t',private.rp_level(x.impact)),jsonb_build_object('s',mids)),'parts',parts));
  end loop;
 elsif p_key='outlook' then
  v_cols:='["Vision Outcome","Goal","Owner","Ends","Season"]'::jsonb;
  for x in select g.id,g.title,g.result,g.owner_attendee_id,g.owner_name,g.end_date,g.season,coalesce(o.title,'') as otitle
    from private.goals g left join private.vision_outcomes o on o.id=g.outcome_id and o.engagement_id=g.engagement_id where g.engagement_id=p_engagement and not g.deleted
    order by o.position nulls last,g.position,g.id loop
   v_owner:=private.rp_owner(p_engagement,x.owner_attendee_id,x.owner_name);
   v_text:=x.title||case when btrim(x.result)<>'' then ': '||x.result else '' end;
   sid:=private.rp_put(p_engagement,p_section,v_text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','goal','ref_id',x.id,'excerpt',v_text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('t',x.otitle),jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',coalesce(v_owner,'Not set yet')),
    jsonb_build_object('t',coalesce(private.rp_date(x.end_date),'Not set yet')),jsonb_build_object('t',coalesce(private.rp_season_label(x.season,x.end_date),'Not set yet'))),
    'parts',jsonb_build_array(jsonb_build_object('role','goal','sentence_id',sid,'owner',v_owner,'due',private.rp_date(x.end_date)))));
  end loop;
 elsif p_key='intent' then
  for x in select c.id,c.intent,c.must_do,c.what_we_stop,o.title as otitle from private.intent_cards c join private.vision_outcomes o on o.id=c.outcome_id and o.engagement_id=c.engagement_id and not o.deleted
    where c.engagement_id=p_engagement and not c.deleted order by o.position,c.created_at,c.id loop
   parts:='[]'::jsonb;
   for y in select r.role,r.text from (values ('intent',x.intent,1),('must_do',x.must_do,2),('stop',x.what_we_stop,3)) r(role,text,o) where btrim(r.text)<>'' order by r.o loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','intent_card','ref_id',x.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role',y.role,'sentence_id',sid));
   end loop;
   for y in select f.id,f.text,f.owner_attendee_id,f.owner_name,f.due_date from private.first_steps f where f.card_id=x.id and f.engagement_id=p_engagement and not f.deleted order by f.position,f.id loop
    sid:=private.rp_put(p_engagement,p_section,y.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','first_step','ref_id',y.id,'excerpt',y.text,'room',false)));
    parts:=parts||jsonb_build_array(jsonb_build_object('role','step','sentence_id',sid,'owner',private.rp_owner(p_engagement,y.owner_attendee_id,y.owner_name),'due',private.rp_date(y.due_date)));
   end loop;
   rows:=rows||jsonb_build_array(jsonb_build_object('title',x.otitle,'cells','[]'::jsonb,'parts',parts));
  end loop;
 elsif p_key='decisions' then
  v_cols:='["Decision","Why"]'::jsonb;
  for x in select d.id,d.subject_label,d.decision,d.reasons from private.decisions d where d.engagement_id=p_engagement and not d.deleted order by d.marked_at,d.id loop
   v_text:=case when btrim(x.subject_label)<>'' then x.subject_label||': ' else '' end||x.decision;
   sid:=private.rp_put(p_engagement,p_section,v_text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','decision','ref_id',x.id,'excerpt',v_text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',x.reasons)),'parts',jsonb_build_array(jsonb_build_object('role','decision','sentence_id',sid))));
  end loop;
  for x in select c.id,c.text,c.detail from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='decision' order by c.captured_at,c.seq loop
   sid:=private.rp_put(p_engagement,p_section,x.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','scribe_card','ref_id',x.id,'excerpt',x.text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t',coalesce(x.detail->>'why',''))),'parts',jsonb_build_array(jsonb_build_object('role','decision','sentence_id',sid))));
  end loop;
 elsif p_key='visibility' then
  v_cols:='["Who","When","Who tells them","What they hear","The risk it answers"]'::jsonb;
  for x in select v.* from private.visibility_plan_for_report(p_engagement) v order by v.position,v.row_id loop
   v_text:=coalesce(nullif(btrim(coalesce(x.what_they_hear,'')),''),coalesce(x.who,'The visibility plan'));
   sid:=private.rp_put(p_engagement,p_section,v_text,'record',false,null,null,
    case when jsonb_typeof(x.sources)='array' and jsonb_array_length(x.sources)>0 then x.sources else jsonb_build_array(jsonb_build_object('kind','record','excerpt','Visibility plan row')) end);
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(case when btrim(coalesce(x.what_they_hear,''))='' then jsonb_build_object('s',jsonb_build_array(sid)) else jsonb_build_object('t',coalesce(x.who,'')) end,
    jsonb_build_object('t',coalesce(x.when_text,'')),jsonb_build_object('t',coalesce(x.by_whom,'')),case when btrim(coalesce(x.what_they_hear,''))='' then jsonb_build_object('t','') else jsonb_build_object('s',jsonb_build_array(sid)) end,jsonb_build_object('t',coalesce(x.risk,''))),
    'reviewed',coalesce(x.reviewed,false),'parts',jsonb_build_array(jsonb_build_object('role','plan','sentence_id',sid))));
  end loop;
  for x in select c.id,c.text from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.kind='action' order by c.captured_at,c.seq loop
   sid:=private.rp_put(p_engagement,p_section,x.text,'record',false,null,null,jsonb_build_array(jsonb_build_object('kind','scribe_card','ref_id',x.id,'excerpt',x.text,'room',false)));
   rows:=rows||jsonb_build_array(jsonb_build_object('title','','cells',jsonb_build_array(jsonb_build_object('t',''),jsonb_build_object('t',''),jsonb_build_object('t',''),jsonb_build_object('s',jsonb_build_array(sid)),jsonb_build_object('t','')),'group','actions','parts',jsonb_build_array(jsonb_build_object('role','action','sentence_id',sid))));
  end loop;
 end if;
 return jsonb_build_object('kind',v_kind,'columns',v_cols,'rows',rows);
end $$;

-- ---------- F3: what a redraft reads, and where its sentences go ----------
-- The text of the sentences a section redraft keeps, in the order they stand, so the model is told what is already written and does not repeat it. These are the
-- sentences report_start counts when it asks to keep them: the facilitator's own words, the room's words and any AI sentence the facilitator touched. A sentence
-- that names someone is left out, as every ref is: nothing that carries a name goes to the model.
alter function private.report_section_inputs(uuid,uuid) rename to report_section_inputs_pre_report_findings;

create function private.report_section_inputs(p_engagement uuid,p_section uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb:=private.report_section_inputs_pre_report_findings(p_engagement,p_section); names text[]; kept jsonb;
begin
 if out is null or not (out ? 'section') then return out; end if;
 names:=private.report_names(p_engagement);
 select coalesce(jsonb_agg(left(s.text,700) order by s.position,s.id),'[]'::jsonb) into kept from private.report_sentences s
  where s.section_id=p_section and s.engagement_id=p_engagement and not s.deleted and s.origin in ('ai','room','facilitator') and (s.touched or s.origin<>'ai')
   and not private.discover_has_name(s.text,names) and not private.screen_text(s.text);
 if jsonb_array_length(kept)>0 then out:=out||jsonb_build_object('kept',kept); end if;
 return out;
end $$;

-- Step 1's report_apply, whole, with the places of the new sentences.
create or replace function private.report_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.report_rounds; sec private.report_sections; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; sn record; v_text text; v_refs text[]; cited jsonb;
 names text[]; n_kept integer:=0; n_dropped integer:=0; reasons jsonb:='[]'::jsonb; why text; good jsonb:='[]'::jsonb; g record; v_norm text; v_quote boolean; v_thin text; srcs jsonb; seg text;
 v_live integer; v_touched integer; v_status text; v_all_thin boolean; v_slots integer[]; v_i integer:=0;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='draft_report';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 perform private.discover_lock(run.engagement_id);
 select * into r from private.report_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then return jsonb_build_object('status','stale'); end if;
 select * into sec from private.report_sections where id=(in_->>'section_id')::uuid and engagement_id=run.engagement_id and not deleted;
 if not found then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.report_rounds set status=case when cardinality(queue)>0 then 'pending' else 'ready' end,current=null,lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.report_sections set status=case when exists(select 1 from private.report_sentences s where s.section_id=report_sections.id and not s.deleted) then 'edited' else 'empty' end where engagement_id=run.engagement_id and not deleted and status='drafting';
  update private.report_rounds set status='idle',queue=array[]::text[],current=null,lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 names:=private.report_names(run.engagement_id);
 for sn in select e.value as v,e.ord from jsonb_array_elements(case when jsonb_typeof(p_output->'sentences')='array' then p_output->'sentences' else '[]'::jsonb end) with ordinality e(value,ord) where e.ord<=12 loop
  if jsonb_typeof(sn.v)<>'object' then continue; end if;
  v_text:=private.rp_clean(sn.v->>'text');
  select coalesce(array_agg(distinct lower(btrim(s#>>'{}'))),array[]::text[]) into v_refs from jsonb_array_elements(case when jsonb_typeof(sn.v->'refs')='array' then sn.v->'refs' else '[]'::jsonb end) s where jsonb_typeof(s)='string';
  select jsonb_agg(x.value order by x.ord) into cited from jsonb_array_elements(in_->'refs') with ordinality x(value,ord) where lower(x.value->>'ref')=any(v_refs);
  why:=private.report_check(v_text,cited,names);
  if why is not null then n_dropped:=n_dropped+1; reasons:=reasons||jsonb_build_array(jsonb_build_object('reason',why)); continue; end if;
  -- The sentence rests on every cited ref's sources, up to eight. A quotation becomes the excerpt of the source that holds it.
  select coalesce(jsonb_agg(s.value order by x.ord,s.ord),'[]'::jsonb) into srcs from jsonb_array_elements(cited) with ordinality x(value,ord) cross join lateral jsonb_array_elements(x.value->'sources') with ordinality s(value,ord);
  v_norm:=private.rp_norm(translate(v_text,'“”','""'));
  v_quote:=v_norm ~ '^"[^"]+"[.!?]?$';
  if cardinality(private.rp_quoted(v_text))>0 then
   seg:=regexp_replace((private.rp_quoted(v_text))[1],'[.,!?…]+$','');
   select coalesce(jsonb_agg(case when (coalesce((s.value->>'room')::boolean,false) or s.value->>'kind' in ('scribe_card','four_lists_card','submission','lens_summary_sentence'))
      and position(private.rp_qnorm(seg) in private.rp_qnorm(s.value->>'excerpt'))>0 then jsonb_set(s.value,'{excerpt}',to_jsonb(left(seg,280))) else s.value end order by x.ord,s.ord),'[]'::jsonb) into srcs
    from jsonb_array_elements(cited) with ordinality x(value,ord) cross join lateral jsonb_array_elements(x.value->'sources') with ordinality s(value,ord);
  end if;
  select x.value->>'thin_text' into v_thin from jsonb_array_elements(cited) x where coalesce((x.value->>'thin')::boolean,false) limit 1;
  good:=good||jsonb_build_array(jsonb_build_object('text',v_text,'quote',v_quote,'thin',left(v_thin,80),'sources',srcs));
  n_kept:=n_kept+1;
 end loop;
 if n_kept>0 then
  -- The sentences the facilitator kept (touched, their own or the room's words) stay exactly where they are. The new sentences take the places of the untouched
  -- AI sentences they replace, in order, and any extra sentences follow after everything.
  select coalesce(array_agg(s.position order by s.position,s.id),array[]::integer[]) into v_slots from private.report_sentences s where s.section_id=sec.id and not s.deleted and s.origin='ai' and not s.touched;
  for g in select s.id from private.report_sentences s where s.section_id=sec.id and not s.deleted and s.origin='ai' and not s.touched loop perform private.rp_drop(g.id); end loop;
  for g in select e.value as v from jsonb_array_elements(good) e loop
   v_i:=v_i+1;
   perform private.rp_put(run.engagement_id,sec.id,g.v->>'text','ai',(g.v->>'quote')::boolean,g.v->>'thin',g.v->>'text',g.v->'sources',case when v_i<=cardinality(v_slots) then v_slots[v_i] end);
  end loop;
 end if;
 select count(*)::integer,count(*) filter (where s.touched or s.origin in ('facilitator','room'))::integer into v_live,v_touched from private.report_sentences s where s.section_id=sec.id and not s.deleted;
 v_all_thin:=n_kept>0 and not exists(select 1 from jsonb_array_elements(good) e where e.value->>'thin' is null);
 v_status:=case when n_dropped>0 then 'needs_attention' when v_live=0 then 'thin' when v_all_thin then 'thin' when v_touched>0 then 'edited' else 'drafted' end;
 update private.report_sections set status=v_status,error=null,dropped=n_dropped,ai_run=run.id,drafted_at=t,reviewed_by=null,reviewed_at=null where id=sec.id;
 update private.ai_runs set status='ok',changed=n_kept>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'section',sec.key,'kept',n_kept,'dropped',n_dropped,'refused',reasons),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.report_rounds set status=case when cardinality(queue)>0 then 'pending' else 'ready' end,current=null,attempts=0,lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,
  last_ok_at=t,last_kept=coalesce(last_kept,0)+n_kept,last_dropped=coalesce(last_dropped,0)+n_dropped where id=r.id;
 return jsonb_build_object('status','ok','section',sec.key,'kept',n_kept,'dropped',n_dropped);
end $$;

revoke all on function private.report_section_inputs_pre_report_findings(uuid,uuid),private.report_section_inputs(uuid,uuid),private.rp_season_label(text,date) from public,anon,authenticated,service_role;
grant execute on function private.report_section_inputs(uuid,uuid),private.rp_season_label(text,date) to service_role;

commit;
