-- Two fixes from the live-5 run: sign-off numbers after a reset, and a hand-added visibility plan row keeping its place through Draft again.
-- Each is introduced below. Redefined: private.report_sign_off_pre_visibility_plan, private.visibility_plan_apply, and the unique index on
-- private.report_sign_offs. No open pull request redefines any of them (126 redefines signal_neutral, signal_act and signal_state; this file does not).
begin;

-- ---------- Sign-off numbers count the sign-offs that stand (live-5, section 39) ----------
-- After Reset practice room the first new sign-off came out as version 5: the next number was worked out over the sign-offs the reset had put away
-- (deleted, n 1 to 4) as well as the ones that stand. Every other read of the sign-offs already ignores deleted rows. The number is now the highest
-- standing n plus one, and the unique index on (engagement, n) holds only for standing rows, so a number a reset put away can be used again.
-- private.report_sign_off is the wrapper step 3 made (20261108030000); the function below is step 1's, named report_sign_off_pre_visibility_plan, as
-- it stands now: only the number's expression differs.
drop index private.report_sign_offs_n_idx;
create unique index report_sign_offs_n_idx on private.report_sign_offs(engagement_id,n) where not deleted;

CREATE OR REPLACE FUNCTION private.report_sign_off_pre_visibility_plan(p_engagement uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare guard text:=private.report_guard(p_engagement,true); last private.report_sign_offs; snap jsonb; n integer; v_unrev integer; v_unsrc integer; v_sections integer; v_heads text[];
begin
 if guard is not null then return jsonb_build_object('status',guard); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 if not coalesce(private.is_lead(p_engagement),false) then return jsonb_build_object('status','lead_only'); end if;
 perform private.discover_lock(p_engagement);
 select * into last from private.report_sign_offs where engagement_id=p_engagement and not deleted order by n desc limit 1;
 if last.id is not null and last.request_id=p_id then return jsonb_build_object('status','duplicate','n',last.n); end if;
 select count(*)::integer,count(*) filter (where s.status<>'reviewed')::integer into v_sections,v_unrev from private.report_sections s join private.report_drafts d on d.id=s.draft_id and d.engagement_id=s.engagement_id and not d.deleted
  where s.engagement_id=p_engagement and not s.deleted;
 if v_sections<14 then return jsonb_build_object('status','no_draft'); end if;
 if v_unrev>0 then return jsonb_build_object('status','not_reviewed','count',v_unrev); end if;
 -- The 10-year Future is what the room signed off, word for word: it is checked against the signed off lens summaries again here.
 if not private.rp_future_ok(p_engagement) then return jsonb_build_object('status','future_changed'); end if;
 select count(*)::integer,coalesce(array_agg(distinct s.heading),array[]::text[]) into v_unsrc,v_heads from private.report_sentences x join private.report_sections s on s.id=x.section_id and not s.deleted
  where x.engagement_id=p_engagement and not x.deleted and x.origin<>'facilitator' and not private.rp_sentence_sourced(x.id);
 if v_unsrc>0 then return jsonb_build_object('status','unsourced','count',v_unsrc,'sections',to_jsonb(v_heads)); end if;
 snap:=private.report_snapshot(p_engagement);
 if last.id is not null and last.snapshot=snap then return jsonb_build_object('status','unchanged','n',last.n); end if;
 select coalesce(max(o.n),0)+1 into n from private.report_sign_offs o where o.engagement_id=p_engagement and not o.deleted;
 insert into private.report_sign_offs(engagement_id,n,request_id,snapshot,signed_by) values(p_engagement,n,p_id,snap,private.clearway_user_id());
 return jsonb_build_object('status','ok','n',n);
end $$;

-- ---------- A row added by hand keeps its place through Draft again (live-5, section 43) ----------
-- docs/visibility-plan.md: Draft again keeps the facilitator's rows where they are. Edited, moved and reviewed rows came back in their places, because
-- the new rows are set among them by the outward order (lead pastor to congregation). A row added by hand with a stage of its own (other) sorts
-- last in that order, so a hand row put fifth went to the end. A hand row now keeps the number it had (the 5th row stays the 5th, or the last when
-- fewer rows stand); the new rows and every other kept row are placed as before. Newest definition: 20261108090000_plan_name_check.sql (the name
-- check). Only the placement of the hand rows is new.
create or replace function private.visibility_plan_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.visibility_plan_rounds; pl private.visibility_plans; t timestamptz:=clock_timestamp(); in_ jsonb; v_ms integer; sn record; v_refs text[]; cited jsonb;
 names text[]; why text; srcs jsonb; reasons jsonb:='[]'::jsonb; good jsonb:='[]'::jsonb; g record; n_kept integer:=0; n_dropped integer:=0; n_skipped integer:=0; kept text[];
 v_row jsonb; ids uuid[]; ranks integer[]; idx integer; v_id uuid; n integer; s jsonb; reordered boolean:=false; last_rank integer:=0; v_live integer; rk integer; v_when_date date;
 hand_ids uuid[]; hand_pos integer[]; v_floor date; v_q text; pd date[]; pr integer[]; good2 jsonb:='[]'::jsonb; v_d date; n_blanked integer:=0; v_blank boolean; gv jsonb; blank_log jsonb:='[]'::jsonb;
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
   v_blank:=true; n_blanked:=n_blanked+1; why:=null;
   blank_log:=blank_log||jsonb_build_array(jsonb_build_object('stage',v_row->>'stage','reason','when'));
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
    blank_log:=blank_log||jsonb_build_array(jsonb_build_object('stage',gv->'row'->>'stage','reason','order'));
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
  -- A row the facilitator added by hand holds the place they gave it (the rank rule below would send a stage of their own to the end);
  -- every other kept row (edited, reviewed, moved) is placed among the new rows by the outward order, as before.
  select coalesce(array_agg(x.id order by x.position,x.id),array[]::uuid[]),coalesce(array_agg(private.vp_rank(x.stage) order by x.position,x.id),array[]::integer[]) into ids,ranks
   from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and x.origin<>'facilitator';
  select coalesce(array_agg(x.id order by x.position,x.id),array[]::uuid[]),coalesce(array_agg(x.position order by x.position,x.id),array[]::integer[]) into hand_ids,hand_pos
   from private.visibility_plan_rows x where x.plan_id=pl.id and not x.deleted and x.origin='facilitator';
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
  for i in 1..cardinality(hand_ids) loop
   idx:=least(greatest(hand_pos[i]-1,0),cardinality(ids));
   ids:=ids[1:idx]||hand_ids[i]||ids[idx+1:];
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
 update private.ai_runs set status='ok',changed=n_kept>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'kept',n_kept,'dropped',n_dropped,'skipped',n_skipped,'blanked',n_blanked,'blanked_rows',blank_log,'reordered',reordered,'refused',reasons),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.visibility_plan_rounds set status='ready',attempts=0,lease_id=null,lease_run=null,lease_until=null,last_failed_at=null,last_error=null,
  last_ok_at=t,last_kept=n_kept,last_dropped=n_dropped where id=r.id;
 return jsonb_build_object('status','ok','kept',n_kept,'dropped',n_dropped,'skipped',n_skipped,'blanked',n_blanked);
end $$;

commit;
