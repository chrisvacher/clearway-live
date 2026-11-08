-- Milestone 7 practice-room fixes F7, F8 and F9: the name check, and the visibility plan's dates.
--
-- F7. The name check refused ordinary sentences because ordinary words got into the name-word list ("member" from a note's person "A staff member", "One" from an
-- attendee "Phone One"), and a person called Will, Grace, Faith or Hope would have blocked every "will", "grace", "faith" and "hope". The report and the plan must
-- still never name a person, so the rule is narrowed and not loosened:
--   1. A name word is a word of three letters or more taken from an attendee, a facilitator, a note's person, a scribe speaker or an owner. Role and description
--      words, number words and ordinals are never name words (private.name_stoplist).
--   2. In a free-text field (a note's person, a speaker, an owner) a long description is not a name: when the entry has three words or more only its capitalised
--      words count, so "A staff member" and "someone from the youth team" give nothing. An entry of one or two words counts in any case.
--   3. A name word that is not also an ordinary English word is matched in any case, as before.
--   4. A name word that is also an ordinary English word (private.name_common: will, grace, faith, hope, joy, mark, may, rose, bill ...) is kept in the list as
--      '*Word|Partner|...' (Partner is the other name words of the same person) and counts only when the text writes it as a proper noun: capitalised away from
--      the start of a sentence, or capitalised next to one of its own partners ("Faith Hope"). "will", "Will the team meet?" and "Saved by grace." are clear.
-- Signatures are unchanged (names stay a text[]), so every caller of discover_names, report_names and discover_has_name keeps working as it is: the discover
-- themes and read-back checks, the report's check and inputs, and the visibility plan's inputs and row checks.
--
-- F8. A plan row is no longer dropped whole when only its when fails (no public date yet, or a date that runs backwards against a kept row). The row is kept with
-- when and date cleared, and counted: private.visibility_plan_rows.when_blanked marks it, and the page state says how many of those rows are still blank.
-- F9 is the prompt (visibility-plan@2) and the page; nothing here.
begin;

-- ---------- Words that are never a name ----------
create function private.name_stoplist() returns text[] language sql immutable set search_path='' as $$
 select array['the','and','for','with','team','staff','board','elders','elder','pastor','pastors','rev','reverend','senior','lead','associate','executive',
  'director','chair','deacon','deacons','church','youth','children','kids','worship','group','council','committee','leader','leaders','interview','input','conversation','mrs','miss','pastoral',
  'member','members','volunteer','volunteers','parent','parents','attender','attenders','attendee','attendees','participant','participants','guest','guests','visitor','visitors',
  'person','people','man','men','woman','women','lady','ladies','boy','girl','teen','teens','student','students','teacher','teachers','usher','greeter','host','hosts','coordinator',
  'manager','admin','assistant','secretary','treasurer','officer','minister','ministry','ministries','donor','donors','congregant','congregants','family','families','couple','adult','adults',
  'anonymous','unnamed','unknown','phone','staffer','employee','employees','coach','facilitator','scribe','speaker','neighbor','neighbour','friend','friends','newcomer','newcomers',
  'regular','longtime','former','current','prospective','potential','head','vice','chief','overseer','warden','trustee','steward','bishop','rector','vicar','priest','father','mother',
  'sister','brother','son','daughter','husband','wife','spouse','doctor','another','other','others','someone','somebody','anyone','anybody','everyone','from','who','whom','whose','that','this','these','those',
  'zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','last','next','half','both','each','every']
$$;

-- Ordinary English words that are also given names. Kept in the list, but they count only as a proper noun (see the rule above).
create function private.name_common() returns text[] language sql immutable set search_path='' as $$
 select array['will','grace','faith','hope','joy','mark','may','june','april','august','rose','bill','art','pat','guy','dawn','rich','chase','hunter','mason','page','rob','sue','ray','frank','lane',
  'bob','don','sky','summer','autumn','amber','ivy','lily','daisy','violet','olive','holly','heather','hazel','iris','ruby','pearl','jade','crystal','ginger','sandy','penny','patience','charity',
  'mercy','trinity','destiny','harmony','unity','noel','christian','dean','drew','earl','glen','cliff','wade','dale','grant','miles','sterling','forest','royal','major','lance','robin','jay','wren','lark','brook','reed','stone']
$$;

-- The name words of a list of entries (one entry is one person's name or one description), as a text[]. An ordinary-word name is '*Word|Partner|...'.
-- p_free is true for a free-text field, where a long description is not a name.
create function private.name_words(p_entries text[],p_free boolean) returns text[]
language sql immutable security invoker set search_path='' as $$
 with tok as (
  select e.rid,w.w,count(*) over (partition by e.rid) as n_all
  from unnest(coalesce(p_entries,array[]::text[])) with ordinality e(t,rid)
  cross join lateral regexp_split_to_table(coalesce(e.t,''),'[^[:alpha:]]+') w(w) where w.w<>''),
 kept as (
  select t.rid,t.w from tok t
  where length(t.w)>=3 and not (lower(t.w)=any(private.name_stoplist())) and (not coalesce(p_free,false) or t.n_all<=2 or t.w ~ '^[[:upper:]]'))
 select coalesce(array_agg(distinct case when lower(k.w)=any(private.name_common())
   then '*'||initcap(lower(k.w))||coalesce((select '|'||string_agg(distinct initcap(lower(o.w)),'|') from kept o where o.rid=k.rid and lower(o.w)<>lower(k.w)),'')
   else k.w end),array[]::text[]) from kept k
$$;

create or replace function private.discover_names(p_engagement uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct z.w),array[]::text[]) from (
  select unnest(private.name_words(array(select n.person from private.conversation_notes n where n.engagement_id=p_engagement and not n.deleted and n.person is not null),true)) as w
  union
  select unnest(private.name_words(array(
   select a.name from public.attendees a where a.engagement_id=p_engagement and not a.deleted
   union all select u.name from public.engagement_facilitators f join public.clearway_users u on u.id=f.clearway_user_id where f.engagement_id=p_engagement and not f.deleted),false))) z
$$;

create or replace function private.discover_has_name(p_text text,p_names text[]) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare n text; parts text[]; alt text; pa text;
begin
 if p_text is null then return false; end if;
 foreach n in array coalesce(p_names,array[]::text[]) loop
  if left(n,1)<>'*' then
   if p_text ~* ('\m'||n||'\M') then return true; end if;
  else
   parts:=string_to_array(substr(n,2),'|');
   alt:='('||parts[1]||'|'||upper(parts[1])||')';
   -- Capitalised, with a word before it that does not end a sentence: "ask Grace", "thanks, Will".
   if p_text ~ ('[[:alnum:],][ \t]+'||alt||'\M') then return true; end if;
   -- Capitalised next to one of the same person's other words, even at the start of a sentence: "Faith Hope".
   if cardinality(parts)>1 then
    select '('||string_agg(p||'|'||upper(p),'|')||')' into pa from unnest(parts[2:cardinality(parts)]) p;
    if p_text ~ ('\m'||alt||'[ \t]+'||pa||'\M') or p_text ~ ('\m'||pa||'[ \t]+'||alt||'\M') then return true; end if;
   end if;
  end if;
 end loop;
 return false;
end $$;

-- The report adds the scribe's speakers and the owners typed onto goals and first steps (free text).
create or replace function private.report_names(p_engagement uuid) returns text[]
language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(distinct z.w),array[]::text[]) from (
  select unnest(private.discover_names(p_engagement)) as w
  union
  select unnest(private.name_words(array(
   select c.speaker from private.scribe_cards c where c.engagement_id=p_engagement and not c.deleted and c.speaker is not null
   union all select g.owner_name from private.goals g where g.engagement_id=p_engagement and not g.deleted and g.owner_name is not null
   union all select f.owner_name from private.first_steps f where f.engagement_id=p_engagement and not f.deleted and f.owner_name is not null),true))) z
$$;

revoke all on function private.name_stoplist(),private.name_common(),private.name_words(text[],boolean) from public,anon,authenticated;

-- ---------- F8: a row whose when was cleared ----------
alter table private.visibility_plan_rows add column when_blanked boolean not null default false;

-- Keep a reply only under the rules that are code: see vp_check. A row rests on the sources of every ref it cites, up to eight. The rows come in the
-- outward order whatever order the model wrote them in. The rows the facilitator touched or reviewed stay, and so do the stages they hold: a new row for a
-- stage that already has one of those is not added. The untouched AI rows are replaced when at least one new row is kept. A row whose only fault is its when
-- (no public date yet, a date after it or before the retreat, or a date that runs backwards against a row that is kept) stays with the when and the date cleared.
create or replace function private.visibility_plan_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.visibility_plan_rounds; pl private.visibility_plans; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; sn record; v_refs text[]; cited jsonb;
 names text[]; why text; srcs jsonb; reasons jsonb:='[]'::jsonb; good jsonb:='[]'::jsonb; g record; n_kept integer:=0; n_dropped integer:=0; n_skipped integer:=0; kept text[];
 v_row jsonb; ids uuid[]; ranks integer[]; idx integer; v_id uuid; n integer; s jsonb; reordered boolean:=false; last_rank integer:=0; v_live integer; rk integer; v_when_date date;
 v_floor date; v_q text; pd date[]; pr integer[]; good2 jsonb:='[]'::jsonb; v_d date; n_blanked integer:=0; v_blank boolean; gv jsonb;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='draft_visibility_plan';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 perform private.discover_lock(run.engagement_id);
 select * into r from private.visibility_plan_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then return jsonb_build_object('status','stale'); end if;
 select * into pl from private.visibility_plans where id=(in_->>'plan_id')::uuid and engagement_id=run.engagement_id and not deleted for update;
 if not found then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.visibility_plan_rounds set status='ready',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  perform private.vp_unstick(pl.id);
  update private.visibility_plan_rounds set status='idle',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  return jsonb_build_object('status','discarded');
 end if;
 names:=private.report_names(run.engagement_id);
 select coalesce(e.end_date,e.start_date) into v_floor from public.engagements e where e.id=run.engagement_id;
 select coalesce(array_agg(distinct x.stage),array[]::text[]) into kept from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and (x.touched or x.reviewed_at is not null);
 for sn in select e.value as v,e.ord from jsonb_array_elements(case when jsonb_typeof(p_output->'rows')='array' then p_output->'rows' else '[]'::jsonb end) with ordinality e(value,ord) where e.ord<=14 loop
  if jsonb_typeof(sn.v)<>'object' then continue; end if;
  v_row:=jsonb_build_object('stage',lower(btrim(coalesce(sn.v->>'stage',''))),'who',private.rp_clean(sn.v->>'who'),'when',private.rp_clean(sn.v->>'when'),
   'when_date',btrim(coalesce(sn.v->>'when_date','')),'by',private.rp_clean(sn.v->>'by'),'hear',private.rp_clean(sn.v->>'hear'),'risk',private.rp_clean(sn.v->>'risk'));
  if v_row->>'stage'=any(kept) then n_skipped:=n_skipped+1; continue; end if;
  select coalesce(array_agg(distinct lower(btrim(x#>>'{}'))),array[]::text[]) into v_refs from jsonb_array_elements(case when jsonb_typeof(sn.v->'refs')='array' then sn.v->'refs' else '[]'::jsonb end) x where jsonb_typeof(x)='string';
  select jsonb_agg(x.value order by x.ord) into cited from jsonb_array_elements(in_->'refs') with ordinality x(value,ord) where lower(x.value->>'ref')=any(v_refs);
  why:=private.vp_check(v_row,cited,names,pl.public_date,v_floor);
  -- The when is checked after every other part of the row, so a refusal for the when means the rest of the row is good. The row stays with its when and date
  -- cleared, and is counted so the page can say so. Any other refusal still drops the row.
  v_blank:=false;
  if why='when' then
   v_row:=v_row||jsonb_build_object('when','','when_date','');
   v_blank:=true; n_blanked:=n_blanked+1;
   why:=private.vp_check(v_row,cited,names,pl.public_date,v_floor);
   if why is not null then n_blanked:=n_blanked-1; end if;
  end if;
  if why is not null then n_dropped:=n_dropped+1; reasons:=reasons||jsonb_build_array(jsonb_build_object('reason',why,'stage',v_row->>'stage')); continue; end if;
  select coalesce(jsonb_agg(z.value order by x.ord,z.ord),'[]'::jsonb) into srcs from jsonb_array_elements(cited) with ordinality x(value,ord) cross join lateral jsonb_array_elements(x.value->'sources') with ordinality z(value,ord);
  -- A row that quotes the room keeps the quoted words as its source's excerpt, so the panel lights the quotation (as the report does).
  v_q:=(private.rp_quoted(concat_ws(' ',v_row->>'who',v_row->>'hear',v_row->>'risk')))[1];
  if v_q is not null then
   v_q:=regexp_replace(v_q,'[.,!?…]+$','');
   select coalesce(jsonb_agg(case when (coalesce((z.value->>'room')::boolean,false) or z.value->>'kind' in ('scribe_card','four_lists_card','submission','lens_summary_sentence'))
      and position(private.rp_qnorm(v_q) in private.rp_qnorm(z.value->>'excerpt'))>0 then jsonb_set(z.value,'{excerpt}',to_jsonb(left(v_q,280))) else z.value end order by z.ord),'[]'::jsonb) into srcs
    from jsonb_array_elements(srcs) with ordinality z(value,ord);
  end if;
  good:=good||jsonb_build_array(jsonb_build_object('row',v_row,'sources',srcs,'rank',private.vp_rank(v_row->>'stage'),'blanked',v_blank));
  n_kept:=n_kept+1;
 end loop;
 for g in select e.value as v from jsonb_array_elements(good) e loop
  rk:=(g.v->>'rank')::integer;
  if rk<last_rank then reordered:=true; end if;
  last_rank:=rk;
 end loop;
 -- Dates never run backwards along the outward order: not against the rows the facilitator keeps, and not against the rows kept before this one.
 select coalesce(array_agg(x.when_date),array[]::date[]),coalesce(array_agg(private.vp_rank(x.stage)),array[]::integer[]) into pd,pr
  from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and (x.touched or x.reviewed_at is not null) and x.when_date is not null;
 for g in select e.value as v from jsonb_array_elements(good) with ordinality e(value,ord) order by (e.value->>'rank')::integer,e.ord loop
  rk:=(g.v->>'rank')::integer; v_d:=nullif(g.v->'row'->>'when_date','')::date; gv:=g.v;
  if v_d is not null then
   if exists(select 1 from unnest(pd,pr) u(d,rr) where (rr<rk and u.d>v_d) or (rr>rk and u.d<v_d)) then
    -- A date that runs backwards is cleared, with its words, and the rest of the row stays.
    gv:=jsonb_set(jsonb_set(jsonb_set(gv,'{row,when}','""'::jsonb),'{row,when_date}','""'::jsonb),'{blanked}','true'::jsonb);
    n_blanked:=n_blanked+1;
   else
    pd:=pd||v_d; pr:=pr||rk;
   end if;
  end if;
  good2:=good2||jsonb_build_array(gv);
 end loop;
 good:=good2;
 if n_kept>0 then
  -- The untouched AI rows go, with their sources.
  update private.visibility_plan_sources set deleted=true where engagement_id=run.engagement_id and not deleted and row_id in (
   select x.id from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and x.origin='ai' and not x.touched and x.reviewed_at is null);
  update private.visibility_plan_rows set deleted=true where plan_id=pl.id and not deleted and origin='ai' and not touched and reviewed_at is null;
  select coalesce(array_agg(x.id order by x.position,x.id),array[]::uuid[]),coalesce(array_agg(private.vp_rank(x.stage) order by x.position,x.id),array[]::integer[]) into ids,ranks
   from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted;
  for g in select e.value as v from jsonb_array_elements(good) with ordinality e(value,ord) order by (e.value->>'rank')::integer,e.ord loop
   rk:=(g.v->>'rank')::integer;
   -- A new row goes after the last row that is not further out than it, so the rows the facilitator kept (and moved) keep their places.
   idx:=0;
   for i in 1..cardinality(ranks) loop if ranks[i]<=rk then idx:=i; end if; end loop;
   v_id:=gen_random_uuid();
   v_when_date:=nullif(g.v->'row'->>'when_date','')::date;
   insert into private.visibility_plan_rows(id,engagement_id,plan_id,position,stage,who,when_text,when_date,by_whom,what_they_hear,risk,origin,touched,when_blanked)
    values(v_id,run.engagement_id,pl.id,0,g.v->'row'->>'stage',g.v->'row'->>'who',coalesce(g.v->'row'->>'when',''),v_when_date,coalesce(g.v->'row'->>'by',''),g.v->'row'->>'hear',coalesce(g.v->'row'->>'risk',''),'ai',false,coalesce((g.v->>'blanked')::boolean,false));
   n:=0;
   for s in select e.value from jsonb_array_elements(g.v->'sources') e loop
    continue when s->>'excerpt' is null or length(btrim(s->>'excerpt'))=0 or n>=8;
    continue when exists(select 1 from private.visibility_plan_sources q where q.row_id=v_id and not q.deleted and q.kind=s->>'kind' and q.ref_id is not distinct from nullif(s->>'ref_id','')::uuid and q.excerpt=left(btrim(s->>'excerpt'),280));
    insert into private.visibility_plan_sources(engagement_id,row_id,kind,ref_id,excerpt,position) values(run.engagement_id,v_id,s->>'kind',nullif(s->>'ref_id','')::uuid,left(btrim(s->>'excerpt'),280),n);
    n:=n+1;
   end loop;
   ids:=ids[1:idx]||v_id||ids[idx+1:];
   ranks:=ranks[1:idx]||rk||ranks[idx+1:];
  end loop;
  update private.visibility_plan_rows x set position=o.ord from unnest(ids) with ordinality o(id,ord) where x.id=o.id;
 end if;
 update private.visibility_plans set status='drafted',error=null,dropped=n_dropped,ai_run=run.id,drafted_at=t where id=pl.id;
 perform private.vp_settle(pl.id,false);
 perform private.vp_report_touch(run.engagement_id);
 select count(*)::integer into v_live from private.visibility_plan_rows where plan_id=pl.id and not deleted;
 if v_live=0 then
  update private.visibility_plans set status=case when n_dropped>0 then 'needs_attention' else 'thin' end where id=pl.id;
 elsif n_dropped>0 then
  update private.visibility_plans set status='needs_attention' where id=pl.id and status<>'reviewed';
 end if;
 update private.ai_runs set status='ok',changed=n_kept>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'kept',n_kept,'dropped',n_dropped,'skipped',n_skipped,'blanked',n_blanked,'reordered',reordered,'refused',reasons),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.visibility_plan_rounds set status='ready',attempts=0,lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,
  last_ok_at=t,last_kept=n_kept,last_dropped=n_dropped where id=r.id;
 return jsonb_build_object('status','ok','kept',n_kept,'dropped',n_dropped,'skipped',n_skipped,'blanked',n_blanked);
end $$;

-- The page's state: the plan also says how many of its rows had their when cleared and are still blank.
create or replace function private.visibility_plan_state(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare guard text:=private.report_guard(p_engagement,false); pl private.visibility_plans; rd private.visibility_plan_rounds; ai boolean; out jsonb;
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 -- A plan the round left in Drafting is healed here, as the report heals a section.
 perform private.vp_heal(p_engagement);
 select * into pl from private.visibility_plans where engagement_id=p_engagement and not deleted;
 select * into rd from private.visibility_plan_rounds where engagement_id=p_engagement and not deleted;
 select coalesce(e.settings->>'ai_enabled','false')='true' into ai from public.engagements e where e.id=p_engagement;
 select jsonb_build_object('status','ok','server_time',clock_timestamp(),'ai',coalesce(ai,false),'lead',coalesce(private.is_lead(p_engagement),false),
  'report_draft',exists(select 1 from private.report_drafts d where d.engagement_id=p_engagement and not d.deleted),
  'closed',exists(select 1 from public.engagements e where e.id=p_engagement and e.status='closed'),
  'report_stale',coalesce((select bool_or(s.plan_stale) from private.report_sections s where s.engagement_id=p_engagement and s.key='visibility' and not s.deleted),false),
  'plan',case when pl.id is not null then jsonb_build_object('id',pl.id,'moment',pl.moment,'public_date',pl.public_date,'status',pl.status,'error',pl.error,'dropped',pl.dropped,'drafted_at',pl.drafted_at,
   'dates_blanked',(select count(*)::integer from private.visibility_plan_rows w where w.plan_id=pl.id and not w.deleted and w.when_blanked and btrim(w.when_text)='' and w.when_date is null)) end,
  'round',case when rd.id is not null then jsonb_build_object('status',rd.status,'requested_at',rd.requested_at,'attempts',rd.attempts,'error',rd.last_error,'ok_at',rd.last_ok_at,'kept',rd.last_kept,'dropped',rd.last_dropped) end,
  'rows',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'position',r.position,'stage',r.stage,'who',r.who,'when_text',r.when_text,'when_date',r.when_date,'by_whom',r.by_whom,
    'what_they_hear',r.what_they_hear,'risk',r.risk,'origin',r.origin,'touched',r.touched,'needs_source',r.origin='ai' and not private.vp_row_sourced(r.id),
    'reviewed',case when r.reviewed_at is not null then jsonb_build_object('at',r.reviewed_at,'by',(select u.name from public.clearway_users u where u.id=r.reviewed_by)) end,
    'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'ref_id',s.ref_id,'excerpt',s.excerpt,'room',false,'broken',not private.rp_source_live(p_engagement,s.kind,s.ref_id),'info',
      case when s.kind='record' then jsonb_build_object('label','Record','text',s.excerpt) else private.rp_source_info(p_engagement,s.kind,s.ref_id) end) order by s.position,s.id)
      from private.visibility_plan_sources s where s.row_id=r.id and not s.deleted),'[]'::jsonb)) order by r.position,r.id)
    from private.visibility_plan_rows r where r.plan_id=pl.id and not r.deleted),'[]'::jsonb)) into out;
 return out;
end $$;

commit;
