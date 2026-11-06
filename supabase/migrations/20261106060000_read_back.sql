-- Milestone 5, step 3a: the Day 2 short confirm and the read-back (D2-03, D2-04, INT-14). Live only, after merge and
-- Chris's approval. No session is started and nothing is seeded in an engagement.
--
-- One new kind joins the interaction registry: read_back. Day 2, 9:00 is a short confirm. The TV shows one item at a
-- time: first the five signed-off lens summaries (milestone 4), then the reviewed outcomes (each provisional Vision
-- Outcome with its 3-year Vision bullets, from the latest overnight publication). Phones answer "Yes, that's us" or "It
-- needs a change" (a short box), and "What's missing?". The scribe records the wording the room agrees and why; the
-- facilitator accepts, edits or dismisses each correction. A correction that names a line folds in code; one that
-- names no line goes to AI (fold_read_back). Folds show as tracked changes. The tally never decides: the facilitator
-- marks a decision per item (decision_mark, subject read_back), which settles it. A lens item settled with a change
-- becomes a new signed-off lens summary version; an outcome item settled with a change is what the draft Map shows.
--
-- The items are read when the step goes on air (rb_load) and again when the facilitator presses Reload items. An item
-- nobody has touched is rewritten from the sources; a touched one is kept.
--
-- Shared objects this migration touches, each as a superset of the latest definition on main:
--   private.ai_runs ai_runs_job_check   keeps every job and adds fold_read_back
--   private.ai_on                       keeps every branch and adds the read_back kind
--   private.ai_claim, private.ai_apply, private.ai_fail
--                                       now wrappers: a read_back session (or its job) is handled here, everything else
--                                       goes to the function that was there, renamed ai_claim_base5, ai_apply_base5, ai_fail_base4
--   private.decision_mark, private.decisions subject check
--                                       the subject read_back is added (every earlier subject and rule unchanged)
--   private.lens_summary_versions author check
--                                       also allows read_back (the Day 2 confirm's version of a lens summary)
--   private.map_assemble                the outcome's 3-year Vision bullets read the read-back's settled version first, then the
--                                       overnight publication, then the room's bullets; everything else unchanged
--   private.reset_practice_room         the newest definition (What We Heard's wrapper), renamed to _base5 and wrapped; also clears this step's tables
--   private.rehearsal_control           the newest definition (What We Heard's wrapper), renamed to _base5 and wrapped; Clear test answers also clears this step's test rows
--   private.control_status              the newest definition, text-patched: this step's test items join the rehearsal count (nothing else changes)
--   private.templates (data)            the "Confirm the 10-year Future" placeholder in both Wayfinding templates becomes a read_back step
begin;

-- ---------- The kind ----------
-- An answer is {"version": id, "response": "yes"|"change"|"missing"} with its words. Answers are not shared: the results carry
-- the tally and the anonymous "What's missing?" answers; the "It needs a change" words go to the facilitator only.
insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('read_back','Read-back',true,false,'people',true,false,'none','never',130);

-- ---------- Tables ----------
-- The board: which item the room is on. One per read-back step.
create table private.read_back_boards (
 session_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 current_item_id uuid,
 pub_n integer,
 loaded_at timestamptz not null default clock_timestamp(),
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index read_back_boards_engagement_idx on private.read_back_boards(engagement_id);

-- An item: a signed-off lens summary, or a reviewed outcome with its 3-year Vision bullets.
create table private.read_back_items (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 kind text not null check(kind in ('lens','outcome')),
 lens smallint check(lens between 1 and 5),
 outcome_id uuid,
 heading text not null default '' check(length(heading)<=200),
 position integer not null default 0 check(position>=0),
 state text not null default 'open' check(state in ('open','settled')),
 current_version_id uuid,
 settled_version_id uuid,
 decision_id uuid references private.decisions(id),
 landed_version_id uuid,
 landed_prev_id uuid,
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id),
 check((kind='lens' and lens is not null) or (kind='outcome' and outcome_id is not null)),
 check((state='settled')=(settled_version_id is not null))
);
create unique index read_back_items_unique on private.read_back_items(session_id,kind,(coalesce(lens::text,outcome_id::text))) where not deleted;
create index read_back_items_session_idx on private.read_back_items(session_id,engagement_id,position) where not deleted;
create index read_back_items_decision_idx on private.read_back_items(decision_id);
create index read_back_items_engagement_idx on private.read_back_items(engagement_id);

-- Every version of an item is kept. "source" is the text as signed off or published; "code" and "ai" are folds.
create table private.read_back_versions (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 item_id uuid not null,
 version integer not null check(version>=1),
 author text not null check(author in ('source','code','ai')),
 ai_run_id uuid references private.ai_runs(id),
 correction_id uuid,
 note text not null default '' check(length(note)<=300),
 tracked boolean not null default false,
 based_on uuid,
 changes jsonb not null default '[]' check(jsonb_typeof(changes)='array' and pg_column_size(changes)<=65536),
 undone_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(item_id,engagement_id) references private.read_back_items(id,engagement_id)
);
create unique index read_back_versions_unique on private.read_back_versions(item_id,version) where not deleted;
create index read_back_versions_run_idx on private.read_back_versions(ai_run_id);
create index read_back_versions_engagement_idx on private.read_back_versions(engagement_id);

-- A line of a version. base_text is the line as it first stood (its ancestor in version 1), so the words the confirm
-- changed stay underlined until the item is settled. sources is [{"id": uuid, "text": text}], the room's own sentences.
create table private.read_back_lines (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 version_id uuid not null,
 position integer not null check(position>=0),
 text text not null check(length(btrim(text)) between 1 and 400),
 from_line_id uuid,
 base_text text,
 origin text not null default 'source' check(origin in ('source','correction')),
 sources jsonb not null default '[]' check(jsonb_typeof(sources)='array' and pg_column_size(sources)<=16384),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(version_id,engagement_id) references private.read_back_versions(id,engagement_id)
);
create unique index read_back_lines_unique on private.read_back_lines(version_id,position) where not deleted;
create index read_back_lines_engagement_idx on private.read_back_lines(engagement_id);

-- A correction: the wording the room agreed and why. It waits in the facilitator's queue. The scribe's reason stays here and on
-- the control surface; it never reaches the TV or a phone. The id is made by the writer, so a replay is a duplicate.
create table private.read_back_corrections (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 item_id uuid not null,
 version_id uuid not null,
 line_id uuid,
 new_line boolean not null default false,
 wording text not null check(length(btrim(wording)) between 1 and 400),
 reason text not null default '' check(length(reason)<=400),
 source text not null check(source in ('scribe','facilitator')),
 by_user uuid references public.clearway_users(id),
 by_attendee uuid,
 state text not null default 'queued' check(state in ('queued','folding','folded','dismissed','failed')),
 failure text not null default '' check(length(failure)<=40),
 run_id uuid references private.ai_runs(id),
 result_version_id uuid,
 test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(item_id,engagement_id) references private.read_back_items(id,engagement_id),
 foreign key(by_attendee,engagement_id) references public.attendees(id,engagement_id),
 check(not (line_id is not null and new_line))
);
create index read_back_corrections_item_idx on private.read_back_corrections(item_id,engagement_id,created_at) where not deleted;
create index read_back_corrections_session_idx on private.read_back_corrections(session_id,engagement_id);
create index read_back_corrections_by_user_idx on private.read_back_corrections(by_user);
create index read_back_corrections_attendee_idx on private.read_back_corrections(by_attendee,engagement_id);
create index read_back_corrections_run_idx on private.read_back_corrections(run_id);

alter table private.read_back_boards enable row level security;
alter table private.read_back_boards force row level security;
alter table private.read_back_items enable row level security;
alter table private.read_back_items force row level security;
alter table private.read_back_versions enable row level security;
alter table private.read_back_versions force row level security;
alter table private.read_back_lines enable row level security;
alter table private.read_back_lines force row level security;
alter table private.read_back_corrections enable row level security;
alter table private.read_back_corrections force row level security;
revoke all on private.read_back_boards,private.read_back_items,private.read_back_versions,private.read_back_lines,private.read_back_corrections from public,anon,authenticated;
grant select,insert,update,delete on private.read_back_boards,private.read_back_items,private.read_back_versions,private.read_back_lines,private.read_back_corrections to service_role;
create trigger touch_record before update on private.read_back_boards for each row execute function private.touch_live_record('session_id');
create trigger touch_record before update on private.read_back_items for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.read_back_versions for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.read_back_lines for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.read_back_corrections for each row execute function private.touch_live_record('id');
create trigger mark_test before insert on private.read_back_boards for each row execute function private.mark_test();
create trigger mark_test before insert on private.read_back_items for each row execute function private.mark_test();
create trigger mark_test before insert on private.read_back_corrections for each row execute function private.mark_test();
comment on table private.read_back_corrections is 'The scribe''s and facilitator''s corrections to a read-back item. No role reads it directly; the read-back functions do, for facilitators and the scribe.';

-- Other records this step widens.
alter table private.decisions drop constraint decisions_subject_check;
alter table private.decisions add constraint decisions_subject_check check(subject in ('step','lens_summary','outcome','candidate','cut_line','goal','intent','read_back','other'));
alter table private.lens_summary_versions drop constraint lens_summary_versions_author_check;
alter table private.lens_summary_versions add constraint lens_summary_versions_author_check check(author in ('ai','facilitator','read_back'));
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists','draft_discover_themes','draft_what_we_heard','fold_read_back'));

create or replace function private.ai_on(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select coalesce(e.settings->>'ai_enabled','false')='true'
   and (s.interaction in ('word_cloud','wall','qa','candidates','lens_summary','four_lists','read_back') or (s.interaction='grid' and s.options->>'preset'='pre_mortem') or (s.interaction='lens' and coalesce(s.options->>'seed','false')<>'true'))
   and coalesce(a.ai,case when jsonb_typeof(s.options->'ai')='boolean' then (s.options->>'ai')::boolean end,true)
  from public.sessions s join public.engagements e on e.id=s.engagement_id and not e.deleted
  left join private.ai_sessions a on a.session_id=s.id and not a.deleted
  where s.id=p_session and not s.deleted),false)
$$;

-- ---------- Small helpers ----------
create function private.rb_uuid(p text) returns uuid
language sql immutable security invoker set search_path='' as $$
 select case when p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- The words that changed against the line as it first stood: inserted words (keep and ins parts), or null when the line is as it was.
create function private.rb_marks(p_base text,p_text text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare d jsonb;
begin
 if p_base is null then return jsonb_build_array(jsonb_build_object('k','ins','t',p_text)); end if;
 if p_base=p_text then return null; end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into d from jsonb_array_elements(private.ls_diff(p_base,p_text)) x where x->>'k'<>'del';
 return case when d='[]'::jsonb or not exists(select 1 from jsonb_array_elements(d) y where y->>'k'='ins') then null else d end;
end $$;

-- What changed from one version to the next, by lineage (from_line_id), never by position: an edit with the word-level parts, an
-- added line, a removed one. "at" is the line's place in the new version, or for a removal the place after which it sat.
create function private.rb_changes(p_prev uuid,p_new uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with n as (select id,text,from_line_id,row_number() over(order by position)::integer as pos from private.read_back_lines where version_id=p_new and not deleted),
 o as (select id,text,row_number() over(order by position)::integer as pos from private.read_back_lines where version_id=p_prev and not deleted),
 ch as (
  select n.pos as place,n.id,case when o.id is null then 'add' else 'edit' end as kind,
   case when o.id is null then jsonb_build_array(jsonb_build_object('k','ins','t',n.text)) else private.ls_diff(o.text,n.text) end as parts
  from n left join o on o.id=n.from_line_id where o.id is null or o.text<>n.text
  union all
  select coalesce((select max(n2.pos) from n n2 join o o2 on o2.id=n2.from_line_id where o2.pos<o.pos),0),o.id,'remove',
   jsonb_build_array(jsonb_build_object('k','del','t',o.text))
  from o where not exists(select 1 from n where n.from_line_id=o.id)
 )
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'at',place,'parts',parts) order by place,kind),'[]'::jsonb) from ch
$$;

-- A new version of an item, made current. Lines and their sources are written with it; a line grown from another keeps that
-- line's first wording as its base.
create function private.rb_new_version(p_item uuid,p_author text,p_run uuid,p_note text,p_corr uuid,p_texts text[],p_froms uuid[],p_srcs jsonb,p_origins text[],p_tracked boolean,p_prev uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare it private.read_back_items; vid uuid:=gen_random_uuid(); n integer; base text;
begin
 select * into it from private.read_back_items where id=p_item;
 select coalesce(max(version),0)+1 into n from private.read_back_versions where item_id=p_item;
 insert into private.read_back_versions(id,engagement_id,item_id,version,author,ai_run_id,correction_id,note,tracked,based_on)
  values(vid,it.engagement_id,it.id,n,p_author,p_run,p_corr,left(coalesce(p_note,''),300),p_tracked,p_prev);
 for i in 1..coalesce(cardinality(p_texts),0) loop
  base:=case when p_froms[i] is not null then (select l.base_text from private.read_back_lines l where l.id=p_froms[i]) end;
  insert into private.read_back_lines(engagement_id,version_id,position,text,from_line_id,base_text,origin,sources)
   values(it.engagement_id,vid,i-1,p_texts[i],p_froms[i],case when p_prev is null then p_texts[i] else base end,coalesce(p_origins[i],'source'),
    case when jsonb_typeof(p_srcs->(i-1))='array' then p_srcs->(i-1) else '[]'::jsonb end);
 end loop;
 if p_prev is not null then update private.read_back_versions set changes=private.rb_changes(p_prev,vid) where id=vid; end if;
 update private.read_back_items set current_version_id=vid where id=it.id;
 return vid;
end $$;

-- The line of a version a correction's line has become (or came from), following the lineage both ways.
create function private.rb_line_in(p_line uuid,p_version uuid) returns uuid
language sql stable security definer set search_path='' as $$
 with recursive down(id,depth) as (
  select l.id,0 from private.read_back_lines l where l.id=p_line and not l.deleted
  union all
  select c.id,down.depth+1 from down join private.read_back_lines c on c.from_line_id=down.id and not c.deleted where down.depth<40),
 up(id,depth) as (
  select l.id,0 from private.read_back_lines l where l.id=p_line and not l.deleted
  union all
  select p.id,up.depth+1 from up join private.read_back_lines c on c.id=up.id join private.read_back_lines p on p.id=c.from_line_id and not p.deleted where up.depth<40)
 select x.id from (select id,depth from down union all select id,depth from up) x join private.read_back_lines l on l.id=x.id where l.version_id=p_version order by x.depth limit 1
$$;

-- ---------- Loading the items ----------
-- An item is touched once anyone answered its version, a correction was written, a fold made a second version, or it was settled.
create function private.rb_touched(p_item uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select i.state='settled'
   or exists(select 1 from private.read_back_versions v where v.item_id=i.id and not v.deleted and v.version>1)
   or exists(select 1 from private.read_back_corrections c where c.item_id=i.id and not c.deleted)
   or exists(select 1 from public.submissions x where x.session_id=i.session_id and x.engagement_id=i.engagement_id and not x.deleted and x.value->>'version'=i.current_version_id::text)
  from private.read_back_items i where i.id=p_item),false)
$$;

-- Make or refresh one item. An untouched item is rewritten from the sources (version 1 in place); a touched one is left alone.
create function private.rb_put_item(p_session uuid,p_kind text,p_lens smallint,p_outcome uuid,p_heading text,p_pos integer,p_texts text[],p_srcs jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare it private.read_back_items; eng uuid; n integer:=coalesce(cardinality(p_texts),0); same boolean;
begin
 select engagement_id into eng from public.sessions where id=p_session;
 select * into it from private.read_back_items x where x.session_id=p_session and x.kind=p_kind and not x.deleted and ((p_kind='lens' and x.lens=p_lens) or (p_kind='outcome' and x.outcome_id=p_outcome));
 if it.id is null then
  insert into private.read_back_items(engagement_id,session_id,kind,lens,outcome_id,heading,position)
   values(eng,p_session,p_kind,case when p_kind='lens' then p_lens end,case when p_kind='outcome' then p_outcome end,left(coalesce(p_heading,''),200),p_pos) returning * into it;
  perform private.rb_new_version(it.id,'source',null,'',null,p_texts,array_fill(null::uuid,array[n]),p_srcs,array_fill('source'::text,array[n]),false,null);
  return it.id;
 end if;
 update private.read_back_items set heading=left(coalesce(p_heading,''),200),position=p_pos where id=it.id and (heading is distinct from left(coalesce(p_heading,''),200) or position<>p_pos);
 if private.rb_touched(it.id) then return it.id; end if;
 select coalesce((select array_agg(l.text order by l.position) from private.read_back_lines l where l.version_id=it.current_version_id and not l.deleted),array[]::text[])=coalesce(p_texts,array[]::text[])
  and coalesce((select jsonb_agg(l.sources order by l.position) from private.read_back_lines l where l.version_id=it.current_version_id and not l.deleted),'[]'::jsonb)=coalesce((select jsonb_agg(case when jsonb_typeof(q)='array' then q else '[]'::jsonb end) from jsonb_array_elements(p_srcs) q),'[]'::jsonb)
  into same;
 if same then return it.id; end if;
 update private.read_back_lines set deleted=true where version_id=it.current_version_id and not deleted;
 for i in 1..n loop
  insert into private.read_back_lines(engagement_id,version_id,position,text,base_text,sources)
   values(eng,it.current_version_id,i-1,p_texts[i],p_texts[i],case when jsonb_typeof(p_srcs->(i-1))='array' then p_srcs->(i-1) else '[]'::jsonb end);
 end loop;
 return it.id;
end $$;

-- Read the items: the five signed-off lens summaries in lens order, then the outcomes of the latest overnight publication. A lens with
-- no signed-off summary has no item. Nothing published means no outcome items.
create function private.rb_load(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; b private.read_back_boards; pub private.overnight_publications; vid uuid; texts text[]; srcs jsonb; kept uuid[]:=array[]::uuid[]; got uuid; o record; oid uuid;
 n_lens integer:=0; n_out integer:=0; heading text;
begin
 select * into s from public.sessions where id=p_session and not deleted and interaction='read_back';
 if s.id is null then return jsonb_build_object('status','missing'); end if;
 select * into b from private.read_back_boards where session_id=p_session;
 if b.session_id is null then insert into private.read_back_boards(session_id,engagement_id) values(p_session,s.engagement_id); end if;
 update private.read_back_boards set deleted=false where session_id=p_session and deleted;
 select * into pub from private.overnight_publications where engagement_id=s.engagement_id and withdrawn_at is null order by n desc limit 1;
 for i in 1..5 loop
  select ls.signed_off_version_id into vid from private.lens_summaries ls where ls.engagement_id=s.engagement_id and ls.lens=i and not ls.deleted;
  if vid is null then continue; end if;
  select array_agg(ss.text order by ss.position),jsonb_agg(coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'text',l.text) order by l.created_at,l.id)
     from private.lens_summary_sources src join private.lens_sentences l on l.id=src.lens_sentence_id and l.engagement_id=src.engagement_id and not l.deleted and not l.withdrawn
     where src.summary_sentence_id=ss.id and not src.deleted),'[]'::jsonb) order by ss.position)
   into texts,srcs from private.lens_summary_sentences ss where ss.version_id=vid and not ss.deleted;
  if texts is null then continue; end if;
  kept:=kept||private.rb_put_item(p_session,'lens',i::smallint,null,'',i,texts,srcs); n_lens:=n_lens+1;
 end loop;
 if pub.id is not null then
  for o in select x.value as v,x.ordinality as n from jsonb_array_elements(case when jsonb_typeof(pub.snapshot->'outcomes')='array' then pub.snapshot->'outcomes' else '[]'::jsonb end) with ordinality x loop
   oid:=private.rb_uuid(o.v->>'outcome_id');
   if oid is null then continue; end if;
   select array_agg(bl.value->>'text' order by bl.ordinality),
     jsonb_agg(coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'text',z.text) order by z.ord) from (
        select distinct on (i.id) i.id,i.text,i.created_at as ord from private.draft_outcomes d
         join private.draft_bullets bu on bu.draft_outcome_id=d.id and bu.engagement_id=d.engagement_id and not bu.deleted and not bu.removed and bu.text=bl.value->>'text'
         join private.draft_sources ds on ds.bullet_id=bu.id and ds.engagement_id=bu.engagement_id and not ds.deleted and ds.kind='bullet'
         join private.outcome_indicators i on i.id=ds.ref_id and i.engagement_id=ds.engagement_id and not i.deleted
         where d.round_id=pub.round_id and d.outcome_id=oid and not d.deleted order by i.id limit 6) z),'[]'::jsonb) order by bl.ordinality)
    into texts,srcs from jsonb_array_elements(case when jsonb_typeof(o.v->'bullets')='array' then o.v->'bullets' else '[]'::jsonb end) with ordinality bl
    where jsonb_typeof(bl.value->'text')='string' and length(btrim(bl.value->>'text')) between 1 and 400;
   heading:=left(btrim(coalesce(o.v->>'name','')),200);
   if heading='' then continue; end if;
   kept:=kept||private.rb_put_item(p_session,'outcome',null,oid,heading,10+o.n::integer,coalesce(texts,array[]::text[]),coalesce(srcs,'[]'::jsonb)); n_out:=n_out+1;
  end loop;
 end if;
 -- An untouched item the sources no longer hold goes away.
 for got in select x.id from private.read_back_items x where x.session_id=p_session and not x.deleted and not x.id=any(kept) loop
  if not private.rb_touched(got) then
   update private.read_back_lines set deleted=true where version_id in (select id from private.read_back_versions where item_id=got) and not deleted;
   update private.read_back_versions set deleted=true where item_id=got and not deleted;
   update private.read_back_items set deleted=true,current_version_id=null where id=got;
  end if;
 end loop;
 update private.read_back_boards set pub_n=pub.n,loaded_at=clock_timestamp(),
  current_item_id=case when current_item_id is not null and exists(select 1 from private.read_back_items x where x.id=current_item_id and not x.deleted) then current_item_id
    else (select x.id from private.read_back_items x where x.session_id=p_session and not x.deleted order by x.position,x.created_at,x.id limit 1) end
  where session_id=p_session;
 return jsonb_build_object('status','ok','lenses',n_lens,'outcomes',n_out,'published',pub.id is not null);
end $$;

-- Going on air reads the items the first time, so the step arrives with them. The results are recomputed here.
create function private.rb_on_air() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
 if new.live_session_id is null or new.live_session_id is not distinct from old.live_session_id then return new; end if;
 select * into s from public.sessions where id=new.live_session_id and not deleted;
 if s.interaction is distinct from 'read_back' then return new; end if;
 if not exists(select 1 from private.read_back_boards where session_id=s.id and not deleted) then perform private.rb_load(s.id); end if;
 new.results:=private.live_results_for(new.engagement_id,new.live_session_id,new.hidden_keys);
 return new;
end $$;
create trigger rb_on_air before update of live_session_id on public.room_states for each row execute function private.rb_on_air();

-- ---------- Options ----------
create function private.options_read_back(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='object' and not exists(select 1 from jsonb_object_keys(p) k where k not in ('ai')) and coalesce(jsonb_typeof(p->'ai'),'boolean')='boolean'
  then jsonb_strip_nulls(jsonb_build_object('ai',case when p ? 'ai' then (p->>'ai')::boolean end)) end
$$;

-- ---------- A phone's answer ----------
-- "Yes, that's us" and "It needs a change" are for the version on the screen now; a phone that is a version behind gets "stale", reads
-- the new version and answers that one. "What's missing?" is for the item on the screen, whatever its version. Words go through the word filter.
create function private.parse_read_back(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b private.read_back_boards; it private.read_back_items; v private.read_back_versions; resp text; ver uuid; t text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_value))<>2
  or private.rb_uuid(p_value->>'version') is null or p_value->>'response' is null or p_value->>'response' not in ('yes','change','missing') then return jsonb_build_object('status','invalid_answer'); end if;
 resp:=p_value->>'response'; ver:=(p_value->>'version')::uuid;
 select * into b from private.read_back_boards where session_id=p_session.id and not deleted;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted;
 select * into v from private.read_back_versions where id=ver and item_id=it.id and not deleted and undone_at is null;
 if it.id is null or v.id is null or it.state='settled' or (resp<>'missing' and it.current_version_id is distinct from v.id) then return jsonb_build_object('status','stale'); end if;
 if resp='yes' then return jsonb_build_object('status','ok','text','Yes, that''s us','answers','[]'::jsonb,'value',jsonb_build_object('version',v.id,'response','yes')); end if;
 t:=btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g'));
 if length(t)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 if length(t)>(case when resp='change' then 140 else 280 end) then return jsonb_build_object('status','limit'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 return jsonb_build_object('status','ok','text',t,'answers','[]'::jsonb,'value',jsonb_build_object('version',v.id,'response',resp));
end $$;

-- One "yes" or "needs a change" per person for a version: a later one replaces the earlier (the earlier stays as history).
create function private.rb_mirror() returns trigger
language plpgsql security definer set search_path='' as $$
declare resp text;
begin
 if pg_trigger_depth()>1 then return new; end if;
 if not exists(select 1 from public.sessions s where s.id=new.session_id and s.engagement_id=new.engagement_id and s.interaction='read_back') then return new; end if;
 resp:=new.value->>'response';
 if resp in ('yes','change') and not new.withdrawn and not new.deleted and not new.hidden then
  update public.submissions set withdrawn=true,replaced_by=new.id
   where session_id=new.session_id and attendee_id=new.attendee_id and id<>new.id and not deleted and not withdrawn
    and value->>'version'=new.value->>'version' and value->>'response' in ('yes','change');
 end if;
 return new;
end $$;
create trigger rb_mirror after insert or update of text,value,withdrawn,hidden,deleted on public.submissions for each row execute function private.rb_mirror();

-- ---------- What the TV and phones read ----------
-- Lines of a version for display: the words, the marks (inserted words against the line as it first stood), and for the
-- facilitator and phones the sources behind each line.
create function private.rb_lines(p_version uuid,p_marks boolean,p_sources boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',x.id,'pos',x.pos,'text',x.text,'origin',x.origin,
   'marks',case when p_marks then private.rb_marks(x.base_text,x.text) end,
   'sources',case when p_sources then x.sources end)) order by x.pos),'[]'::jsonb)
 from (select l.*,row_number() over(order by l.position)::integer as pos from private.read_back_lines l where l.version_id=p_version and not l.deleted) x
$$;

-- The heading the room sees: "Community, 2036" for a lens, the outcome's title for an outcome.
create function private.rb_heading(p_item uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when i.kind='lens' then coalesce(nullif(btrim(e.lens_names[i.lens]),''),(array['Congregation','Community','Leadership','Operations','Learning'])[i.lens])||', '||(e.base_year+10)
  else i.heading end
 from private.read_back_items i join public.engagements e on e.id=i.engagement_id where i.id=p_item
$$;

create function private.results_read_back(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; e public.engagements; b private.read_back_boards; it private.read_back_items; v private.read_back_versions;
 yes integer:=0; chg integer:=0; miss integer:=0; ppl integer:=0; missing jsonb:='[]'::jsonb; item jsonb; items jsonb:='[]'::jsonb; n integer:=0; idx integer; dec_text text; lines jsonb; nl integer; fit integer;
begin
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='read_back';
 if s.id is null then return jsonb_build_object('total',0,'people',0,'words','[]'::jsonb); end if;
 select * into e from public.engagements where id=p_engagement;
 select * into b from private.read_back_boards where session_id=s.id and not deleted;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted;
 select * into v from private.read_back_versions where id=it.current_version_id and not deleted;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'label',case when x.kind='lens' then coalesce(nullif(btrim(e.lens_names[x.lens]),''),'Lens '||x.lens) else x.heading end,
   'state',case when x.state='settled' then 'settled' when x.id=it.id then 'now' else 'later' end) order by x.position,x.created_at,x.id),'[]'::jsonb),count(*)::integer,
  coalesce(max(case when x.id=it.id then rn end),0)
  into items,n,idx
  from (select y.*,row_number() over(order by y.position,y.created_at,y.id)::integer as rn from private.read_back_items y where y.session_id=s.id and not y.deleted) x;
 if it.id is not null and v.id is not null then
  select count(*) filter (where x.value->>'response'='yes' and x.value->>'version'=v.id::text)::integer,
         count(*) filter (where x.value->>'response'='change' and x.value->>'version'=v.id::text)::integer,
         count(*) filter (where x.value->>'response'='missing')::integer,
         count(distinct x.attendee_id)::integer
   into yes,chg,miss,ppl
   from public.submissions x
   where x.session_id=p_session and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden
    and ((x.value->>'response'='missing' and x.value->>'version' in (select y.id::text from private.read_back_versions y where y.item_id=it.id and not y.deleted))
      or (x.value->>'response' in ('yes','change') and x.value->>'version'=v.id::text));
  select coalesce(jsonb_agg(jsonb_build_object('id',left(q.id::text,8),'text',q.text) order by q.ts desc,q.id),'[]'::jsonb) into missing
   from (select x.id,x.text,x.updated_at as ts from public.submissions x
     where x.session_id=p_session and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden and not (x.id::text=any(p_hidden))
      and x.value->>'response'='missing' and x.value->>'version' in (select y.id::text from private.read_back_versions y where y.item_id=it.id and not y.deleted)
     order by x.updated_at desc,x.id limit 24) q;
  lines:=private.rb_lines(v.id,it.state<>'settled',false);
  select count(*)::integer,count(*) filter (where q.fits)::integer into nl,fit from (
   select (sum(length(l.text)+1) over(order by l.position)-1<=420 or row_number() over(order by l.position)=1) as fits
   from private.read_back_lines l where l.version_id=v.id and not l.deleted) q;
  if it.decision_id is not null and it.state='settled' then select d.decision into dec_text from private.decisions d where d.id=it.decision_id and not d.deleted; end if;
  item:=jsonb_build_object('id',it.id,'kind',it.kind,'lens',it.lens,'heading',private.rb_heading(it.id),
   'year',case when it.kind='lens' then e.base_year+10 else e.base_year+3 end,
   'horizon',case when it.kind='lens' then '10-year Future' else '3-year Vision' end,
   'version_id',v.id,'version',v.version,'author',v.author,'tracked',v.tracked,'lines',lines,'fit',fit,'more',nl-fit,
   'changes',case when v.tracked then v.changes else '[]'::jsonb end,'settled',it.state='settled','decision',dec_text);
 end if;
 return jsonb_build_object('total',yes+chg+miss,'people',ppl,'words','[]'::jsonb,'items',items,'index',idx,'count',n,
  'of',(select count(*) from public.attendees a where a.engagement_id=p_engagement and not a.deleted),
  'published',b.pub_n is not null,'item',item,'tally',jsonb_build_object('yes',yes,'change',chg),'missing',missing);
end $$;

create function private.items_read_back(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select '[]'::jsonb $$;

-- ---------- Phones: the full text with the sentences behind each line ----------
-- Only phone input the overnight draft cites stands behind an outcome line; lens lines carry the lens sentences they came from.
-- Settled items come too, for looking back. Participants only.
create function private.read_back_phone(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; b private.read_back_boards; it private.read_back_items;
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted and interaction='read_back';
 if s.id is null or r.live_session_id is distinct from s.id then return jsonb_build_object('status','missing'); end if;
 select * into b from private.read_back_boards where session_id=s.id and not deleted;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted;
 return jsonb_build_object('status','ok','item',case when it.id is not null then jsonb_build_object('id',it.id,'version_id',it.current_version_id,
    'lines',private.rb_lines(it.current_version_id,false,true)) end,
  'settled',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'heading',private.rb_heading(x.id),'changed',(select v.version>1 from private.read_back_versions v where v.id=x.settled_version_id),
      'lines',private.rb_lines(x.settled_version_id,false,false)) order by x.position,x.created_at,x.id)
    from private.read_back_items x where x.session_id=s.id and not x.deleted and x.state='settled'),'[]'::jsonb));
end $$;

-- ---------- The scribe's composer ----------
create function private.read_back_scribe(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; b private.read_back_boards; it private.read_back_items;
begin
 if private.scribe_role(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='read_back';
 if s.id is null then return jsonb_build_object('status','ok','session',null); end if;
 select * into b from private.read_back_boards where session_id=s.id and not deleted;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted;
 return jsonb_build_object('status','ok','session',s.id,'item',case when it.id is not null then jsonb_build_object('id',it.id,'heading',private.rb_heading(it.id),'kind',it.kind,'settled',it.state='settled',
    'version_id',it.current_version_id,'lines',private.rb_lines(it.current_version_id,false,false)) end);
end $$;

-- ---------- Corrections ----------
-- One correction, written once by its id. The line is one of the current version's (by lineage when the scribe saw an older one),
-- "new" for a new line, or none when the room did not name a line.
create function private.rb_add_correction(p_engagement uuid,p_id uuid,p_item uuid,p_line text,p_wording text,p_reason text,p_source text,p_user uuid,p_attendee uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; b private.read_back_boards; it private.read_back_items; w text:=btrim(regexp_replace(coalesce(p_wording,''),'\s+',' ','g')); why text:=btrim(coalesce(p_reason,'')); ln uuid; nl boolean:=false; rid uuid;
begin
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.read_back_corrections where id=p_id) then
  if exists(select 1 from private.read_back_corrections where id=p_id and engagement_id=p_engagement) then return jsonb_build_object('status','duplicate'); end if;
  return jsonb_build_object('status','conflict');
 end if;
 if length(w) not between 1 and 400 or length(why)>400 then return jsonb_build_object('status','invalid_request'); end if;
 if private.screen_text(w) then return jsonb_build_object('status','filtered'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='read_back';
 if s.id is null then return jsonb_build_object('status','invalid_state'); end if;
 select * into b from private.read_back_boards where session_id=s.id and not deleted;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted;
 if it.id is null or it.state='settled' or (p_item is not null and p_item is distinct from it.id) then return jsonb_build_object('status','stale'); end if;
 if (select count(*) from private.read_back_corrections c where c.item_id=it.id and not c.deleted)>=60 then return jsonb_build_object('status','limit'); end if;
 if p_line='new' then nl:=true;
 elsif p_line is not null and p_line<>'' then
  rid:=private.rb_uuid(p_line);
  if rid is null then return jsonb_build_object('status','invalid_request'); end if;
  ln:=private.rb_line_in(rid,it.current_version_id);
  if ln is null then return jsonb_build_object('status','stale'); end if;
 end if;
 insert into private.read_back_corrections(id,engagement_id,session_id,item_id,version_id,line_id,new_line,wording,reason,source,by_user,by_attendee)
  values(p_id,p_engagement,s.id,it.id,it.current_version_id,ln,nl,w,why,p_source,p_user,p_attendee);
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','scribe','what','correction'));
 return jsonb_build_object('status','accepted');
end $$;

create function private.read_back_correct(p_engagement uuid,p_id uuid,p_item uuid,p_line text,p_wording text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if private.scribe_role(p_engagement) is null then return jsonb_build_object('status','denied'); end if;
 return private.rb_add_correction(p_engagement,p_id,p_item,p_line,p_wording,p_reason,'scribe',private.clearway_user_id(),private.scribe_attendee(p_engagement));
end $$;

-- Fold in code: the wording replaces the named line or becomes a new last line, as a new tracked version. Other lines are untouched.
create function private.rb_fold_code(p_item uuid,p_corr uuid,p_line uuid,p_new boolean,p_wording text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare it private.read_back_items; cv private.read_back_versions; texts text[]; froms uuid[]; srcs jsonb; origs text[]; i integer; vid uuid;
begin
 select * into it from private.read_back_items where id=p_item;
 select * into cv from private.read_back_versions where id=it.current_version_id;
 select coalesce(array_agg(l.text order by l.position),array[]::text[]),coalesce(array_agg(l.id order by l.position),array[]::uuid[]),coalesce(jsonb_agg(l.sources order by l.position),'[]'::jsonb),coalesce(array_agg(l.origin order by l.position),array[]::text[])
  into texts,froms,srcs,origs from private.read_back_lines l where l.version_id=cv.id and not l.deleted;
 if p_new then
  if cardinality(texts)>=8 then return jsonb_build_object('status','too_many'); end if;
  texts:=array_append(texts,p_wording); froms:=array_append(froms,null::uuid); srcs:=srcs||jsonb_build_array('[]'::jsonb); origs:=array_append(origs,'correction');
 else
  i:=array_position(froms,p_line);
  if i is null then return jsonb_build_object('status','stale'); end if;
  texts[i]:=p_wording; origs[i]:='correction';
 end if;
 vid:=private.rb_new_version(it.id,'code',null,'',p_corr,texts,froms,srcs,origs,true,cv.id);
 return jsonb_build_object('status','ok','version',vid);
end $$;

-- ---------- The facilitator's view (private) ----------
-- Everything the TV has, plus: the sources behind each line, the "It needs a change" words, the missing answers, the correction
-- queue with the scribe's reasons, every version, and the AI's state. Anonymous answers stay anonymous: no attendee is named.
create function private.read_back_state(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; e public.engagements; b private.read_back_boards; it private.read_back_items; v private.read_back_versions; a private.ai_sessions; run private.ai_runs; last_run private.ai_runs;
 t timestamptz:=clock_timestamp(); latest private.overnight_publications; ai_state text; d private.decisions; changes jsonb:='[]'::jsonb; missing jsonb:='[]'::jsonb;
begin
 if not coalesce(private.wf_facilitates(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into e from public.engagements where id=p_engagement;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='read_back';
 if s.id is null then return jsonb_build_object('status','ok','session',null); end if;
 select * into b from private.read_back_boards where session_id=s.id and not deleted;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted;
 select * into v from private.read_back_versions where id=it.current_version_id and not deleted;
 select * into a from private.ai_sessions where session_id=s.id and not deleted;
 if a.lease_run is not null and a.lease_until>t then select * into run from private.ai_runs where id=a.lease_run and status='running'; end if;
 select * into last_run from private.ai_runs where session_id=s.id and job='fold_read_back' and not deleted order by created_at desc limit 1;
 select * into latest from private.overnight_publications where engagement_id=p_engagement and withdrawn_at is null order by n desc limit 1;
 if it.decision_id is not null then select * into d from private.decisions where id=it.decision_id and not deleted; end if;
 if v.id is not null then
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'text',x.text,'at',x.updated_at) order by x.updated_at desc,x.id),'[]'::jsonb) into changes
   from public.submissions x where x.session_id=s.id and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'version'=v.id::text and x.value->>'response'='change';
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'text',x.text,'at',x.updated_at,'version',(select y.version from private.read_back_versions y where y.id::text=x.value->>'version')) order by x.updated_at desc,x.id),'[]'::jsonb) into missing
   from public.submissions x where x.session_id=s.id and x.engagement_id=p_engagement and not x.deleted and not x.withdrawn and not x.hidden and x.value->>'response'='missing'
    and x.value->>'version' in (select y.id::text from private.read_back_versions y where y.item_id=it.id and not y.deleted);
 end if;
 ai_state:=case when not private.ai_on(s.id) then 'off' when run.job='fold_read_back' then 'folding'
  when exists(select 1 from private.read_back_corrections c where c.session_id=s.id and c.state='folding' and not c.deleted) then 'waiting' else 'idle' end;
 return jsonb_build_object('status','ok','session',s.id,'version',r.version,'room',private.results_read_back(p_engagement,s.id,array[]::text[]),
  'items',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'label',case when x.kind='lens' then coalesce(nullif(btrim(e.lens_names[x.lens]),''),'Lens '||x.lens) else x.heading end,
      'state',case when x.state='settled' then 'settled' when x.id=it.id then 'now' else 'later' end,'versions',(select count(*) from private.read_back_versions y where y.item_id=x.id and not y.deleted),
      'queued',(select count(*) from private.read_back_corrections c where c.item_id=x.id and not c.deleted and c.state in ('queued','folding','failed'))) order by x.position,x.created_at,x.id)
    from private.read_back_items x where x.session_id=s.id and not x.deleted),'[]'::jsonb),
  'item',case when it.id is not null and v.id is not null then jsonb_build_object('id',it.id,'kind',it.kind,'heading',private.rb_heading(it.id),'settled',it.state='settled','version_id',v.id,'version',v.version,'author',v.author,
     'lines',private.rb_lines(v.id,it.state<>'settled',true),
     'decision',case when d.id is not null then jsonb_build_object('id',d.id,'decision',d.decision,'reasons',d.reasons,'at',d.marked_at) end,
     'landed',it.landed_version_id is not null,
     'versions',coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'version',y.version,'author',y.author,'note',y.note,'tracked',y.tracked,'undone',y.undone_at is not null,'current',y.id=it.current_version_id,
        'settled',y.id=it.settled_version_id,'at',y.created_at,'wording',c.wording,'reason',c.reason,
        'lines',(select jsonb_agg(l.text order by l.position) from private.read_back_lines l where l.version_id=y.id and not l.deleted)) order by y.version desc)
       from private.read_back_versions y left join private.read_back_corrections c on c.id=y.correction_id where y.item_id=it.id and not y.deleted),'[]'::jsonb)) end,
  'changes',changes,'missing',missing,
  'corrections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'state',c.state,'failure',c.failure,'wording',c.wording,'reason',c.reason,'source',c.source,'new_line',c.new_line,
      'line_id',case when c.line_id is not null and v.id is not null then private.rb_line_in(c.line_id,v.id) end,
      'by',case when c.source='scribe' then 'Scribe' else (select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=c.by_user) end,
      'at',c.created_at,'current_version',c.version_id=it.current_version_id) order by (c.state in ('queued','folding','failed')) desc,c.created_at desc,c.id)
    from private.read_back_corrections c where c.item_id=it.id and not c.deleted),'[]'::jsonb),
  'ai',jsonb_build_object('on',private.ai_on(s.id),'engagement',coalesce(e.settings->>'ai_enabled','false')='true','state',ai_state,
    'running_ms',case when run.id is not null then (extract(epoch from t-run.created_at)*1000)::integer end,'last_ms',a.last_ms,
    'failing',a.last_failed_at is not null and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at),
    'last_run',case when last_run.id is not null then jsonb_build_object('id',last_run.id,'status',last_run.status,'changed',last_run.changed,'undone',last_run.undone_at is not null,'at',last_run.created_at) end),
  'published',jsonb_build_object('loaded',b.pub_n,'latest',latest.n,'any',latest.id is not null,'newer',latest.id is not null and latest.n is distinct from b.pub_n),
  'not_signed',coalesce((select jsonb_agg(coalesce(nullif(btrim(e.lens_names[g.n]),''),'Lens '||g.n) order by g.n) from generate_series(1,5) g(n)
    where not exists(select 1 from private.read_back_items x where x.session_id=s.id and x.kind='lens' and x.lens=g.n and not x.deleted)),'[]'::jsonb));
end $$;

-- ---------- The facilitator's presses ----------
-- show:     the item the room is on: next, previous or an item id.
-- reload:   read the signed-off summaries and the latest publication again. An item nobody has touched is refreshed; a touched one is kept.
-- correct:  write a correction into the queue (a line id, "new" or none, the wording, the reason).
-- accept:   fold a correction in, with the line, wording or reason changed if given (this is Edit). Naming a line folds in code; naming none
--           goes to the AI, and with the AI off it asks for a line.
-- dismiss:  drop a correction. undo: take the last fold back. decide / undecide: Mark a decision for the item (the facilitator's call, never a count).
-- ai_on, ai_off: the AI switch.
create function private.read_back_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; b private.read_back_boards; it private.read_back_items; cv private.read_back_versions; c private.read_back_corrections; me uuid:=private.clearway_user_id(); done private.room_controls;
 logged text; t timestamptz:=clock_timestamp(); who text; before boolean; marked jsonb; word text; why text; changed boolean:=true; target uuid; res jsonb; w text; reas text; ln uuid; nl boolean; spec text; v1 uuid; edited boolean;
 sm private.lens_summaries; txts text[]; srcs jsonb; vid uuid; prev uuid; fold text:=null;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or jsonb_typeof(p) is distinct from 'object'
  or p_action not in ('show','reload','correct','accept','dismiss','undo','decide','undecide','ai_on','ai_off') then return jsonb_build_object('status','invalid_request'); end if;
 logged:=case p_action when 'show' then 'rb_show' when 'reload' then 'rb_reload' when 'correct' then 'rb_correct' when 'accept' then 'rb_accept' when 'dismiss' then 'rb_dismiss'
  when 'undo' then 'rb_undo' when 'ai_on' then 'turn_ai_on' when 'ai_off' then 'turn_ai_off' when 'decide' then 'mark_decision' when 'undecide' then 'rb_undecide' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id=p_engagement and done.action=logged then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted and interaction='read_back';
 if s.id is null or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','invalid_state'); end if;
 select * into b from private.read_back_boards where session_id=s.id and not deleted;
 if b.session_id is null then perform private.rb_load(s.id); select * into b from private.read_back_boards where session_id=s.id and not deleted; end if;
 select * into it from private.read_back_items where id=b.current_item_id and not deleted for update;
 if it.id is not null then select * into cv from private.read_back_versions where id=it.current_version_id; end if;

 if p_action='show' then
  if p->>'to'='next' then
   select x.id into target from private.read_back_items x where x.session_id=s.id and not x.deleted and it.id is not null and (x.position,x.created_at,x.id)>(it.position,it.created_at,it.id) order by x.position,x.created_at,x.id limit 1;
  elsif p->>'to'='prev' then
   select x.id into target from private.read_back_items x where x.session_id=s.id and not x.deleted and it.id is not null and (x.position,x.created_at,x.id)<(it.position,it.created_at,it.id) order by x.position desc,x.created_at desc,x.id desc limit 1;
  elsif private.rb_uuid(p->>'to') is not null then
   select x.id into target from private.read_back_items x where x.id=(p->>'to')::uuid and x.session_id=s.id and not x.deleted;
   if target is null then return jsonb_build_object('status','missing'); end if;
  else return jsonb_build_object('status','invalid_request'); end if;
  if target is null or target is not distinct from it.id then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.read_back_boards set current_item_id=target where session_id=s.id;

 elsif p_action='reload' then
  res:=private.rb_load(s.id);
  if res->>'status' is distinct from 'ok' then return res; end if;

 elsif p_action='correct' then
  res:=private.rb_add_correction(p_engagement,p_id,it.id,case when p ? 'line' and jsonb_typeof(p->'line')='string' then p->>'line' end,
   case when jsonb_typeof(p->'wording')='string' then p->>'wording' end,case when jsonb_typeof(p->'reason')='string' then p->>'reason' end,'facilitator',me,null);
  if res->>'status' is distinct from 'accepted' then return res; end if;
  changed:=false;

 elsif p_action in ('accept','dismiss') then
  if private.rb_uuid(p->>'correction') is null then return jsonb_build_object('status','invalid_request'); end if;
  select * into c from private.read_back_corrections where id=(p->>'correction')::uuid and engagement_id=p_engagement and session_id=s.id and not deleted for update;
  if c.id is null then return jsonb_build_object('status','missing'); end if;
  if p_action='dismiss' then
   if c.state not in ('queued','failed','folding') then return jsonb_build_object('status','unchanged','version',r.version); end if;
   update private.read_back_corrections set state='dismissed' where id=c.id;
   changed:=false;
  else
   if c.state not in ('queued','failed') then return jsonb_build_object('status','unchanged','version',r.version); end if;
   if it.id is distinct from c.item_id or it.state='settled' or cv.id is null then return jsonb_build_object('status','invalid_state'); end if;
   w:=c.wording; reas:=c.reason; ln:=null; nl:=c.new_line;
   if c.line_id is not null then ln:=private.rb_line_in(c.line_id,cv.id); end if;
   if p ? 'wording' then
    if jsonb_typeof(p->'wording') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
    w:=btrim(regexp_replace(p->>'wording','\s+',' ','g'));
    if length(w) not between 1 and 400 then return jsonb_build_object('status','invalid_request'); end if;
    if private.screen_text(w) then return jsonb_build_object('status','filtered'); end if;
   end if;
   if p ? 'reason' then
    if jsonb_typeof(p->'reason') is distinct from 'string' or length(btrim(p->>'reason'))>400 then return jsonb_build_object('status','invalid_request'); end if;
    reas:=btrim(p->>'reason');
   end if;
   if p ? 'line' then
    if jsonb_typeof(p->'line') not in ('string','null') then return jsonb_build_object('status','invalid_request'); end if;
    spec:=p->>'line'; nl:=false; ln:=null;
    if spec='new' then nl:=true;
    elsif spec is not null and spec<>'' then
     if private.rb_uuid(spec) is null then return jsonb_build_object('status','invalid_request'); end if;
     ln:=private.rb_line_in((spec)::uuid,cv.id);
     if ln is null then return jsonb_build_object('status','stale'); end if;
    end if;
   end if;
   if ln is null and not nl and c.line_id is not null and not (p ? 'line') then return jsonb_build_object('status','stale'); end if;
   if ln is not null or nl then
    res:=private.rb_fold_code(it.id,c.id,ln,nl,w);
    if res->>'status' is distinct from 'ok' then return res; end if;
    update private.read_back_corrections set state='folded',wording=w,reason=reas,line_id=ln,new_line=nl,failure='',result_version_id=(res->>'version')::uuid,run_id=null where id=c.id;
   else
    if not private.ai_on(s.id) then return jsonb_build_object('status','ai_off'); end if;
    update private.read_back_corrections set state='folding',wording=w,reason=reas,line_id=null,new_line=false,failure='',run_id=null where id=c.id;
    fold:='ai';
   end if;
  end if;

 elsif p_action='undo' then
  if it.id is null or cv.id is null or it.state='settled' or cv.version<=1 then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update private.read_back_versions set undone_at=t where id=cv.id;
  if cv.ai_run_id is not null then update private.ai_runs set undone_at=t,undone_by=me where id=cv.ai_run_id and undone_at is null; end if;
  select x.id into prev from private.read_back_versions x where x.item_id=it.id and x.version<cv.version and not x.deleted and x.undone_at is null order by x.version desc limit 1;
  update private.read_back_items set current_version_id=prev where id=it.id;
  update private.read_back_corrections set state='queued',result_version_id=null,run_id=null where result_version_id=cv.id and not deleted;

 elsif p_action='decide' then
  if it.id is null or cv.id is null then return jsonb_build_object('status','invalid_state'); end if;
  if it.state='settled' then return jsonb_build_object('status','decided'); end if;
  if p ? 'decision' and jsonb_typeof(p->'decision') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  if p ? 'reasons' and jsonb_typeof(p->'reasons') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  select x.id into v1 from private.read_back_versions x where x.item_id=it.id and x.version=1 and not x.deleted;
  edited:=(select array_agg(l.text order by l.position) from private.read_back_lines l where l.version_id=cv.id and not l.deleted)
    is distinct from (select array_agg(l.text order by l.position) from private.read_back_lines l where l.version_id=v1 and not l.deleted);
  word:=coalesce(nullif(btrim(regexp_replace(coalesce(p->>'decision',''),'\s+',' ','g')),''),case when edited then 'Confirmed with changes' else 'Confirmed' end);
  why:=btrim(coalesce(p->>'reasons',''));
  if length(word) not between 1 and 400 or length(why)>1000 then return jsonb_build_object('status','invalid_request'); end if;
  marked:=private.decision_mark(p_engagement,p_id,jsonb_build_object('decision',word,'reasons',why,'label',left(private.rb_heading(it.id),200),'subject','read_back','subject_id',it.id,'session',s.id));
  if marked->>'status' is distinct from 'ok' then return marked; end if;
  update private.read_back_corrections set state='dismissed' where item_id=it.id and state in ('queued','failed','folding') and not deleted;
  update private.read_back_items set state='settled',settled_version_id=cv.id where id=it.id;
  -- A lens summary changed here becomes the signed-off version, so the Map's 10-year Future reads it.
  if it.kind='lens' and edited then
   select * into sm from private.lens_summaries where engagement_id=p_engagement and lens=it.lens and not deleted for update;
   if sm.id is not null then
    select array_agg(l.text order by l.position),jsonb_agg(coalesce((select jsonb_agg(z->'id') from jsonb_array_elements(l.sources) z
        where exists(select 1 from private.lens_sentences q where q.id=(z->>'id')::uuid and q.engagement_id=p_engagement)),'[]'::jsonb) order by l.position)
     into txts,srcs from private.read_back_lines l where l.version_id=cv.id and not l.deleted;
    vid:=private.ls_new_version(sm.id,'read_back',null,'Changed in the Day 2 confirm',txts,array_fill(null::uuid,array[cardinality(txts)]),srcs,false,null,true);
    update private.lens_summaries set state='signed_off',signed_off_version_id=vid where id=sm.id;
    update private.read_back_items set landed_version_id=vid,landed_prev_id=sm.signed_off_version_id where id=it.id;
   end if;
  end if;

 elsif p_action='undecide' then
  if it.id is null or it.state<>'settled' then return jsonb_build_object('status','unchanged','version',r.version); end if;
  if it.landed_version_id is not null then
   update private.lens_summary_versions set deleted=true where id=it.landed_version_id;
   update private.lens_summaries set current_version_id=it.landed_prev_id,signed_off_version_id=it.landed_prev_id,state=case when it.landed_prev_id is null then 'empty' else 'signed_off' end
    where engagement_id=p_engagement and lens=it.lens and not deleted and signed_off_version_id=it.landed_version_id;
  end if;
  update private.read_back_items set state='open',settled_version_id=null,decision_id=null,landed_version_id=null,landed_prev_id=null where id=it.id;

 else
  if p_action='ai_on' and not exists(select 1 from public.engagements where id=p_engagement and settings->>'ai_enabled'='true') then return jsonb_build_object('status','engagement_off'); end if;
  insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
  perform 1 from private.ai_sessions where session_id=s.id for update;
  before:=private.ai_on(s.id);
  update private.ai_sessions set ai=(p_action='ai_on') where session_id=s.id;
  if before=private.ai_on(s.id) then return jsonb_build_object('status','unchanged','version',r.version); end if;
 end if;

 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 if p_action<>'decide' then
  insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,me,logged,s.id,r.version,clock_timestamp());
  select split_part(btrim(name),' ',1) into who from public.clearway_users where id=me;
  perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',logged,'by',who,'version',r.version,'changed',changed));
 end if;
 return jsonb_build_object('status','ok','version',r.version,'fold',fold);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

create function public.read_back_state(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_back_state(p_engagement) $$;
create function public.read_back_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_back_control(p_engagement,p_id,p_action,p) $$;
create function public.read_back_phone(p_engagement uuid,p_session uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_back_phone(p_engagement,p_session) $$;
create function public.read_back_scribe(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_back_scribe(p_engagement) $$;
create function public.read_back_correct(p_engagement uuid,p_id uuid,p_item uuid,p_line text,p_wording text,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$ select private.read_back_correct(p_engagement,p_id,p_item,p_line,p_wording,p_reason) $$;

-- ---------- The AI worker: claim, apply, fail ----------
alter function private.ai_claim(uuid,uuid,text,jsonb) rename to ai_claim_base5;
alter function private.ai_apply(uuid,uuid,jsonb,jsonb) rename to ai_apply_base5;
alter function private.ai_fail(uuid,uuid,text,jsonb) rename to ai_fail_base4;

-- A correction that names no line is claimed here for the AI; every other session goes to the function that was there. The room is
-- on the step, the AI is on, and the facilitator accepted a correction into "folding".
create function private.ai_claim(p_session uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.sessions; a private.ai_sessions; r public.room_states; e public.engagements; t timestamptz:=clock_timestamp(); c private.read_back_corrections; it private.read_back_items; cv private.read_back_versions; v_inputs jsonb; v_run uuid;
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or s.interaction<>'read_back' then return private.ai_claim_base5(p_session,p_lease,p_model,p_versions); end if;
 if p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if not private.ai_on(s.id) or s.state not in ('live','phones_down','open') then return jsonb_build_object('status','off'); end if;
 select * into r from public.room_states where engagement_id=s.engagement_id and not deleted for update;
 if r.live_session_id is distinct from s.id then return jsonb_build_object('status','off'); end if;
 insert into private.ai_sessions(session_id,engagement_id) values(s.id,s.engagement_id) on conflict(session_id) do nothing;
 select * into a from private.ai_sessions where session_id=s.id for update;
 if a.lease_id is not null and a.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if a.last_failed_at is not null and a.last_failed_at>t-interval '10 seconds' and (a.last_ok_at is null or a.last_failed_at>a.last_ok_at) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from a.last_failed_at+interval '10 seconds'-t)*1000)::integer); end if;
 if a.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=a.lease_run and status='running'; end if;
 if coalesce(p_versions->>'fold_read_back','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into c from private.read_back_corrections x where x.session_id=s.id and x.state='folding' and x.run_id is null and not x.deleted order by x.created_at,x.id limit 1 for update;
 if c.id is null then return jsonb_build_object('status','idle'); end if;
 select * into it from private.read_back_items where id=c.item_id and not deleted;
 select * into cv from private.read_back_versions where id=it.current_version_id and not deleted;
 select * into e from public.engagements where id=s.engagement_id;
 if it.id is null or cv.id is null or it.state='settled' then
  update private.read_back_corrections set state='dismissed' where id=c.id;
  return jsonb_build_object('status','idle');
 end if;
 v_inputs:=jsonb_build_object('job','fold','item',it.id,'correction',c.id,'version',cv.id,'kind',it.kind,'heading',private.rb_heading(it.id),
  'lens_name',case when it.kind='lens' then coalesce(nullif(btrim(e.lens_names[it.lens]),''),'Lens '||it.lens) end,
  'horizon',case when it.kind='lens' then '10-year Future' else '3-year Vision' end,'base_year',e.base_year,'year',case when it.kind='lens' then e.base_year+10 else e.base_year+3 end,
  'max_chars',420,'max_lines',8,
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('ref','l'||q.pos,'text',q.text,'sources',coalesce((select jsonb_agg(z->>'text') from jsonb_array_elements(q.sources) z),'[]'::jsonb)) order by q.pos),'[]'::jsonb)
    from (select l.text,l.sources,row_number() over(order by l.position)::integer as pos from private.read_back_lines l where l.version_id=cv.id and not l.deleted) q),
  'wording',c.wording,'reason',c.reason,
  'ids',jsonb_build_object('l',(select coalesce(jsonb_object_agg('l'||q.pos,q.id),'{}'::jsonb) from (select l.id,row_number() over(order by l.position)::integer as pos from private.read_back_lines l where l.version_id=cv.id and not l.deleted) q)));
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(s.engagement_id,s.id,'fold_read_back',p_model,p_versions->>'fold_read_back',v_inputs,t) returning id into v_run;
 update private.read_back_corrections set run_id=v_run where id=c.id;
 update private.ai_sessions set lease_id=p_lease,lease_run=v_run,lease_until=t+interval '45 seconds' where session_id=s.id;
 update public.room_states set results=private.live_results(s.engagement_id) where engagement_id=s.engagement_id;
 return jsonb_build_object('status','claimed','run',v_run,'job','fold_read_back','prompt_version',p_versions->>'fold_read_back','inputs',v_inputs);
end $$;

-- A model's line is kept only when it is clean: no quote, nothing the word filter stops, no number that is not in the words it came from.
-- A lens line must also stay in the present tense. Returns the reason it is not kept.
create function private.rb_line_problem(p_text text,p_allowed text,p_base_year integer,p_present boolean) returns text
language sql stable security invoker set search_path='' as $$
 select case when p_text is null or length(p_text) not between 1 and 400 then 'length'
  when p_present and p_text ~* '\m(will|would|shall|going to|hope to|plan to|aim to|intend to)\M' then 'future'
  when private.ai_quoted(p_text) then 'quote'
  when private.screen_text(p_text) then 'filtered'
  when not (private.ai_numbers(p_text)<@(private.ai_numbers(p_allowed)||array[p_base_year::text,(p_base_year+1)::text,(p_base_year+3)::text,(p_base_year+10)::text,'1','3','10'])) then 'number'
 end
$$;

create function private.ai_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; a private.ai_sessions; r public.room_states; s public.sessions; it private.read_back_items; cv private.read_back_versions; c private.read_back_corrections;
 t timestamptz:=clock_timestamp(); v_ms integer; ids jsonb; ref text; txt text; note text; prob text; allowed text; target uuid; texts text[]; froms uuid[]; srcs jsonb; origs text[]; i integer; vid uuid; total integer; did boolean:=false; why text:=null; discard boolean:=false;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is null or run.job<>'fold_read_back' then return private.ai_apply_base5(p_run,p_lease,p_output,p_usage); end if;
 if p_lease is null then return jsonb_build_object('status','invalid_request'); end if;
 if run.engagement_id='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(run.engagement_id::text,7)); end if;
 select * into r from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 select * into a from private.ai_sessions where session_id=run.session_id for update;
 select * into run from private.ai_runs where id=p_run;
 if run.status<>'running' or a.lease_id is distinct from p_lease or a.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into s from public.sessions where id=run.session_id;
 update private.ai_sessions set lease_id=null,lease_run=null,lease_until=null,last_ok_at=t,last_ms=v_ms where session_id=run.session_id;
 if jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>131072 then p_output:='{}'::jsonb; end if;
 ids:=run.inputs->'ids';
 select * into c from private.read_back_corrections where id=(run.inputs->>'correction')::uuid and engagement_id=run.engagement_id for update;
 select * into it from private.read_back_items where id=(run.inputs->>'item')::uuid and engagement_id=run.engagement_id and not deleted for update;
 select * into cv from private.read_back_versions where id=it.current_version_id and not deleted;
 -- The work is dropped when it is no longer wanted or no longer fits what is on the screen.
 if not private.ai_on(run.session_id) or s.deleted or c.id is null or c.state<>'folding' or c.run_id is distinct from run.id or it.id is null or it.state='settled' then discard:=true;
 elsif cv.id is null or cv.id::text is distinct from run.inputs->>'version' then
  update private.read_back_corrections set state='queued',run_id=null where id=c.id;
  discard:=true;
 end if;
 if discard then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms,input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,
   output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
  if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
  return jsonb_build_object('status','discarded');
 end if;
 note:=btrim(regexp_replace(coalesce(case when jsonb_typeof(p_output->'note') ='string' then p_output->>'note' end,''),'\s+',' ','g'));
 if length(note)>300 or private.ai_quoted(note) or private.screen_text(note) then note:=''; end if;
 ref:=case when jsonb_typeof(p_output->'line')='string' then p_output->>'line' end;
 txt:=btrim(regexp_replace(coalesce(case when jsonb_typeof(p_output->'text')='string' then p_output->>'text' end,''),'\s+',' ','g'));
 select coalesce(array_agg(l.text order by l.position),array[]::text[]),coalesce(array_agg(l.id order by l.position),array[]::uuid[]),coalesce(jsonb_agg(l.sources order by l.position),'[]'::jsonb),coalesce(array_agg(l.origin order by l.position),array[]::text[])
  into texts,froms,srcs,origs from private.read_back_lines l where l.version_id=cv.id and not l.deleted;
 -- One line changed or added; every other line stays word for word.
 if ref is null or txt='' then why:='no_line';
 elsif ref='new' then
  allowed:=c.wording;
  if cardinality(texts)>=8 then why:='too_many'; end if;
 else
  target:=private.rb_uuid(ids->'l'->>ref);
  i:=array_position(froms,target);
  if target is null or i is null then why:='no_line'; end if;
  allowed:=c.wording||' '||coalesce(texts[i],'')||' '||coalesce((select string_agg(z->>'text',' ') from jsonb_array_elements(srcs->(i-1)) z),'');
 end if;
 if why is null then
  prob:=private.rb_line_problem(txt,allowed,(run.inputs->>'base_year')::integer,it.kind='lens');
  if prob is not null then why:=prob; end if;
 end if;
 if why is null then
  if ref='new' then
   texts:=array_append(texts,txt); froms:=array_append(froms,null::uuid); srcs:=srcs||jsonb_build_array('[]'::jsonb); origs:=array_append(origs,'correction');
  elsif texts[i]=txt then why:='unchanged';
  else texts[i]:=txt; origs[i]:='correction'; end if;
 end if;
 if why is null then
  -- The room's own limit is one screen. A fold may not make the item longer than it was, unless it still fits 420 characters.
  select sum(length(x))+count(*)-1 into total from unnest(texts) x;
  if total>greatest(420,(select sum(length(l.text))+count(*)-1 from private.read_back_lines l where l.version_id=cv.id and not l.deleted)) then why:='too_long'; end if;
 end if;
 if why is null then
  vid:=private.rb_new_version(it.id,'ai',run.id,note,c.id,texts,froms,srcs,origs,true,cv.id);
  update private.read_back_corrections set state='folded',result_version_id=vid,failure='' where id=c.id;
  did:=true;
 else
  update private.read_back_corrections set state='failed',failure=left(why,40),run_id=null where id=c.id;
 end if;
 update private.ai_runs set status='ok',changed=did,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',case when did then jsonb_build_array(jsonb_build_object('version',vid)) else '[]'::jsonb end,
   'refused',case when did then '[]'::jsonb else jsonb_build_array(jsonb_build_object('reason',why)) end),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,
  cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 if r.live_session_id=run.session_id then update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id; end if;
 perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','scribe','what','correction'));
 return jsonb_build_object('status','ok','changed',did,'applied',case when did then 1 else 0 end,'refused',case when did then 0 else 1 end);
end $$;

-- A failed fold goes back to the facilitator: the correction is marked failed and the AI is no longer "working".
create function private.ai_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; res jsonb;
begin
 select * into run from private.ai_runs where id=p_run;
 if run.id is not null and run.job='fold_read_back' then
  perform 1 from public.room_states where engagement_id=run.engagement_id and not deleted for update;
 end if;
 res:=private.ai_fail_base4(p_run,p_lease,p_error,p_usage);
 if run.id is not null and run.job='fold_read_back' and res->>'status'='ok' then
  update private.read_back_corrections set state='failed',failure='ai_failed',run_id=null where run_id=run.id and state='folding';
  update public.room_states set results=private.live_results(run.engagement_id) where engagement_id=run.engagement_id and live_session_id=run.session_id;
  perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','scribe','what','correction'));
 end if;
 return res;
end $$;

-- ---------- Shared objects, each a superset of its latest definition ----------
-- Mark a decision: the subject read_back is added; every earlier subject, check and effect is as it was.
create or replace function private.decision_mark(p_engagement uuid,p_id uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; sid uuid; subj text; subj_id uuid; label text; what text; why text; counts jsonb:='{}'::jsonb; ok boolean:=true;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.room_controls where id=p_id) then
  if exists(select 1 from private.decisions where id=p_id and engagement_id=p_engagement) then return jsonb_build_object('status','duplicate','id',p_id,'version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 what:=btrim(regexp_replace(coalesce(p->>'decision',''),'\s+',' ','g'));
 why:=btrim(coalesce(p->>'reasons',''));
 label:=btrim(coalesce(p->>'label',''));
 subj:=coalesce(nullif(p->>'subject',''),'step');
 if length(what) not between 1 and 400 or length(why)>1000 or length(label)>200
  or subj not in ('step','lens_summary','outcome','candidate','cut_line','goal','intent','read_back','other')
  or (p ? 'subject_id' and p->>'subject_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  or (p ? 'session' and p->>'session' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
 sid:=coalesce((p->>'session')::uuid,r.live_session_id);
 subj_id:=case when p ? 'subject_id' then (p->>'subject_id')::uuid when subj='step' then sid end;
 if sid is not null and not exists(select 1 from public.sessions where id=sid and engagement_id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
 if subj_id is not null then
  ok:=case subj
   when 'step' then exists(select 1 from public.sessions where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'lens_summary' then exists(select 1 from private.lens_summaries where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'outcome' then exists(select 1 from private.vision_outcomes where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'goal' then exists(select 1 from private.goals where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'intent' then exists(select 1 from private.intent_cards where id=subj_id and engagement_id=p_engagement and not deleted)
   when 'read_back' then exists(select 1 from private.read_back_items where id=subj_id and engagement_id=p_engagement and not deleted)
   else true end;
  if not ok then return jsonb_build_object('status','missing'); end if;
 end if;
 -- The numbers on screen when it was marked, kept as a record and never as the decision.
 if r.live_session_id is not null then counts:=jsonb_build_object('total',coalesce((r.results->>'total')::integer,0),'people',coalesce((r.results->>'people')::integer,0)); end if;
 insert into private.decisions(id,engagement_id,session_id,subject,subject_id,subject_label,decision,reasons,counts,marked_by)
  values(p_id,p_engagement,sid,subj,subj_id,label,what,why,counts,private.clearway_user_id());
 if subj='lens_summary' and subj_id is not null then update private.lens_summaries set decision_id=p_id where id=subj_id; end if;
 if subj='outcome' and subj_id is not null then update private.vision_outcomes set decision_id=p_id where id=subj_id; end if;
 if subj='read_back' and subj_id is not null then update private.read_back_items set decision_id=p_id where id=subj_id; end if;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at)
  values(p_id,p_engagement,private.clearway_user_id(),'mark_decision',sid,r.version,clock_timestamp());
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','mark_decision',
  'by',(select split_part(btrim(u.name),' ',1) from public.clearway_users u where u.id=private.clearway_user_id()),'version',r.version,'changed',false));
 return jsonb_build_object('status','ok','id',p_id,'version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- The Map: an outcome's 3-year Vision bullets read the read-back's settled version first, then the latest overnight publication, then the room's bullets.
create or replace function private.map_assemble(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.engagements; c public.churches; defaults text[]:=array['Congregation','Community','Leadership','Operations','Learning'];
 lenses jsonb; outcomes jsonb; vals jsonb; rhythms jsonb; goals_met jsonb; season_goals jsonb; metrics jsonb; celebs jsonb; issues jsonb;
 first_end date; this_end date; unmet integer; season_label text;
begin
 select * into e from public.engagements where id=p_engagement and not deleted;
 if not found then return null; end if;
 select * into c from public.churches where id=e.church_id;

 select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('lens',g.n,'name',coalesce(nullif(btrim(e.lens_names[g.n]),''),defaults[g.n]),
   'state',case when ls.signed_off_version_id is not null then 'signed_off' else 'not_signed_off' end,
   'version',v.version,
   'lines',case when ls.signed_off_version_id is not null then coalesce((select jsonb_agg(s.text order by s.position) from private.lens_summary_sentences s
      where s.version_id=ls.signed_off_version_id and s.engagement_id=p_engagement and not s.deleted),'[]'::jsonb) else '[]'::jsonb end,
   'why',case when ls.signed_off_version_id is null then 'Not signed off yet' end)) order by g.n) into lenses
 from generate_series(1,5) g(n)
  left join private.lens_summaries ls on ls.engagement_id=p_engagement and ls.lens=g.n and not ls.deleted
  left join private.lens_summary_versions v on v.id=ls.signed_off_version_id and v.engagement_id=ls.engagement_id and not v.deleted;

 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',o.id,'n',o.rn,'title',o.title,'description',nullif(o.description,''),'status',o.status,'stop',nullif(o.what_we_stop,''),
   'indicators',coalesce(
     -- The 3-year Vision bullets the room settled in the Day 2 confirm, else the latest overnight publication, else the room's own bullets.
     (select jsonb_agg(l.text order by l.position) from private.read_back_items ri join private.read_back_lines l on l.version_id=ri.settled_version_id and l.engagement_id=ri.engagement_id and not l.deleted
       where ri.engagement_id=o.engagement_id and ri.kind='outcome' and ri.outcome_id=o.id and ri.state='settled' and not ri.deleted and length(btrim(l.text))>0),
     (select jsonb_agg(b.value->>'text' order by oo.ordinality,b.ordinality) from (select pp.snapshot from private.overnight_publications pp where pp.engagement_id=o.engagement_id and pp.withdrawn_at is null order by pp.n desc limit 1) lp
       cross join lateral jsonb_array_elements(case when jsonb_typeof(lp.snapshot->'outcomes')='array' then lp.snapshot->'outcomes' else '[]'::jsonb end) with ordinality oo(value,ordinality)
       cross join lateral jsonb_array_elements(case when jsonb_typeof(oo.value->'bullets')='array' then oo.value->'bullets' else '[]'::jsonb end) with ordinality b(value,ordinality)
       where oo.value->>'outcome_id'=o.id::text and jsonb_typeof(b.value->'text')='string' and length(btrim(b.value->>'text'))>0),
     (select jsonb_agg(i.text order by i.position,i.created_at,i.id) from private.outcome_indicators i
      where i.outcome_id=o.id and i.engagement_id=o.engagement_id and not i.deleted and length(btrim(i.text))>0),'[]'::jsonb))) order by o.rn),'[]'::jsonb) into outcomes
 from (select x.*,row_number() over(order by x.position,x.id) as rn from private.vision_outcomes x where x.engagement_id=p_engagement and not x.deleted) o;

 select coalesce(jsonb_agg(btrim(x.v #>> '{}')),'[]'::jsonb) into vals from jsonb_array_elements(c."values") x(v) where jsonb_typeof(x.v)='string' and length(btrim(x.v #>> '{}'))>0;
 select coalesce(jsonb_agg(btrim(x.v #>> '{}')),'[]'::jsonb) into rhythms from jsonb_array_elements(c.leadership_rhythms) x(v) where jsonb_typeof(x.v)='string' and length(btrim(x.v #>> '{}'))>0;

 -- Only goals that meet all four CORE letters. The rest are counted, not shown.
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',x.id,'title',x.title,'result',x.result,'outcome',x.otitle,'outcome_n',x.orn,'owner',x.owner,'end_date',x.end_date,'season',x.season,
   'risks',x.risks)) order by x.orn,x.position,x.id),'[]'::jsonb),min(x.end_date) into goals_met,first_end
 from (select g.id,g.title,g.result,g.end_date,g.season,g.position,o.title as otitle,o.rn as orn,coalesce(a.name,g.owner_name) as owner,
    (select jsonb_agg(r.text order by r.created_at,r.id) from private.goal_risks gr join private.risks r on r.id=gr.risk_id and r.engagement_id=gr.engagement_id
      where gr.goal_id=g.id and gr.engagement_id=g.engagement_id and not gr.deleted and not r.deleted) as risks
   from private.goals g
    join (select y.id,y.engagement_id,y.title,row_number() over(order by y.position,y.id) as rn from private.vision_outcomes y where y.engagement_id=p_engagement and not y.deleted) o on o.id=g.outcome_id and o.engagement_id=g.engagement_id
    left join public.attendees a on a.id=g.owner_attendee_id and a.engagement_id=g.engagement_id
   where g.engagement_id=p_engagement and not g.deleted and (private.goal_core(g.id)->>'met')::boolean) x;
 select count(*)::integer into unmet from private.goals g where g.engagement_id=p_engagement and not g.deleted and not coalesce((private.goal_core(g.id)->>'met')::boolean,false);

 -- This season is the first season any goal ends in.
 if first_end is not null then
  this_end:=private.season_end(first_end);
  season_label:=case private.season_of(first_end) when 'SEP_DEC' then 'Sept to Dec' when 'JAN_APR' then 'Jan to Apr' else 'May to Aug' end||' '||extract(year from this_end)::integer;
  select coalesce(jsonb_agg(x.v),'[]'::jsonb) into season_goals from jsonb_array_elements(goals_met) x(v) where (x.v->>'end_date')::date<=this_end;
 else season_goals:='[]'::jsonb; end if;

 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('text',m.text,'rank',m.rank)) order by m.rank nulls last,m.created_at,m.id),'[]'::jsonb) into metrics
 from (select * from private.key_metrics k where k.engagement_id=p_engagement and not k.deleted order by k.rank nulls last,k.created_at,k.id limit 8) m;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('text',m.text,'theme',nullif(m.theme,''))) order by m.created_at,m.id),'[]'::jsonb) into celebs
 from (select * from private.celebrations k where k.engagement_id=p_engagement and not k.deleted order by k.created_at,k.id limit 12) m;

 -- Key Issues: the pre-mortem risks (most likely and most damaging first) with their mitigations, then the
 -- scribe's tensions and questions. The speaker on a scribe card is never read.
 select coalesce(jsonb_agg(u.item order by u.ord,u.sub desc,u.tie),'[]'::jsonb) into issues from (
  (select 1 as ord,(coalesce(r.likelihood,0)*coalesce(r.impact,0))::numeric as sub,r.id as tie,
    jsonb_strip_nulls(jsonb_build_object('kind','risk','text',r.text,'mitigations',(select jsonb_agg(m.text order by m.created_at,m.id) from private.risk_mitigations m
      where m.risk_id=r.id and m.engagement_id=r.engagement_id and not m.deleted))) as item
   from private.risks r where r.engagement_id=p_engagement and not r.deleted and r.merged_into is null order by 2 desc,r.id limit 6)
  union all
  (select 2,-(sc.seq)::numeric,sc.id,jsonb_build_object('kind',sc.kind,'text',sc.text)
   from private.scribe_cards sc where sc.engagement_id=p_engagement and not sc.deleted and sc.kind in ('tension','question') order by sc.seq limit 12)
 ) u;

 return jsonb_build_object('church',c.name,'title',e.title,
  'years',jsonb_build_object('base',e.base_year,'future',e.base_year+10,'vision',e.base_year+3,'outlook',e.base_year+1),
  'page1',jsonb_build_object(
   'mission',jsonb_strip_nulls(jsonb_build_object('text',btrim(c.mission),'empty',btrim(c.mission)='','why',case when btrim(c.mission)='' then 'Add it in setup' end)),
   'purpose',jsonb_strip_nulls(jsonb_build_object('text',btrim(c.purpose),'empty',btrim(c.purpose)='','why',case when btrim(c.purpose)='' then 'Add it in setup, from the Kingdom Assignment' end)),
   'values',jsonb_strip_nulls(jsonb_build_object('items',vals,'empty',jsonb_array_length(vals)=0,'why',case when jsonb_array_length(vals)=0 then 'Add them in setup' end)),
   'strategy',jsonb_strip_nulls(jsonb_build_object('text',btrim(c.strategy),'empty',btrim(c.strategy)='','why',case when btrim(c.strategy)='' then 'Add it in setup' end)),
   'future',jsonb_build_object('year',e.base_year+10,'lenses',lenses),
   'vision',jsonb_strip_nulls(jsonb_build_object('year',e.base_year+3,'outcomes',outcomes,'empty',jsonb_array_length(outcomes)=0,'why',case when jsonb_array_length(outcomes)=0 then 'No Vision Outcomes yet' end))),
  'page2',jsonb_build_object(
   'priorities',jsonb_build_object('empty',true,'why','Left for the church''s Annual Planning'),
   'outlook',jsonb_strip_nulls(jsonb_build_object('year',e.base_year+1,'goals',goals_met,'empty',jsonb_array_length(goals_met)=0,'why',case when jsonb_array_length(goals_met)=0 then 'No goal meets CORE yet' end,
     'unmet',unmet,'metrics',jsonb_strip_nulls(jsonb_build_object('items',metrics,'empty',jsonb_array_length(metrics)=0,'why',case when jsonb_array_length(metrics)=0 then 'No success measures yet' end)),
     'celebrations',jsonb_strip_nulls(jsonb_build_object('items',celebs,'empty',jsonb_array_length(celebs)=0,'why',case when jsonb_array_length(celebs)=0 then 'No celebrations yet' end)))),
   'season',jsonb_strip_nulls(jsonb_build_object('label',season_label,'goals',season_goals,'empty',jsonb_array_length(season_goals)=0,'why',case when jsonb_array_length(season_goals)=0 then 'No goal meets CORE yet' end)),
   'rhythms',jsonb_strip_nulls(jsonb_build_object('items',rhythms,'empty',jsonb_array_length(rhythms)=0,'why',case when jsonb_array_length(rhythms)=0 then 'Add them in setup' end)),
   'issues',jsonb_strip_nulls(jsonb_build_object('items',issues,'empty',jsonb_array_length(issues)=0,'why',case when jsonb_array_length(issues)=0 then 'No risks, tensions or questions yet' end))));
end $$;

-- Practice reset, Clear test answers and the control status: the newest definitions (What We Heard's wrappers over the earlier ones),
-- renamed to _base5 and wrapped, so every table and count they have stays. This step's tables are cleared after.
alter function private.reset_practice_room() rename to reset_practice_room_base5;
alter function private.rehearsal_control(uuid,uuid,text) rename to rehearsal_control_base5;

create function private.reset_practice_room() returns boolean
language plpgsql security definer set search_path='' as $$
declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; ok boolean;
begin
 ok:=private.reset_practice_room_base5();
 if ok then
  update private.read_back_corrections set deleted=true where engagement_id=eng and not deleted;
  update private.read_back_lines set deleted=true where engagement_id=eng and not deleted;
  update private.read_back_versions set deleted=true where engagement_id=eng and not deleted;
  update private.read_back_items set deleted=true,state='open',current_version_id=null,settled_version_id=null,decision_id=null,landed_version_id=null,landed_prev_id=null where engagement_id=eng and not deleted;
  update private.read_back_boards set deleted=true,current_item_id=null where engagement_id=eng and not deleted;
 end if;
 return ok;
end $$;

-- Clear test answers also clears the test corrections and items. A lens summary the rehearsal changed stays as it was signed off.
create function private.rehearsal_control(p_engagement uuid,p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare out jsonb;
begin
 out:=private.rehearsal_control_base5(p_engagement,p_id,p_action);
 if p_action='clear' and p_engagement is not null and out->>'status'='ok' then
  update private.read_back_corrections set deleted=true where engagement_id=p_engagement and test and not deleted;
  update private.read_back_lines set deleted=true where version_id in (select v.id from private.read_back_versions v join private.read_back_items i on i.id=v.item_id and i.engagement_id=v.engagement_id
    where i.engagement_id=p_engagement and i.test) and not deleted;
  update private.read_back_versions set deleted=true where item_id in (select i.id from private.read_back_items i where i.engagement_id=p_engagement and i.test) and not deleted;
  update private.read_back_items set deleted=true,state='open',current_version_id=null,settled_version_id=null,decision_id=null,landed_version_id=null,landed_prev_id=null where engagement_id=p_engagement and test and not deleted;
  update private.read_back_boards set deleted=true,current_item_id=null where engagement_id=p_engagement and test and not deleted;
 end if;
 return out;
end $$;

-- The rehearsal count on the control surface includes this step's test corrections and settled items; nothing else in control_status changes.
do $patch$
declare def text; patched text;
begin
 def:=pg_get_functiondef('private.control_status(uuid)'::regprocedure);
 patched:=replace(def,'+(select count(*) from private.scribe_files y where y.engagement_id=p_engagement and y.test and not y.deleted)',
  '+(select count(*) from private.scribe_files y where y.engagement_id=p_engagement and y.test and not y.deleted)'||chr(10)||
  '     +(select count(*) from private.read_back_corrections y where y.engagement_id=p_engagement and y.test and not y.deleted)'||chr(10)||
  '     +(select count(*) from private.read_back_items y where y.engagement_id=p_engagement and y.test and y.state=''settled'' and not y.deleted)');
 if patched=def then raise exception 'The rehearsal count in control_status did not patch cleanly'; end if;
 execute patched;
end $patch$;

-- ---------- Templates ----------
-- The "Confirm the 10-year Future" placeholder in both Wayfinding templates becomes the read-back step. Existing engagements are
-- unchanged: they were copied from the template when they were made.
update private.templates t set sessions=(
 select jsonb_agg(case when x.e->>'title'='Confirm the 10-year Future' and x.e->>'interaction'='content' then x.e || jsonb_build_object(
   'title','Confirm the 10-year Future and outcomes','interaction','read_back','planned_minutes',30,
   'prompt','Did we hear you right?',
   'phone_depth','Read it. Tap Yes, that''s us or It needs a change. Tell us what is missing.',
   'lands_in','The 10-year Future',
   'options',jsonb_build_object('ai',true),
   'max_sends',60,'max_characters',280,'max_words',50,
   'notes','A short confirm after prayer. The TV reads each signed-off lens summary in turn, then each reviewed outcome from the overnight draft. Ask: did we hear you right? Phones answer Yes, that''s us or It needs a change, and can add what is missing. The scribe writes any agreed change and the reason into the correction composer; the facilitator accepts it and it folds in as a tracked change. Mark a decision when the room agrees, then go to the next item. The tally never decides. If the overnight drafts are not published yet, only the lens summaries load; publish them and press Reload items.')
  else x.e end order by x.ord)
 from jsonb_array_elements(t.sessions) with ordinality x(e,ord))
 where t.id in ('c1ea0000-0000-4000-8000-000000000002','c1ea0000-0000-4000-8000-000000000003') and exists(select 1 from jsonb_array_elements(t.sessions) y(e) where y.e->>'title'='Confirm the 10-year Future' and y.e->>'interaction'='content');

-- ---------- Grants ----------
revoke all on function private.rb_uuid(text),private.rb_marks(text,text),private.rb_changes(uuid,uuid),
 private.rb_new_version(uuid,text,uuid,text,uuid,text[],uuid[],jsonb,text[],boolean,uuid),private.rb_line_in(uuid,uuid),private.rb_touched(uuid),
 private.rb_put_item(uuid,text,smallint,uuid,text,integer,text[],jsonb),private.rb_load(uuid),private.rb_on_air(),private.options_read_back(jsonb,uuid),
 private.parse_read_back(public.sessions,text,jsonb),private.rb_mirror(),private.rb_lines(uuid,boolean,boolean),private.rb_heading(uuid),
 private.results_read_back(uuid,uuid,text[]),private.items_read_back(uuid,text[]),private.read_back_phone(uuid,uuid),private.read_back_scribe(uuid),
 private.rb_add_correction(uuid,uuid,uuid,text,text,text,text,uuid,uuid),private.read_back_correct(uuid,uuid,uuid,text,text,text),
 private.rb_fold_code(uuid,uuid,uuid,boolean,text),private.read_back_state(uuid),private.read_back_control(uuid,uuid,text,jsonb),
 private.rb_line_problem(text,text,integer,boolean),
 public.read_back_state(uuid),public.read_back_control(uuid,uuid,text,jsonb),public.read_back_phone(uuid,uuid),public.read_back_scribe(uuid),
 public.read_back_correct(uuid,uuid,uuid,text,text,text),
 private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),
 private.ai_claim_base5(uuid,uuid,text,jsonb),private.ai_apply_base5(uuid,uuid,jsonb,jsonb),private.ai_fail_base4(uuid,uuid,text,jsonb),
 private.reset_practice_room_base5(),private.reset_practice_room(),private.rehearsal_control_base5(uuid,uuid,text),private.rehearsal_control(uuid,uuid,text)
 from public,anon,authenticated;
-- The engine finds options, parse, results and items by name; the wrappers call the private functions as the signed-in caller.
grant execute on function private.read_back_state(uuid),private.read_back_control(uuid,uuid,text,jsonb),private.read_back_phone(uuid,uuid),private.read_back_scribe(uuid),
 private.read_back_correct(uuid,uuid,uuid,text,text,text),
 public.read_back_state(uuid),public.read_back_control(uuid,uuid,text,jsonb),public.read_back_phone(uuid,uuid),public.read_back_scribe(uuid),
 public.read_back_correct(uuid,uuid,uuid,text,text,text) to authenticated;
-- The worker's claim, apply and fail keep their grants (service role); the renamed originals are for the wrappers.
grant execute on function private.ai_claim(uuid,uuid,text,jsonb),private.ai_apply(uuid,uuid,jsonb,jsonb),private.ai_fail(uuid,uuid,text,jsonb),
 private.ai_claim_base5(uuid,uuid,text,jsonb),private.ai_apply_base5(uuid,uuid,jsonb,jsonb),private.ai_fail_base4(uuid,uuid,text,jsonb) to service_role;
grant execute on function private.reset_practice_room(),private.rehearsal_control(uuid,uuid,text) to authenticated;
commit;
