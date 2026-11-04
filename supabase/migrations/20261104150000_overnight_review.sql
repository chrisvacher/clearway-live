-- Milestone 5, step 2: the overnight drafts and their review (OVN-01, OVN-02, OVN-03).
--
-- When Day 1 closes, AI tidies each provisional Vision Outcome and its 3-year Vision bullets from the
-- room's bullets (phone input), the scribe's cards and the easel photos, links every drafted sentence to
-- its sources, flags thin outcomes and keeps the voices not to lose and the tensions the room named
-- apart. The 10-year Future is not drafted here: the room signed the lens summaries off on Day 1.
--
-- Nothing here reaches the TV or any phone. Every table is private with forced row-level security and no
-- direct policy; facilitators of the engagement reach them only through the functions below, and the
-- server's worker (service role) through the claim, apply and fail functions. Publishing writes a
-- snapshot for step 3's read-back to read (private.overnight_published). The speaker on a scribe card
-- stays in private.scribe_cards and is returned only by scribe_speakers to facilitators.
--
-- Shared records touched, in the smallest way:
--  * private.ai_runs: session_id may be empty for the overnight job (it belongs to the engagement, not a
--    step) and the job list gains 'overnight_draft'. Every run keeps its model, prompt version, inputs,
--    output, tokens, cost and time in the same log.
--  * Two triggers: Day 1 closing opens the round; a deleted Vision Outcome leaves the review.
begin;

alter table private.ai_runs alter column session_id drop not null;
alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','overnight_draft'));
alter table private.ai_runs add constraint ai_runs_session_check check(session_id is not null or job='overnight_draft');

-- ---------- Tables ----------
-- One round of overnight drafting per engagement.
create table private.overnight_rounds (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 status text not null default 'pending' check(status in ('pending','drafting','ready','failed','ai_off')),
 day_closed_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 100),
 lease_id uuid,
 lease_run uuid,
 lease_until timestamptz,
 last_failed_at timestamptz,
 last_error text check(last_error is null or length(last_error)<=200),
 inputs jsonb not null default '{}' check(jsonb_typeof(inputs)='object' and pg_column_size(inputs)<=4096),
 unreadable uuid[] not null default array[]::uuid[],
 published_at timestamptz,
 published_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 check((published_at is null)=(published_by is null))
);
create unique index overnight_rounds_engagement_idx on private.overnight_rounds(engagement_id) where not deleted;
create index overnight_rounds_published_by_idx on private.overnight_rounds(published_by);

-- One draft per provisional Vision Outcome.
create table private.draft_outcomes (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 round_id uuid not null,
 outcome_id uuid not null,
 position integer not null default 0 check(position>=0),
 name text not null check(length(btrim(name)) between 1 and 200),
 original_name text not null check(length(btrim(original_name)) between 1 and 200),
 description text not null default '' check(length(description)<=200),
 tidy text not null default 'waiting' check(tidy in ('waiting','tidied','by_hand')),
 thin_ack_by uuid references public.clearway_users(id),
 thin_ack_at timestamptz,
 reviewed_by uuid references public.clearway_users(id),
 reviewed_at timestamptz,
 unreadable uuid[] not null default array[]::uuid[],
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(round_id,engagement_id) references private.overnight_rounds(id,engagement_id),
 foreign key(outcome_id,engagement_id) references private.vision_outcomes(id,engagement_id),
 check((reviewed_by is null)=(reviewed_at is null)),
 check((thin_ack_by is null)=(thin_ack_at is null))
);
create unique index draft_outcomes_round_idx on private.draft_outcomes(round_id,outcome_id) where not deleted;
create index draft_outcomes_engagement_idx on private.draft_outcomes(engagement_id,position);
create index draft_outcomes_outcome_idx on private.draft_outcomes(outcome_id,engagement_id);
create index draft_outcomes_reviewed_idx on private.draft_outcomes(reviewed_by);
create index draft_outcomes_ack_idx on private.draft_outcomes(thin_ack_by);

-- A bullet of the 3-year Vision in the draft: the wording now, the AI's wording and the room's exact words.
create table private.draft_bullets (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 draft_outcome_id uuid not null,
 position integer not null default 0 check(position>=0),
 text text not null check(length(btrim(text)) between 1 and 280),
 ai_text text check(ai_text is null or length(btrim(ai_text)) between 1 and 280),
 room_text text check(room_text is null or length(btrim(room_text)) between 1 and 280),
 origin text not null check(origin in ('ai','room','written')),
 removed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 unique(id,engagement_id),
 foreign key(draft_outcome_id,engagement_id) references private.draft_outcomes(id,engagement_id)
);
create index draft_bullets_outcome_idx on private.draft_bullets(draft_outcome_id,engagement_id,position);

-- Where a drafted sentence came from: a room bullet (phone input), a scribe card or an easel photo.
create table private.draft_sources (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 draft_outcome_id uuid not null,
 bullet_id uuid not null,
 kind text not null check(kind in ('bullet','card','photo')),
 ref_id uuid not null,
 excerpt text not null default '' check(length(excerpt)<=280),
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(draft_outcome_id,engagement_id) references private.draft_outcomes(id,engagement_id),
 foreign key(bullet_id,engagement_id) references private.draft_bullets(id,engagement_id)
);
create unique index draft_sources_bullet_idx on private.draft_sources(bullet_id,kind,ref_id) where not deleted;
create index draft_sources_outcome_idx on private.draft_sources(draft_outcome_id,engagement_id);

-- The voices not to lose (a strong line from one person) and the tensions the room named, kept apart.
create table private.draft_notes (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 draft_outcome_id uuid not null,
 kind text not null check(kind in ('voice','tension')),
 text text not null check(length(btrim(text)) between 1 and 400),
 source_kind text not null check(source_kind in ('bullet','card')),
 source_id uuid not null,
 position integer not null default 0 check(position>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(draft_outcome_id,engagement_id) references private.draft_outcomes(id,engagement_id)
);
create index draft_notes_outcome_idx on private.draft_notes(draft_outcome_id,engagement_id,kind,position);

-- Every version of every draft is kept: the AI's tidy, each change, who made it and when.
create table private.draft_versions (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 draft_outcome_id uuid not null,
 n integer not null check(n>=1),
 kind text not null check(kind in ('start','ai','edit','restore_words','restore_version','remove','source','accept','photo','thin')),
 what text not null check(length(what) between 1 and 300),
 actor_id uuid references public.clearway_users(id),
 at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=65536),
 foreign key(draft_outcome_id,engagement_id) references private.draft_outcomes(id,engagement_id),
 unique(draft_outcome_id,n)
);
create index draft_versions_engagement_idx on private.draft_versions(engagement_id);
create index draft_versions_actor_idx on private.draft_versions(actor_id);

-- Who is where in the review, and who holds a section's edit lock. A lock is an editing presence seen in
-- the last 40 seconds; the screen sends a heartbeat every 12.
create table private.review_presence (
 engagement_id uuid not null references public.engagements(id),
 user_id uuid not null references public.clearway_users(id),
 place text not null check(place in ('overview','publish') or place ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 editing boolean not null default false,
 seen_at timestamptz not null default clock_timestamp(),
 primary key(engagement_id,user_id)
);
create index review_presence_user_idx on private.review_presence(user_id);

-- What a facilitator typed from an easel photo the draft could not read.
create table private.draft_photo_texts (
 file_id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 text text not null check(length(btrim(text)) between 1 and 2000),
 typed_by uuid not null references public.clearway_users(id),
 typed_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false
);
create index draft_photo_texts_engagement_idx on private.draft_photo_texts(engagement_id);
create index draft_photo_texts_by_idx on private.draft_photo_texts(typed_by);

-- Published snapshots: what step 3's read-back reads. Withdrawn when the lead unpublishes.
create table private.overnight_publications (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 round_id uuid not null,
 n integer not null check(n>=1),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=262144),
 published_by uuid not null references public.clearway_users(id),
 published_at timestamptz not null default clock_timestamp(),
 withdrawn_at timestamptz,
 foreign key(round_id,engagement_id) references private.overnight_rounds(id,engagement_id),
 unique(round_id,n)
);
create index overnight_publications_engagement_idx on private.overnight_publications(engagement_id);
create index overnight_publications_by_idx on private.overnight_publications(published_by);

alter table private.overnight_rounds enable row level security;
alter table private.overnight_rounds force row level security;
alter table private.draft_outcomes enable row level security;
alter table private.draft_outcomes force row level security;
alter table private.draft_bullets enable row level security;
alter table private.draft_bullets force row level security;
alter table private.draft_sources enable row level security;
alter table private.draft_sources force row level security;
alter table private.draft_notes enable row level security;
alter table private.draft_notes force row level security;
alter table private.draft_versions enable row level security;
alter table private.draft_versions force row level security;
alter table private.review_presence enable row level security;
alter table private.review_presence force row level security;
alter table private.draft_photo_texts enable row level security;
alter table private.draft_photo_texts force row level security;
alter table private.overnight_publications enable row level security;
alter table private.overnight_publications force row level security;
revoke all on private.overnight_rounds,private.draft_outcomes,private.draft_bullets,private.draft_sources,private.draft_notes,private.draft_versions,
 private.review_presence,private.draft_photo_texts,private.overnight_publications from public,anon,authenticated;
grant select,insert,update,delete on private.overnight_rounds,private.draft_outcomes,private.draft_bullets,private.draft_sources,private.draft_notes,private.draft_versions,
 private.review_presence,private.draft_photo_texts,private.overnight_publications to service_role;
create trigger touch_record before update on private.overnight_rounds for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.draft_outcomes for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.draft_bullets for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.draft_sources for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.draft_notes for each row execute function private.touch_live_record('id');
create trigger touch_record before update on private.draft_photo_texts for each row execute function private.touch_live_record('file_id');

-- A version is never changed or removed.
create function private.draft_version_keep() returns trigger
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Draft versions are kept'; end $$;
create trigger draft_version_keep before update or delete on private.draft_versions for each row execute function private.draft_version_keep();

-- ---------- Small helpers ----------
-- Two texts compared without caring about case, spacing or curly quotes.
create function private.ov_norm(p_text text) returns text
language sql immutable security invoker set search_path='' as $$
 select lower(btrim(regexp_replace(translate(coalesce(p_text,''),'‘’“”','''''""'),'\s+',' ','g')))
$$;
-- The first name of a facilitator, for presence and history.
create function private.ov_first(p_user uuid) returns text
language sql stable security definer set search_path='' as $$
 select split_part(btrim(c.name),' ',1) from public.clearway_users c where c.id=p_user
$$;
-- Facilitators of this engagement; the lead (or an admin) publishes.
create function private.ov_facilitates(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.wf_facilitates(p_engagement) and private.clearway_user_id() is not null
$$;
create function private.ov_lead(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ov_facilitates(p_engagement) and (private.is_admin() or exists(select 1 from public.engagement_facilitators f
  where f.engagement_id=p_engagement and f.role='lead' and not f.deleted and f.clearway_user_id=private.clearway_user_id()))
$$;
-- The person holding a section's edit lock now, if any.
create function private.ov_holder(p_engagement uuid,p_do uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select p.user_id from private.review_presence p where p.engagement_id=p_engagement and p.place=p_do::text and p.editing and p.seen_at>clock_timestamp()-interval '40 seconds'
 order by p.seen_at desc limit 1
$$;
-- The text a source stands for, to check that a number in a bullet comes from somewhere.
create function private.ov_source_text(p_engagement uuid,p_kind text,p_ref uuid,p_excerpt text) returns text
language sql stable security definer set search_path='' as $$
 select coalesce(case p_kind
  when 'bullet' then (select i.text from private.outcome_indicators i where i.id=p_ref and i.engagement_id=p_engagement)
  when 'card' then (select concat_ws(' ',k.text,k.detail->>'why',k.detail->'views'->>0,k.detail->'views'->>1) from private.scribe_cards k where k.id=p_ref and k.engagement_id=p_engagement and not k.deleted)
  when 'photo' then (select t.text from private.draft_photo_texts t where t.file_id=p_ref and t.engagement_id=p_engagement and not t.deleted) end,'')||' '||coalesce(p_excerpt,'')
$$;
-- A bullet that cannot stand: it has no source, or it carries a number none of its sources has.
-- The 3-year target year is not counted as a number.
create function private.ov_bullet_flag(p_bullet uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare b private.draft_bullets; year text; have text[]; need text[];
begin
 select * into b from private.draft_bullets where id=p_bullet and not deleted;
 if not found or b.removed then return null; end if;
 if not exists(select 1 from private.draft_sources s where s.bullet_id=b.id and not s.deleted) then return 'none'; end if;
 select (e.base_year+3)::text into year from public.engagements e where e.id=b.engagement_id;
 select coalesce(array_agg(distinct n),array[]::text[]) into have from private.draft_sources s
  cross join lateral unnest(private.ai_numbers(private.ov_source_text(s.engagement_id,s.kind,s.ref_id,s.excerpt))) n where s.bullet_id=b.id and not s.deleted and s.kind in ('card','photo');
 select coalesce(array_agg(n),array[]::text[]) into need from unnest(private.ai_numbers(b.text)) n where n is distinct from year;
 if not need<@have and private.ov_norm(b.text) is distinct from private.ov_norm(b.room_text) then return 'number'; end if;
 return null;
end $$;
-- The state of a draft as a snapshot, for the version list and for restoring a version.
create function private.ov_snapshot(p_do uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',d.name,'description',d.description,'bullets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'text',b.text,'origin',b.origin,'removed',b.removed,'position',b.position) order by b.position,b.id)
   from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted),'[]'::jsonb))
 from private.draft_outcomes d where d.id=p_do
$$;
create function private.ov_version(p_do uuid,p_kind text,p_what text,p_actor uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; eng uuid;
begin
 select engagement_id into eng from private.draft_outcomes where id=p_do;
 select coalesce(max(v.n),0)+1 into n from private.draft_versions v where v.draft_outcome_id=p_do;
 insert into private.draft_versions(engagement_id,draft_outcome_id,n,kind,what,actor_id,snapshot) values(eng,p_do,n,p_kind,left(p_what,300),p_actor,private.ov_snapshot(p_do));
 return n;
end $$;

-- ---------- Opening the round ----------
-- Day 1 closing, or a facilitator asking for it. One round per engagement; it covers the provisional
-- Vision Outcomes as they are now. With AI off the drafts are written by hand from the sources.
create function private.ov_open(p_engagement uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r private.overnight_rounds; ai boolean; t timestamptz:=clock_timestamp(); d record;
begin
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted;
 if found then return r.id; end if;
 if not exists(select 1 from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted and o.status='provisional') then return null; end if;
 ai:=coalesce((select e.settings->>'ai_enabled'='true' from public.engagements e where e.id=p_engagement and not e.deleted),false);
 insert into private.overnight_rounds(engagement_id,status,day_closed_at) values(p_engagement,case when ai then 'pending' else 'ai_off' end,t) returning * into r;
 for d in select o.* from private.vision_outcomes o where o.engagement_id=p_engagement and not o.deleted and o.status='provisional' order by o.position,o.id loop
  insert into private.draft_outcomes(engagement_id,round_id,outcome_id,position,name,original_name,description,tidy)
   values(p_engagement,r.id,d.id,d.position,d.title,coalesce(d.renamed_from,d.title),left(d.description,200),case when ai then 'waiting' else 'by_hand' end);
 end loop;
 for d in select x.id from private.draft_outcomes x where x.round_id=r.id loop
  perform private.ov_version(d.id,'start','Drafting started when Day 1 closed',null);
 end loop;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','round'));
 return r.id;
end $$;

-- Ending a day is the room control close_part. When it leaves Day 1 with steps closed and none still
-- open, the round opens. A step ending on its own, or a close of another part before Day 1 has started,
-- does not.
create function private.overnight_day1_closed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.action='close_part'
  and exists(select 1 from public.sessions x where x.engagement_id=new.engagement_id and x.part='Day 1' and not x.deleted and x.state='closed' and x.closed_at is not null)
  and not exists(select 1 from public.sessions x where x.engagement_id=new.engagement_id and x.part='Day 1' and not x.deleted and x.mode='live' and x.state in ('live','phones_down','open'))
  and not exists(select 1 from public.sessions x where x.engagement_id=new.engagement_id and x.part='Day 1' and not x.deleted and x.mode='self_paced' and x.state<>'draft' and x.closes_at>clock_timestamp()) then
  perform private.ov_open(new.engagement_id);
 end if;
 return new;
end $$;
create trigger overnight_day1_closed after insert on private.room_controls for each row execute function private.overnight_day1_closed();

-- A Vision Outcome that is removed leaves the review; a round with nothing left goes with it.
create function private.draft_outcome_cascade() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted and not old.deleted then
  update private.draft_outcomes set deleted=true where outcome_id=new.id and engagement_id=new.engagement_id and not deleted;
  update private.overnight_rounds r set deleted=true where r.engagement_id=new.engagement_id and not r.deleted
   and not exists(select 1 from private.draft_outcomes d where d.round_id=r.id and not d.deleted);
 end if;
 return new;
end $$;
create trigger draft_outcome_cascade after update of deleted on private.vision_outcomes for each row execute function private.draft_outcome_cascade();

-- ---------- The review's state ----------
create function private.ov_outcome_json(p_do uuid,p_me uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'outcome_id',d.outcome_id,'name',d.name,'original_name',d.original_name,'description',d.description,'position',d.position,
  'tidy',d.tidy,'revision',d.revision,
  'thin',not exists(select 1 from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted and not b.removed),
  'thin_ack',case when d.thin_ack_at is null then null else jsonb_build_object('by',private.ov_first(d.thin_ack_by),'at',d.thin_ack_at) end,
  'reviewed',case when d.reviewed_at is null then null else jsonb_build_object('by',private.ov_first(d.reviewed_by),'mine',d.reviewed_by=p_me,'at',d.reviewed_at) end,
  'unreadable',to_jsonb(d.unreadable),
  'lock',(select case when h is null then null else jsonb_build_object('by',private.ov_first(h),'mine',h=p_me) end from (select private.ov_holder(d.engagement_id,d.id) as h) x),
  'versions',(select count(*)::integer from private.draft_versions v where v.draft_outcome_id=d.id),
  'bullets',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'position',b.position,'text',b.text,'ai_text',b.ai_text,'room_text',b.room_text,'origin',b.origin,'removed',b.removed,
     'restorable',b.room_text is not null and private.ov_norm(b.room_text)<>private.ov_norm(b.text),'flag',private.ov_bullet_flag(b.id),
     'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'ref',s.ref_id,'excerpt',s.excerpt) order by s.position,s.id) from private.draft_sources s where s.bullet_id=b.id and not s.deleted),'[]'::jsonb))
     order by b.position,b.id) from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted),'[]'::jsonb),
  'voices',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'text',n.text,'source_kind',n.source_kind,'source',n.source_id) order by n.position,n.id) from private.draft_notes n where n.draft_outcome_id=d.id and not n.deleted and n.kind='voice'),'[]'::jsonb),
  'tensions',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'text',n.text,'source_kind',n.source_kind,'source',n.source_id) order by n.position,n.id) from private.draft_notes n where n.draft_outcome_id=d.id and not n.deleted and n.kind='tension'),'[]'::jsonb),
  'room_bullets',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'text',i.text,'used',exists(select 1 from private.draft_sources s join private.draft_bullets b on b.id=s.bullet_id and not b.deleted and not b.removed
      where s.draft_outcome_id=d.id and s.kind='bullet' and s.ref_id=i.id and not s.deleted)) order by i.position,i.id)
     from private.outcome_indicators i where i.outcome_id=d.outcome_id and i.engagement_id=d.engagement_id and not i.deleted and length(btrim(i.text))>0),'[]'::jsonb))
 from private.draft_outcomes d where d.id=p_do
$$;

-- Whether the review can be published, and what is in the way.
create function private.ov_check(p_round uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with r as (select * from private.overnight_rounds where id=p_round),
 d as (select d.*,(select count(*) from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted and not b.removed) as bullets,
   private.ov_holder(d.engagement_id,d.id) as holder from private.draft_outcomes d where d.round_id=p_round and not d.deleted)
 select jsonb_build_object(
  'total',(select count(*)::integer from d),
  'reviewed',(select count(*)::integer from d where reviewed_at is not null),
  'unreviewed',coalesce((select jsonb_agg(d.name order by d.position) from d where d.reviewed_at is null),'[]'::jsonb),
  'editing',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'by',private.ov_first(d.holder)) order by d.position) from d where d.holder is not null),'[]'::jsonb),
  'thin',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'acknowledged',d.thin_ack_at is not null) order by d.position) from d where d.bullets=0),'[]'::jsonb),
  'thin_open',(select count(*)::integer from d where d.bullets=0 and d.thin_ack_at is null),
  'drafting',(select status in ('pending','drafting') from r),
  'ready',(select r.status in ('ready','failed','ai_off') and r.published_at is null from r)
   and not exists(select 1 from d where d.reviewed_at is null) and not exists(select 1 from d where d.holder is not null)
   and not exists(select 1 from d where d.bullets=0 and d.thin_ack_at is null) and exists(select 1 from d))
$$;

create function private.overnight_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.overnight_rounds; me uuid:=private.clearway_user_id(); y integer;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 select base_year into y from public.engagements where id=p_engagement;
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','none','server_time',clock_timestamp(),'year',y+3,'ai',coalesce((select e.settings->>'ai_enabled'='true' from public.engagements e where e.id=p_engagement),false)); end if;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),'me',me,'year',y+3,
  'ai',coalesce((select e.settings->>'ai_enabled'='true' from public.engagements e where e.id=p_engagement),false),
  'lead',private.ov_lead(p_engagement),
  'round',jsonb_build_object('id',r.id,'status',r.status,'day_closed_at',r.day_closed_at,'ready_at',r.ready_at,'published_at',r.published_at,'published_by',private.ov_first(r.published_by),
   'attempts',r.attempts,'error',r.last_error,'inputs',r.inputs,'unreadable',to_jsonb(r.unreadable)),
  'check',private.ov_check(r.id),
  'outcomes',coalesce((select jsonb_agg(private.ov_outcome_json(d.id,me) order by d.position,d.id) from private.draft_outcomes d where d.round_id=r.id and not d.deleted),'[]'::jsonb),
  'presence',coalesce((select jsonb_agg(jsonb_build_object('user',p.user_id,'name',private.ov_first(p.user_id),'place',p.place,'editing',p.editing and p.place not in ('overview','publish'),'you',p.user_id=me) order by p.user_id)
    from private.review_presence p where p.engagement_id=p_engagement and p.seen_at>clock_timestamp()-interval '40 seconds'),'[]'::jsonb),
  'cards',coalesce((select jsonb_object_agg(k.id::text,jsonb_build_object('kind',k.kind,'text',k.text,'detail',k.detail,'step',s.title,'at',k.captured_at)) from private.scribe_cards k
    join public.sessions s on s.id=k.session_id and s.engagement_id=k.engagement_id where k.engagement_id=p_engagement and not k.deleted and s.part='Day 1'),'{}'::jsonb),
  'files',coalesce((select jsonb_object_agg(f.id::text,jsonb_build_object('kind',f.kind,'name',f.name,'type',f.content_type,'uploaded',f.uploaded_at is not null,'step',s.title,'at',f.captured_at,'typed',t.text))
    from private.scribe_files f join public.sessions s on s.id=f.session_id and s.engagement_id=f.engagement_id
    left join private.draft_photo_texts t on t.file_id=f.id and not t.deleted where f.engagement_id=p_engagement and not f.deleted and s.part='Day 1'),'{}'::jsonb),
  'unplaced',coalesce((select jsonb_agg(k.id order by k.seq) from private.scribe_cards k join public.sessions s on s.id=k.session_id and s.engagement_id=k.engagement_id
    where k.engagement_id=p_engagement and not k.deleted and s.part='Day 1'
     and not exists(select 1 from private.draft_sources x where x.kind='card' and x.ref_id=k.id and not x.deleted)
     and not exists(select 1 from private.draft_notes n where n.source_kind='card' and n.source_id=k.id and not n.deleted)),'[]'::jsonb));
end $$;

create function private.overnight_summary(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r private.overnight_rounds;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','none'); end if;
 return jsonb_build_object('status','ok','round',r.status,'day_closed_at',r.day_closed_at,'ready_at',r.ready_at,'published_at',r.published_at,
  'total',(select count(*)::integer from private.draft_outcomes d where d.round_id=r.id and not d.deleted),
  'tidied',(select count(*)::integer from private.draft_outcomes d where d.round_id=r.id and not d.deleted and d.tidy<>'waiting'),
  'reviewed',(select count(*)::integer from private.draft_outcomes d where d.round_id=r.id and not d.deleted and d.reviewed_at is not null),
  'ready',r.status in ('ready','ai_off','failed'),
  'outcomes',coalesce((select jsonb_agg(jsonb_build_object('name',d.name,'tidy',d.tidy,'reviewed',d.reviewed_at is not null,
     'thin',not exists(select 1 from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted and not b.removed),
     'editing',private.ov_holder(d.engagement_id,d.id) is not null) order by d.position,d.id) from private.draft_outcomes d where d.round_id=r.id and not d.deleted),'[]'::jsonb));
end $$;

create function private.overnight_versions(p_engagement uuid,p_outcome uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if not exists(select 1 from private.draft_outcomes d where d.id=p_outcome and d.engagement_id=p_engagement and not d.deleted) then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('status','ok','versions',coalesce((select jsonb_agg(jsonb_build_object('n',v.n,'kind',v.kind,'what',v.what,'by',case when v.actor_id is null then null else private.ov_first(v.actor_id) end,'ai',v.kind in ('ai','start') and v.actor_id is null,'at',v.at,
   'current',v.n=(select max(x.n) from private.draft_versions x where x.draft_outcome_id=p_outcome)) order by v.n desc) from private.draft_versions v where v.draft_outcome_id=p_outcome),'[]'::jsonb));
end $$;

-- ---------- Presence and section locks ----------
-- Where this facilitator is. Editing a section takes its lock unless the other facilitator holds it.
create function private.overnight_presence(p_engagement uuid,p_place text,p_editing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); holder uuid;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if p_place is null or p_editing is null or p_place not in ('overview','publish') and p_place !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
 if p_place not in ('overview','publish') and not exists(select 1 from private.draft_outcomes d where d.id=p_place::uuid and d.engagement_id=p_engagement and not d.deleted) then return jsonb_build_object('status','not_found'); end if;
 if p_editing and p_place in ('overview','publish') then return jsonb_build_object('status','invalid_request'); end if;
 if p_editing then
  holder:=private.ov_holder(p_engagement,p_place::uuid);
  if holder is not null and holder<>me then return jsonb_build_object('status','locked','by',private.ov_first(holder)); end if;
 end if;
 insert into private.review_presence(engagement_id,user_id,place,editing,seen_at) values(p_engagement,me,p_place,p_editing,clock_timestamp())
  on conflict(engagement_id,user_id) do update set place=excluded.place,editing=excluded.editing,seen_at=excluded.seen_at;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','presence'));
 return jsonb_build_object('status','ok');
end $$;

-- The checks every change to a draft starts with. Returns null when this facilitator may change it
-- (no one else is editing it and the revision is current), else the reason. A lock is held by the open
-- editor (overnight_presence), not by a button press.
create function private.ov_write_check(p_engagement uuid,p_do uuid,p_revision integer) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); d private.draft_outcomes; r private.overnight_rounds; holder uuid;
begin
 if not private.ov_facilitates(p_engagement) then return 'denied'; end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return 'closed'; end if;
 select * into d from private.draft_outcomes where id=p_do and engagement_id=p_engagement and not deleted for update;
 if not found then return 'not_found'; end if;
 select * into r from private.overnight_rounds where id=d.round_id;
 if r.published_at is not null then return 'published'; end if;
 if d.tidy='waiting' then return 'drafting'; end if;
 holder:=private.ov_holder(p_engagement,p_do);
 if holder is not null and holder<>me then return 'locked'; end if;
 if p_revision is distinct from d.revision then return 'conflict'; end if;
 return null;
end $$;

create function private.ov_changed(p_engagement uuid,p_do uuid,p_kind text,p_what text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
 update private.draft_outcomes set revision=revision+1,reviewed_by=null,reviewed_at=null where id=p_do returning revision into rev;
 perform private.ov_version(p_do,p_kind,p_what,private.clearway_user_id());
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','draft'));
 return jsonb_build_object('status','ok','revision',rev);
end $$;

-- ---------- Changes to a draft ----------
-- Replace the bullets with the list as edited. A line with an id keeps its sources; a new line has none
-- and shows as unsourced until it is sourced. A bullet left out of the list is removed, and put back
-- from the version list or with Put back.
create function private.overnight_edit(p_engagement uuid,p_outcome uuid,p_revision integer,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; item jsonb; pos integer:=0; b private.draft_bullets; txt text; changed boolean:=false; ids uuid[]:=array[]::uuid[]; kind text; added integer:=0; edited integer:=0; dropped integer;
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'bullets') is distinct from 'array' or jsonb_array_length(p->'bullets')>20 then return jsonb_build_object('status','invalid_request'); end if;
 for item in select value from jsonb_array_elements(p->'bullets') loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'text') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
  txt:=btrim(regexp_replace(item->>'text','\s+',' ','g'));
  if length(txt) not between 1 and 280 or private.screen_text(txt) then return jsonb_build_object('status','invalid_request'); end if;
  if item ? 'id' and item->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
 end loop;
 for item in select value from jsonb_array_elements(p->'bullets') loop
  txt:=btrim(regexp_replace(item->>'text','\s+',' ','g'));
  if item ? 'id' and (item->>'id') is not null then
   select * into b from private.draft_bullets where id=(item->>'id')::uuid and draft_outcome_id=p_outcome and not deleted for update;
   if not found then return jsonb_build_object('status','not_found'); end if;
   ids:=ids||b.id;
   kind:=case when private.ov_norm(txt)=private.ov_norm(b.room_text) then 'room' when private.ov_norm(txt)=private.ov_norm(b.ai_text) then 'ai' else 'written' end;
   if b.text<>txt or b.removed or b.position<>pos then
    if b.text<>txt then edited:=edited+1; end if;
    update private.draft_bullets set text=txt,origin=case when b.text=txt then b.origin else kind end,removed=false,position=pos where id=b.id; changed:=true;
   end if;
  else
   insert into private.draft_bullets(engagement_id,draft_outcome_id,position,text,origin) values(p_engagement,p_outcome,pos,txt,'written') returning * into b;
   ids:=ids||b.id; added:=added+1; changed:=true;
  end if;
  pos:=pos+1;
 end loop;
 update private.draft_bullets set removed=true where draft_outcome_id=p_outcome and not deleted and not removed and not (id=any(ids));
 get diagnostics dropped=row_count;
 if dropped>0 then changed:=true; end if;
 if not changed then return jsonb_build_object('status','unchanged'); end if;
 return private.ov_changed(p_engagement,p_outcome,'edit',case when added>0 and edited=0 and dropped=0 then 'Added a bullet' when edited>0 and added=0 and dropped=0 then 'Edited the bullets' else 'Edited the bullets' end);
end $$;

-- Swap the AI's wording for what the room typed, in one action.
create function private.overnight_restore_words(p_engagement uuid,p_outcome uuid,p_bullet uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; b private.draft_bullets; n integer;
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 select * into b from private.draft_bullets where id=p_bullet and draft_outcome_id=p_outcome and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if b.room_text is null then return jsonb_build_object('status','no_room_words'); end if;
 if private.ov_norm(b.room_text)=private.ov_norm(b.text) then return jsonb_build_object('status','unchanged'); end if;
 update private.draft_bullets set text=b.room_text,origin='room',removed=false where id=b.id;
 select count(*)::integer into n from private.draft_bullets x where x.draft_outcome_id=p_outcome and not x.deleted and (x.position,x.id)<=(b.position,b.id);
 return private.ov_changed(p_engagement,p_outcome,'restore_words','Restored the room''s words in bullet '||n);
end $$;

create function private.overnight_remove(p_engagement uuid,p_outcome uuid,p_bullet uuid,p_removed boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; b private.draft_bullets; n integer;
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 if p_removed is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into b from private.draft_bullets where id=p_bullet and draft_outcome_id=p_outcome and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if b.removed=p_removed then return jsonb_build_object('status','unchanged'); end if;
 update private.draft_bullets set removed=p_removed where id=b.id;
 select count(*)::integer into n from private.draft_bullets x where x.draft_outcome_id=p_outcome and not x.deleted and (x.position,x.id)<=(b.position,b.id);
 return private.ov_changed(p_engagement,p_outcome,'remove',case when p_removed then 'Removed bullet ' else 'Put back bullet ' end||n);
end $$;

-- Add a source to a bullet, or take one away. A source is a room bullet of this outcome, a scribe card or an easel photo.
create function private.overnight_source(p_engagement uuid,p_outcome uuid,p_bullet uuid,p_kind text,p_ref uuid,p_add boolean,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; b private.draft_bullets; d private.draft_outcomes; ok boolean; n integer;
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 if p_kind is null or p_kind not in ('bullet','card','photo') or p_ref is null or p_add is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into b from private.draft_bullets where id=p_bullet and draft_outcome_id=p_outcome and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into d from private.draft_outcomes where id=p_outcome;
 if p_add then
  ok:=case p_kind
   when 'bullet' then exists(select 1 from private.outcome_indicators i where i.id=p_ref and i.outcome_id=d.outcome_id and i.engagement_id=p_engagement and not i.deleted)
   when 'card' then exists(select 1 from private.scribe_cards k where k.id=p_ref and k.engagement_id=p_engagement and not k.deleted)
   else exists(select 1 from private.scribe_files f where f.id=p_ref and f.engagement_id=p_engagement and not f.deleted and f.kind='photo') end;
  if not ok then return jsonb_build_object('status','not_found'); end if;
  if exists(select 1 from private.draft_sources s where s.bullet_id=b.id and s.kind=p_kind and s.ref_id=p_ref and not s.deleted) then return jsonb_build_object('status','unchanged'); end if;
  insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,position) values(p_engagement,p_outcome,b.id,p_kind,p_ref,
   coalesce((select max(s.position)+1 from private.draft_sources s where s.bullet_id=b.id and not s.deleted),0));
 else
  update private.draft_sources set deleted=true where bullet_id=b.id and kind=p_kind and ref_id=p_ref and not deleted;
  get diagnostics n=row_count;
  if n=0 then return jsonb_build_object('status','unchanged'); end if;
 end if;
 select count(*)::integer into n from private.draft_bullets x where x.draft_outcome_id=p_outcome and not x.deleted and (x.position,x.id)<=(b.position,b.id);
 return private.ov_changed(p_engagement,p_outcome,'source',case when p_add then 'Added a source to bullet ' else 'Took a source off bullet ' end||n);
end $$;

-- Add one of the room's own bullets to the draft in the room's exact words (AI off, or a bullet left out).
create function private.overnight_add_room_bullet(p_engagement uuid,p_outcome uuid,p_indicator uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; d private.draft_outcomes; i private.outcome_indicators; nb private.draft_bullets;
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 select * into d from private.draft_outcomes where id=p_outcome;
 select * into i from private.outcome_indicators where id=p_indicator and outcome_id=d.outcome_id and engagement_id=p_engagement and not deleted and length(btrim(text))>0;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if exists(select 1 from private.draft_sources s join private.draft_bullets b on b.id=s.bullet_id and not b.deleted and not b.removed
  where s.draft_outcome_id=p_outcome and s.kind='bullet' and s.ref_id=i.id and not s.deleted) then return jsonb_build_object('status','unchanged'); end if;
 insert into private.draft_bullets(engagement_id,draft_outcome_id,position,text,room_text,origin) values(p_engagement,p_outcome,
  coalesce((select max(b.position)+1 from private.draft_bullets b where b.draft_outcome_id=p_outcome and not b.deleted),0),left(btrim(i.text),280),left(btrim(i.text),280),'room') returning * into nb;
 insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt) values(p_engagement,p_outcome,nb.id,'bullet',i.id,left(btrim(i.text),280));
 return private.ov_changed(p_engagement,p_outcome,'edit','Added the room''s bullet in its exact words');
end $$;

-- Accept an outcome: reviewed by this facilitator. Needs every bullet sourced and, when there are none, the thin flag acknowledged.
create function private.overnight_accept(p_engagement uuid,p_outcome uuid,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; d private.draft_outcomes; me uuid:=private.clearway_user_id(); rev integer;
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 select * into d from private.draft_outcomes where id=p_outcome;
 if exists(select 1 from private.draft_bullets b where b.draft_outcome_id=p_outcome and not b.deleted and not b.removed and private.ov_bullet_flag(b.id) is not null) then return jsonb_build_object('status','flagged'); end if;
 if not exists(select 1 from private.draft_bullets b where b.draft_outcome_id=p_outcome and not b.deleted and not b.removed) and d.thin_ack_at is null then return jsonb_build_object('status','thin'); end if;
 update private.draft_outcomes set reviewed_by=me,reviewed_at=clock_timestamp(),revision=revision+1 where id=p_outcome returning revision into rev;
 perform private.ov_version(p_outcome,'accept','Accepted '||d.name,me);
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','review'));
 return jsonb_build_object('status','ok','revision',rev);
end $$;

-- Show a thin outcome in the morning as thin: the facilitator has seen the flag.
create function private.overnight_ack_thin(p_engagement uuid,p_outcome uuid,p_value boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); d private.draft_outcomes; r private.overnight_rounds;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if p_value is null then return jsonb_build_object('status','invalid_request'); end if;
 select * into d from private.draft_outcomes where id=p_outcome and engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select * into r from private.overnight_rounds where id=d.round_id;
 if r.published_at is not null then return jsonb_build_object('status','published'); end if;
 if exists(select 1 from private.draft_bullets b where b.draft_outcome_id=p_outcome and not b.deleted and not b.removed) then return jsonb_build_object('status','not_thin'); end if;
 if (d.thin_ack_at is not null)=p_value then return jsonb_build_object('status','unchanged'); end if;
 update private.draft_outcomes set thin_ack_by=case when p_value then me end,thin_ack_at=case when p_value then clock_timestamp() end,
  reviewed_by=case when p_value then reviewed_by end,reviewed_at=case when p_value then reviewed_at end where id=p_outcome;
 perform private.ov_version(p_outcome,'thin',case when p_value then 'Acknowledged that '||d.name||' is thin' else 'Took back the thin acknowledgement' end,me);
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','review'));
 return jsonb_build_object('status','ok');
end $$;

-- Go back to an earlier version of one outcome. The version list keeps the new state as the newest version.
create function private.overnight_restore_version(p_engagement uuid,p_outcome uuid,p_version integer,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bad text; v private.draft_versions; item jsonb; ids uuid[]:=array[]::uuid[];
begin
 bad:=private.ov_write_check(p_engagement,p_outcome,p_revision);
 if bad is not null then return jsonb_build_object('status',bad,'by',case when bad='locked' then private.ov_first(private.ov_holder(p_engagement,p_outcome)) end); end if;
 select * into v from private.draft_versions where draft_outcome_id=p_outcome and n=p_version;
 if not found then return jsonb_build_object('status','not_found'); end if;
 for item in select value from jsonb_array_elements(v.snapshot->'bullets') loop
  update private.draft_bullets set text=item->>'text',origin=item->>'origin',removed=(item->>'removed')::boolean,position=(item->>'position')::integer
   where id=(item->>'id')::uuid and draft_outcome_id=p_outcome and not deleted;
  if found then ids:=ids||(item->>'id')::uuid; end if;
 end loop;
 update private.draft_bullets set removed=true where draft_outcome_id=p_outcome and not deleted and not removed and not (id=any(ids));
 return private.ov_changed(p_engagement,p_outcome,'restore_version','Went back to version '||p_version);
end $$;

-- Type what an easel photo says when the draft could not read it. It then counts as a source.
create function private.overnight_photo_text(p_engagement uuid,p_file uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); txt text:=btrim(coalesce(p_text,''));
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if length(txt) not between 1 and 2000 or private.screen_text(txt) then return jsonb_build_object('status','invalid_request'); end if;
 if not exists(select 1 from private.scribe_files f where f.id=p_file and f.engagement_id=p_engagement and not f.deleted and f.kind='photo') then return jsonb_build_object('status','not_found'); end if;
 if exists(select 1 from private.overnight_rounds r where r.engagement_id=p_engagement and not r.deleted and r.published_at is not null) then return jsonb_build_object('status','published'); end if;
 insert into private.draft_photo_texts(file_id,engagement_id,text,typed_by) values(p_file,p_engagement,txt,me)
  on conflict(file_id) do update set text=excluded.text,typed_by=excluded.typed_by,typed_at=clock_timestamp(),deleted=false;
 update private.draft_outcomes set unreadable=array_remove(unreadable,p_file) where engagement_id=p_engagement and p_file=any(unreadable);
 update private.overnight_rounds set unreadable=array_remove(unreadable,p_file) where engagement_id=p_engagement and not deleted and p_file=any(unreadable);
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','photo'));
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Starting and retrying ----------
create function private.overnight_start(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.overnight_rounds; rid uuid; ai boolean;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 ai:=coalesce((select e.settings->>'ai_enabled'='true' from public.engagements e where e.id=p_engagement),false);
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted for update;
 if not found then
  rid:=private.ov_open(p_engagement);
  if rid is null then return jsonb_build_object('status','no_outcomes'); end if;
  return jsonb_build_object('status','ok');
 end if;
 if r.published_at is not null then return jsonb_build_object('status','published'); end if;
 if r.status='failed' or (r.status='ai_off' and ai) then
  update private.overnight_rounds set status='pending',attempts=0,last_error=null,last_failed_at=null where id=r.id;
  update private.draft_outcomes d set tidy='waiting' where d.round_id=r.id and not d.deleted and d.tidy='by_hand'
   and not exists(select 1 from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted);
  perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','round'));
  return jsonb_build_object('status','ok');
 end if;
 return jsonb_build_object('status','exists');
end $$;

-- The draft is slow or failed: write it by hand. Every outcome still waiting becomes the facilitators' to write,
-- the run is let go, and a late reply from it is ignored.
create function private.overnight_by_hand(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.overnight_rounds;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','none'); end if;
 if r.published_at is not null then return jsonb_build_object('status','published'); end if;
 if r.status not in ('pending','drafting') and not exists(select 1 from private.draft_outcomes d where d.round_id=r.id and not d.deleted and d.tidy='waiting') then return jsonb_build_object('status','unchanged'); end if;
 if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=clock_timestamp() where id=r.lease_run and status='running'; end if;
 update private.draft_outcomes set tidy='by_hand' where round_id=r.id and not deleted and tidy='waiting';
 update private.overnight_rounds set status=case when status in ('pending','drafting') then 'failed' else status end,lease_id=null,lease_run=null,lease_until=null,
  last_error=coalesce(last_error,'Written by hand') where id=r.id;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','round'));
 return jsonb_build_object('status','ok');
end $$;

-- ---------- Publishing (the lead facilitator) ----------
create function private.overnight_publish(p_engagement uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.clearway_user_id(); r private.overnight_rounds; c jsonb; n integer; snap jsonb; done private.overnight_publications;
begin
 if not private.ov_lead(p_engagement) then return jsonb_build_object('status','denied'); end if;
 if p_id is null then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 select * into done from private.overnight_publications where id=p_id;
 if found then
  if done.engagement_id=p_engagement then return jsonb_build_object('status','duplicate'); end if;
  return jsonb_build_object('status','conflict');
 end if;
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','none'); end if;
 if r.published_at is not null then return jsonb_build_object('status','published'); end if;
 perform 1 from private.draft_outcomes where round_id=r.id and not deleted order by id for update;
 c:=private.ov_check(r.id);
 if not (c->>'ready')::boolean then return jsonb_build_object('status','not_ready','check',c); end if;
 snap:=jsonb_build_object('year',(select e.base_year+3 from public.engagements e where e.id=p_engagement),'horizon','3-year Vision','outcomes',coalesce((
  select jsonb_agg(jsonb_build_object('outcome_id',d.outcome_id,'name',d.name,'original_name',d.original_name,'description',d.description,
   'thin',not exists(select 1 from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted and not b.removed),'thin_acknowledged',d.thin_ack_at is not null,
   'reviewed_by',private.ov_first(d.reviewed_by),'reviewed_at',d.reviewed_at,
   'bullets',coalesce((select jsonb_agg(jsonb_build_object('text',b.text,'origin',b.origin,'sources',(select count(*)::integer from private.draft_sources s where s.bullet_id=b.id and not s.deleted),
      'room_text',b.room_text) order by b.position,b.id) from private.draft_bullets b where b.draft_outcome_id=d.id and not b.deleted and not b.removed),'[]'::jsonb),
   'voices',coalesce((select jsonb_agg(n.text order by n.position,n.id) from private.draft_notes n where n.draft_outcome_id=d.id and not n.deleted and n.kind='voice'),'[]'::jsonb),
   'tensions',coalesce((select jsonb_agg(n.text order by n.position,n.id) from private.draft_notes n where n.draft_outcome_id=d.id and not n.deleted and n.kind='tension'),'[]'::jsonb)) order by d.position,d.id)
  from private.draft_outcomes d where d.round_id=r.id and not d.deleted),'[]'::jsonb));
 select coalesce(max(x.n),0)+1 into n from private.overnight_publications x where x.round_id=r.id;
 insert into private.overnight_publications(id,engagement_id,round_id,n,snapshot,published_by) values(p_id,p_engagement,r.id,n,snap,me);
 update private.overnight_rounds set published_at=clock_timestamp(),published_by=me where id=r.id;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','published'));
 return jsonb_build_object('status','ok','n',n);
end $$;

create function private.overnight_unpublish(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.overnight_rounds;
begin
 if not private.ov_lead(p_engagement) then return jsonb_build_object('status','denied'); end if;
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','none'); end if;
 if r.published_at is null then return jsonb_build_object('status','unchanged'); end if;
 update private.overnight_publications set withdrawn_at=clock_timestamp() where round_id=r.id and withdrawn_at is null;
 update private.overnight_rounds set published_at=null,published_by=null where id=r.id;
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','published'));
 return jsonb_build_object('status','ok');
end $$;

-- The hook for step 3: the latest published review, for the read-back to show. Facilitators only for now;
-- the room-facing read is step 3's, and only once the confirm is live.
create function private.overnight_published(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p private.overnight_publications;
begin
 if not private.ov_facilitates(p_engagement) then return jsonb_build_object('status','denied'); end if;
 select * into p from private.overnight_publications where engagement_id=p_engagement and withdrawn_at is null order by n desc limit 1;
 if not found then return jsonb_build_object('status','none'); end if;
 return jsonb_build_object('status','ok','n',p.n,'published_at',p.published_at,'by',private.ov_first(p.published_by),'snapshot',p.snapshot);
end $$;

-- ---------- The server's worker: claim, apply, fail (service role only) ----------
create function private.overnight_due(p_engagement uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.overnight_rounds r where r.engagement_id=p_engagement and not r.deleted
  and ((r.status='pending' and (r.last_failed_at is null or r.last_failed_at<=clock_timestamp()-make_interval(secs=>30*greatest(r.attempts,1))))
   or (r.status='drafting' and r.lease_until<clock_timestamp())))
$$;

create function private.overnight_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.overnight_rounds; t timestamptz:=clock_timestamp(); e public.engagements; v_inputs jsonb; v_run uuid; nb integer; nc integer; np integer;
begin
 if p_engagement is null or p_lease is null or p_model is null or length(p_model) not between 1 and 100 or jsonb_typeof(p_versions) is distinct from 'object'
  or coalesce(p_versions->>'overnight_draft','') !~ '^[a-z0-9_.@-]{1,60}$' then return jsonb_build_object('status','invalid_request'); end if;
 select * into r from private.overnight_rounds where engagement_id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 if r.status in ('ready','ai_off','failed') then return jsonb_build_object('status','idle'); end if;
 if coalesce(e.settings->>'ai_enabled','false')<>'true' then
  update private.overnight_rounds set status='ai_off',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  update private.draft_outcomes set tidy='by_hand' where round_id=r.id and tidy='waiting';
  perform private.fac_notice(p_engagement,jsonb_build_object('kind','overnight','what','round'));
  return jsonb_build_object('status','off');
 end if;
 if r.status='drafting' and r.lease_until>t then return jsonb_build_object('status','busy'); end if;
 if r.status='pending' and r.last_failed_at is not null and r.last_failed_at>t-make_interval(secs=>30*greatest(r.attempts,1)) then
  return jsonb_build_object('status','cooling','ms',(extract(epoch from r.last_failed_at+make_interval(secs=>30*greatest(r.attempts,1))-t)*1000)::integer);
 end if;
 if r.lease_run is not null then update private.ai_runs set status='stale',finished_at=t where id=r.lease_run and status='running'; end if;
 select count(*)::integer into nb from private.outcome_indicators i join private.draft_outcomes d on d.outcome_id=i.outcome_id and d.engagement_id=i.engagement_id
  where d.round_id=r.id and not d.deleted and not i.deleted and length(btrim(i.text))>0;
 v_inputs:=jsonb_build_object('year',e.base_year+3,'horizon','3-year Vision',
  'outcomes',coalesce((select jsonb_agg(jsonb_build_object('ref','o'||z.ord,'id',z.id,'title',z.name,'description',z.description,
     'bullets',coalesce((select jsonb_agg(jsonb_build_object('ref','o'||z.ord||'b'||y.ord,'id',y.id,'text',left(y.text,280)) order by y.ord)
       from (select i.id,i.text,row_number() over(order by i.position,i.id) as ord from private.outcome_indicators i
         where i.outcome_id=z.outcome_id and i.engagement_id=z.engagement_id and not i.deleted and length(btrim(i.text))>0) y),'[]'::jsonb)) order by z.ord)
    from (select d.*,row_number() over(order by d.position,d.id) as ord from private.draft_outcomes d where d.round_id=r.id and not d.deleted) z),'[]'::jsonb),
  'cards',coalesce((select jsonb_agg(jsonb_build_object('ref','c'||q.ord,'id',q.id,'kind',q.kind,'text',left(q.text,600),'detail',q.detail-'owner','step',q.title) order by q.ord)
    from (select k.id,k.kind,k.text,k.detail,s.title,row_number() over(order by k.seq) as ord from private.scribe_cards k
      join public.sessions s on s.id=k.session_id and s.engagement_id=k.engagement_id where k.engagement_id=p_engagement and not k.deleted and s.part='Day 1' order by k.seq limit 150) q),'[]'::jsonb),
  'photos',coalesce((select jsonb_agg(jsonb_build_object('ref','p'||q.ord,'id',q.id,'step',q.title,'caption',left(q.name,120),'path',q.storage_path,'type',q.content_type,'bytes',q.bytes,
      'readable',q.content_type in ('image/jpeg','image/png','image/webp'),'typed',q.typed) order by q.ord)
    from (select f.id,f.name,f.content_type,f.bytes,f.storage_path,s.title,t.text as typed,row_number() over(order by f.seq) as ord from private.scribe_files f
      join public.sessions s on s.id=f.session_id and s.engagement_id=f.engagement_id left join private.draft_photo_texts t on t.file_id=f.id and not t.deleted
      where f.engagement_id=p_engagement and not f.deleted and f.kind='photo' and f.uploaded_at is not null and s.part='Day 1' order by f.seq limit 12) q),'[]'::jsonb));
 nc:=jsonb_array_length(v_inputs->'cards'); np:=jsonb_array_length(v_inputs->'photos');
 insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,created_at) values(p_engagement,null,'overnight_draft',p_model,p_versions->>'overnight_draft',v_inputs,t) returning id into v_run;
 update private.overnight_rounds set status='drafting',lease_id=p_lease,lease_run=v_run,lease_until=t+interval '8 minutes',inputs=jsonb_build_object('bullets',nb,'cards',nc,'photos',np) where id=r.id;
 return jsonb_build_object('status','claimed','run',v_run,'job','overnight_draft','prompt_version',p_versions->>'overnight_draft','inputs',v_inputs);
end $$;

-- A reference from the model, read back to what it stands for in the run's own inputs.
create function private.ov_ref(p_inputs jsonb,p_ref text) returns jsonb
language sql immutable security invoker set search_path='' as $$
 select coalesce(
  (select jsonb_build_object('kind','bullet','id',b->>'id','text',b->>'text','outcome',o->>'ref') from jsonb_array_elements(p_inputs->'outcomes') o
    cross join lateral jsonb_array_elements(o->'bullets') b where b->>'ref'=p_ref limit 1),
  (select jsonb_build_object('kind','card','id',c->>'id','text',concat_ws(' ',c->>'text',c->'detail'->>'why',c->'detail'->'views'->>0,c->'detail'->'views'->>1),'card_kind',c->>'kind')
    from jsonb_array_elements(p_inputs->'cards') c where c->>'ref'=p_ref limit 1),
  (select jsonb_build_object('kind','photo','id',p->>'id','text',coalesce(p->>'typed','')) from jsonb_array_elements(p_inputs->'photos') p where p->>'ref'=p_ref limit 1))
$$;

-- Apply the model's drafts under the rules that are code, never prompt: every bullet needs a source from this
-- run's own inputs; a number in a bullet must be in one of its sources; nothing quoted or filtered; the
-- room's exact words are kept for a bullet that rests on one room bullet; voices and tensions must be the
-- room's own words, word for word; an outcome already written by hand is left alone.
create function private.overnight_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.overnight_rounds; t timestamptz:=clock_timestamp(); o jsonb; b jsonb; s jsonb; v jsonb; src jsonb; did uuid; oref text; pos integer; txt text; kind text; have text[]; need text[];
 sources jsonb; rooms integer; room_row jsonb; excerpt text; refused jsonb:='[]'::jsonb; applied integer:=0; used text[]:=array[]::text[]; bid uuid; stext text; year text; nb integer; nn integer; seen text[];
 ref jsonb; p jsonb; v_ms integer; dest uuid; notes integer; note_text text; nd record; in_ jsonb;
begin
 if p_run is null or p_lease is null or jsonb_typeof(p_output) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into run from private.ai_runs where id=p_run and job='overnight_draft';
 if not found then return jsonb_build_object('status','missing'); end if;
 in_:=run.inputs; v_ms:=private.ai_usage(p_usage,'ms',600000)::integer;
 select * into r from private.overnight_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run or r.lease_until<t then
  return jsonb_build_object('status','stale'); end if;
 if coalesce((select e.settings->>'ai_enabled' from public.engagements e where e.id=run.engagement_id),'false')<>'true' then
  update private.ai_runs set status='discarded',finished_at=t,ms=v_ms where id=run.id;
  update private.overnight_rounds set status='ai_off',lease_id=null,lease_run=null,lease_until=null where id=r.id;
  update private.draft_outcomes set tidy='by_hand' where round_id=r.id and tidy='waiting';
  return jsonb_build_object('status','discarded');
 end if;
 year:=(in_->>'year');
 for o in select value from jsonb_array_elements(case when jsonb_typeof(p_output->'outcomes')='array' then p_output->'outcomes' else '[]'::jsonb end) loop
  oref:=o->>'outcome';
  select (x->>'id')::uuid into did from jsonb_array_elements(in_->'outcomes') x where x->>'ref'=oref;
  if did is null or oref=any(used) then continue; end if;
  used:=used||oref;
  if not exists(select 1 from private.draft_outcomes d where d.id=did and d.round_id=r.id and not d.deleted and d.tidy='waiting') then continue; end if;
  if exists(select 1 from private.draft_bullets x where x.draft_outcome_id=did and not x.deleted) then continue; end if;
  pos:=0; seen:=array[]::text[];
  for b in select value from jsonb_array_elements(case when jsonb_typeof(o->'bullets')='array' then o->'bullets' else '[]'::jsonb end) loop
   exit when pos>=12;
   txt:=btrim(regexp_replace(coalesce(b->>'text',''),'\s+',' ','g'));
   if length(txt) not between 1 and 280 or private.ai_quoted(txt) or private.screen_text(txt) then refused:=refused||jsonb_build_array(jsonb_build_object('outcome',oref,'reason','text')); continue; end if;
   if private.ov_norm(txt)=any(seen) then continue; end if;
   -- Its sources, each one from this run's own in_.
   sources:='[]'::jsonb; rooms:=0; room_row:=null; have:=array[]::text[];
   for s in select value from jsonb_array_elements(case when jsonb_typeof(b->'sources')='array' then b->'sources' else '[]'::jsonb end) loop
    ref:=private.ov_ref(in_,case when jsonb_typeof(s)='object' then s->>'ref' when jsonb_typeof(s)='string' then s#>>'{}' end);
    if ref is null then continue; end if;
    if ref->>'kind'='bullet' and ref->>'outcome'<>oref then continue; end if;
    if exists(select 1 from jsonb_array_elements(sources) x where x->>'id'=ref->>'id' and x->>'kind'=ref->>'kind') then continue; end if;
    stext:=ref->>'text';
    excerpt:=btrim(regexp_replace(case when jsonb_typeof(s)='object' then coalesce(s->>'excerpt','') else '' end,'\s+',' ','g'));
    if ref->>'kind' in ('bullet','card') then
     if excerpt<>'' and position(private.ov_norm(excerpt) in private.ov_norm(stext))=0 then excerpt:=''; end if;
    elsif ref->>'kind'='photo' then
     if private.ai_quoted(excerpt) or private.screen_text(excerpt) then excerpt:=''; end if;
    end if;
    excerpt:=left(excerpt,280);
    sources:=sources||jsonb_build_array(jsonb_build_object('kind',ref->>'kind','id',ref->>'id','excerpt',excerpt));
    if ref->>'kind' in ('card','photo') then have:=have||private.ai_numbers(stext||' '||case when ref->>'kind'='photo' then excerpt else '' end); end if;
    if ref->>'kind'='bullet' then rooms:=rooms+1; room_row:=ref; end if;
   end loop;
   if jsonb_array_length(sources)=0 then refused:=refused||jsonb_build_array(jsonb_build_object('outcome',oref,'reason','unsourced')); continue; end if;
   select coalesce(array_agg(n),array[]::text[]) into need from unnest(private.ai_numbers(txt)) n where n is distinct from year;
   kind:=case when rooms=1 and private.ov_norm(txt)=private.ov_norm(room_row->>'text') then 'room' else 'ai' end;
   if kind<>'room' and not need<@have then refused:=refused||jsonb_build_array(jsonb_build_object('outcome',oref,'reason','number')); continue; end if;
   insert into private.draft_bullets(engagement_id,draft_outcome_id,position,text,ai_text,room_text,origin)
    values(run.engagement_id,did,pos,txt,case when kind='ai' then txt end,case when rooms=1 then left(room_row->>'text',280) end,kind) returning id into bid;
   insert into private.draft_sources(engagement_id,draft_outcome_id,bullet_id,kind,ref_id,excerpt,position)
    select run.engagement_id,did,bid,x->>'kind',(x->>'id')::uuid,x->>'excerpt',(row_number() over())::integer-1 from jsonb_array_elements(sources) x;
   seen:=seen||private.ov_norm(txt); pos:=pos+1; applied:=applied+1;
  end loop;
  -- The voices not to lose and the tensions the room named: the room's own words, word for word, kept apart.
  for nd in select 'voice' as k, value as v from jsonb_array_elements(case when jsonb_typeof(o->'voices')='array' then o->'voices' else '[]'::jsonb end)
   union all select 'tension', value from jsonb_array_elements(case when jsonb_typeof(o->'tensions')='array' then o->'tensions' else '[]'::jsonb end) loop
   exit when (select count(*) from private.draft_notes n where n.draft_outcome_id=did and n.kind=nd.k and not n.deleted)>=3;
   if jsonb_typeof(nd.v) is distinct from 'object' then continue; end if;
   note_text:=btrim(regexp_replace(coalesce(nd.v->>'text',''),'\s+',' ','g'));
   ref:=private.ov_ref(in_,nd.v->>'source');
   if ref is null or ref->>'kind'='photo' or length(note_text) not between 1 and 400 or private.screen_text(note_text) then continue; end if;
   if ref->>'kind'='bullet' and ref->>'outcome'<>oref then continue; end if;
   if nd.k='voice' and ref->>'kind'='card' and ref->>'card_kind' not in ('quote','decision') then continue; end if;
   if nd.k='tension' and ref->>'kind'='card' and ref->>'card_kind' not in ('tension','question') then continue; end if;
   if nd.k='tension' and ref->>'kind'='bullet' then continue; end if;
   if position(private.ov_norm(note_text) in private.ov_norm(ref->>'text'))=0 then continue; end if;
   if exists(select 1 from private.draft_notes n where n.draft_outcome_id=did and n.kind=nd.k and not n.deleted and private.ov_norm(n.text)=private.ov_norm(note_text)) then continue; end if;
   insert into private.draft_notes(engagement_id,draft_outcome_id,kind,text,source_kind,source_id,position)
    values(run.engagement_id,did,nd.k,note_text,ref->>'kind',(ref->>'id')::uuid,(select count(*)::integer from private.draft_notes n where n.draft_outcome_id=did and n.kind=nd.k and not n.deleted));
  end loop;
  -- A photo the model could not read, for the outcome it belongs to.
  for p in select value from jsonb_array_elements(case when jsonb_typeof(p_output->'unreadable')='array' then p_output->'unreadable' else '[]'::jsonb end) loop
   if jsonb_typeof(p)='object' and p->>'outcome'=oref then
    ref:=private.ov_ref(in_,p->>'photo');
    if ref->>'kind'='photo' and not (ref->>'id')::uuid=any((select unreadable from private.draft_outcomes where id=did)) then
     update private.draft_outcomes set unreadable=unreadable||(ref->>'id')::uuid where id=did;
    end if;
   end if;
  end loop;
 end loop;
 -- A photo no one could read (a format the model does not take, or one it named with no outcome) is flagged for the whole review.
 update private.overnight_rounds set unreadable=coalesce((select array_agg(distinct (x->>'id')::uuid) from jsonb_array_elements(in_->'photos') x
   where (x->>'readable')::boolean is not true and not exists(select 1 from private.draft_photo_texts t where t.file_id=(x->>'id')::uuid and not t.deleted)
    or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(p_output->'unreadable')='array' then p_output->'unreadable' else '[]'::jsonb end) u
      where jsonb_typeof(u)='object' and u->>'photo'=x->>'ref' and coalesce(u->>'outcome','')='' and not exists(select 1 from private.draft_photo_texts t where t.file_id=(x->>'id')::uuid and not t.deleted))),array[]::uuid[]) where id=r.id;
 for nd in select d.id from private.draft_outcomes d where d.round_id=r.id and not d.deleted and d.tidy='waiting' loop
  update private.draft_outcomes set tidy='tidied',revision=revision+1 where id=nd.id;
  perform private.ov_version(nd.id,'ai','Tidied from '||coalesce(r.inputs->>'bullets','0')||' bullets, '||coalesce(r.inputs->>'cards','0')||' scribe cards and '||coalesce(r.inputs->>'photos','0')||' easel photos',null);
 end loop;
 update private.ai_runs set status='ok',changed=applied>0,finished_at=t,ms=v_ms,output=jsonb_build_object('result',p_output,'applied',applied,'refused',refused),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 update private.overnight_rounds set status='ready',ready_at=t,lease_id=null,lease_run=null,lease_until=null,last_error=null where id=r.id;
 perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','overnight','what','ready'));
 return jsonb_build_object('status','ok','changed',applied>0,'applied',applied,'refused',jsonb_array_length(refused));
end $$;

create function private.overnight_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.ai_runs; r private.overnight_rounds; t timestamptz:=clock_timestamp(); v_ms integer:=private.ai_usage(p_usage,'ms',600000)::integer; gave_up boolean;
begin
 select * into run from private.ai_runs where id=p_run and job='overnight_draft';
 if not found or p_lease is null then return jsonb_build_object('status','missing'); end if;
 select * into r from private.overnight_rounds where engagement_id=run.engagement_id and not deleted for update;
 if not found or run.status<>'running' or r.lease_id is distinct from p_lease or r.lease_run is distinct from p_run then return jsonb_build_object('status','stale'); end if;
 update private.ai_runs set status='failed',finished_at=t,ms=v_ms,error=left(coalesce(p_error,'failed'),200),
  input_tokens=private.ai_usage(p_usage,'input_tokens',10000000)::integer,output_tokens=private.ai_usage(p_usage,'output_tokens',10000000)::integer,cost_usd=private.ai_usage(p_usage,'cost_usd',1000) where id=run.id;
 gave_up:=r.attempts+1>=3;
 update private.overnight_rounds set status=case when gave_up then 'failed' else 'pending' end,attempts=attempts+1,lease_id=null,lease_run=null,lease_until=null,
  last_failed_at=t,last_error=left(coalesce(p_error,'failed'),200) where id=r.id;
 if gave_up then update private.draft_outcomes set tidy='by_hand' where round_id=r.id and tidy='waiting'; end if;
 perform private.fac_notice(run.engagement_id,jsonb_build_object('kind','overnight','what','round'));
 return jsonb_build_object('status','ok','gave_up',gave_up);
end $$;

-- ---------- Public entry points (invokers; the checks are in the private functions) ----------
create function public.overnight_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.overnight_state(p_engagement) $$;
create function public.overnight_summary(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.overnight_summary(p_engagement) $$;
create function public.overnight_versions(p_engagement uuid,p_outcome uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.overnight_versions(p_engagement,p_outcome) $$;
create function public.overnight_presence(p_engagement uuid,p_place text,p_editing boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_presence(p_engagement,p_place,p_editing) $$;
create function public.overnight_edit(p_engagement uuid,p_outcome uuid,p_revision integer,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_edit(p_engagement,p_outcome,p_revision,p) $$;
create function public.overnight_restore_words(p_engagement uuid,p_outcome uuid,p_bullet uuid,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_restore_words(p_engagement,p_outcome,p_bullet,p_revision) $$;
create function public.overnight_remove(p_engagement uuid,p_outcome uuid,p_bullet uuid,p_removed boolean,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_remove(p_engagement,p_outcome,p_bullet,p_removed,p_revision) $$;
create function public.overnight_source(p_engagement uuid,p_outcome uuid,p_bullet uuid,p_kind text,p_ref uuid,p_add boolean,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_source(p_engagement,p_outcome,p_bullet,p_kind,p_ref,p_add,p_revision) $$;
create function public.overnight_add_room_bullet(p_engagement uuid,p_outcome uuid,p_indicator uuid,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_add_room_bullet(p_engagement,p_outcome,p_indicator,p_revision) $$;
create function public.overnight_accept(p_engagement uuid,p_outcome uuid,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_accept(p_engagement,p_outcome,p_revision) $$;
create function public.overnight_ack_thin(p_engagement uuid,p_outcome uuid,p_value boolean) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_ack_thin(p_engagement,p_outcome,p_value) $$;
create function public.overnight_restore_version(p_engagement uuid,p_outcome uuid,p_version integer,p_revision integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_restore_version(p_engagement,p_outcome,p_version,p_revision) $$;
create function public.overnight_photo_text(p_engagement uuid,p_file uuid,p_text text) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_photo_text(p_engagement,p_file,p_text) $$;
create function public.overnight_start(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_start(p_engagement) $$;
create function public.overnight_by_hand(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_by_hand(p_engagement) $$;
create function public.overnight_publish(p_engagement uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_publish(p_engagement,p_id) $$;
create function public.overnight_unpublish(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_unpublish(p_engagement) $$;
create function public.overnight_published(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.overnight_published(p_engagement) $$;
-- The server's worker only (service role).
create function public.overnight_due(p_engagement uuid) returns boolean
language sql stable security invoker set search_path='' as $$ select private.overnight_due(p_engagement) $$;
create function public.overnight_claim(p_engagement uuid,p_lease uuid,p_model text,p_versions jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_claim(p_engagement,p_lease,p_model,p_versions) $$;
create function public.overnight_apply(p_run uuid,p_lease uuid,p_output jsonb,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_apply(p_run,p_lease,p_output,p_usage) $$;
create function public.overnight_fail(p_run uuid,p_lease uuid,p_error text,p_usage jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.overnight_fail(p_run,p_lease,p_error,p_usage) $$;

revoke all on function private.draft_version_keep(),private.ov_norm(text),private.ov_first(uuid),private.ov_facilitates(uuid),private.ov_lead(uuid),private.ov_holder(uuid,uuid),
 private.ov_source_text(uuid,text,uuid,text),private.ov_bullet_flag(uuid),private.ov_snapshot(uuid),private.ov_version(uuid,text,text,uuid),private.ov_open(uuid),
 private.overnight_day1_closed(),private.draft_outcome_cascade(),private.ov_outcome_json(uuid,uuid),private.ov_check(uuid),private.ov_write_check(uuid,uuid,integer),private.ov_changed(uuid,uuid,text,text),
 private.ov_ref(jsonb,text),
 private.overnight_state(uuid),private.overnight_summary(uuid),private.overnight_versions(uuid,uuid),private.overnight_presence(uuid,text,boolean),
 private.overnight_edit(uuid,uuid,integer,jsonb),private.overnight_restore_words(uuid,uuid,uuid,integer),private.overnight_remove(uuid,uuid,uuid,boolean,integer),
 private.overnight_source(uuid,uuid,uuid,text,uuid,boolean,integer),private.overnight_add_room_bullet(uuid,uuid,uuid,integer),private.overnight_accept(uuid,uuid,integer),
 private.overnight_ack_thin(uuid,uuid,boolean),private.overnight_restore_version(uuid,uuid,integer,integer),private.overnight_photo_text(uuid,uuid,text),
 private.overnight_start(uuid),private.overnight_by_hand(uuid),private.overnight_publish(uuid,uuid),private.overnight_unpublish(uuid),private.overnight_published(uuid),
 private.overnight_due(uuid),private.overnight_claim(uuid,uuid,text,jsonb),private.overnight_apply(uuid,uuid,jsonb,jsonb),private.overnight_fail(uuid,uuid,text,jsonb),
 public.overnight_state(uuid),public.overnight_summary(uuid),public.overnight_versions(uuid,uuid),public.overnight_presence(uuid,text,boolean),
 public.overnight_edit(uuid,uuid,integer,jsonb),public.overnight_restore_words(uuid,uuid,uuid,integer),public.overnight_remove(uuid,uuid,uuid,boolean,integer),
 public.overnight_source(uuid,uuid,uuid,text,uuid,boolean,integer),public.overnight_add_room_bullet(uuid,uuid,uuid,integer),public.overnight_accept(uuid,uuid,integer),
 public.overnight_ack_thin(uuid,uuid,boolean),public.overnight_restore_version(uuid,uuid,integer,integer),public.overnight_photo_text(uuid,uuid,text),
 public.overnight_start(uuid),public.overnight_by_hand(uuid),public.overnight_publish(uuid,uuid),public.overnight_unpublish(uuid),public.overnight_published(uuid),
 public.overnight_due(uuid),public.overnight_claim(uuid,uuid,text,jsonb),public.overnight_apply(uuid,uuid,jsonb,jsonb),public.overnight_fail(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.ov_facilitates(uuid),private.ov_lead(uuid),
 private.overnight_state(uuid),private.overnight_summary(uuid),private.overnight_versions(uuid,uuid),private.overnight_presence(uuid,text,boolean),
 private.overnight_edit(uuid,uuid,integer,jsonb),private.overnight_restore_words(uuid,uuid,uuid,integer),private.overnight_remove(uuid,uuid,uuid,boolean,integer),
 private.overnight_source(uuid,uuid,uuid,text,uuid,boolean,integer),private.overnight_add_room_bullet(uuid,uuid,uuid,integer),private.overnight_accept(uuid,uuid,integer),
 private.overnight_ack_thin(uuid,uuid,boolean),private.overnight_restore_version(uuid,uuid,integer,integer),private.overnight_photo_text(uuid,uuid,text),
 private.overnight_start(uuid),private.overnight_by_hand(uuid),private.overnight_publish(uuid,uuid),private.overnight_unpublish(uuid),private.overnight_published(uuid),
 public.overnight_state(uuid),public.overnight_summary(uuid),public.overnight_versions(uuid,uuid),public.overnight_presence(uuid,text,boolean),
 public.overnight_edit(uuid,uuid,integer,jsonb),public.overnight_restore_words(uuid,uuid,uuid,integer),public.overnight_remove(uuid,uuid,uuid,boolean,integer),
 public.overnight_source(uuid,uuid,uuid,text,uuid,boolean,integer),public.overnight_add_room_bullet(uuid,uuid,uuid,integer),public.overnight_accept(uuid,uuid,integer),
 public.overnight_ack_thin(uuid,uuid,boolean),public.overnight_restore_version(uuid,uuid,integer,integer),public.overnight_photo_text(uuid,uuid,text),
 public.overnight_start(uuid),public.overnight_by_hand(uuid),public.overnight_publish(uuid,uuid),public.overnight_unpublish(uuid),public.overnight_published(uuid) to authenticated;
grant execute on function private.overnight_due(uuid),private.overnight_claim(uuid,uuid,text,jsonb),private.overnight_apply(uuid,uuid,jsonb,jsonb),private.overnight_fail(uuid,uuid,text,jsonb),
 public.overnight_due(uuid),public.overnight_claim(uuid,uuid,text,jsonb),public.overnight_apply(uuid,uuid,jsonb,jsonb),public.overnight_fail(uuid,uuid,text,jsonb) to service_role;

commit;
