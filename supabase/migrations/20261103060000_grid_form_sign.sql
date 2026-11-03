-- Milestone 3, step 3: the 2x2 grid (INT-08), the private form (INT-09) and sign
-- together (INT-10). Live only, after merge and Chris's approval. No session is started
-- and no data is seeded.
--
-- Each kind registers itself and supplies its own functions, found by name by the
-- engine (step 1). Nothing shared is redefined. Two controls of their own:
--   private.grid_control  merge one grid item into another, and undo it
--   private.sign_control  close signing (Reopen is the engine's own), unhide a name with its signature
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('grid','2x2 grid',true,true,'people',true,true,'key','never',80),
 ('form','Private form',true,true,'people',true,false,'none','never',90),
 ('sign','Sign together',true,true,'people',true,true,'id','always',100);

-- ---------- INT-08 2x2 grid ----------
-- Options: the two axes, their end labels, the legend title and up to ten items. A grid
-- holds ten items at most, so no two items ever share a color from the item palette.
create function private.options_grid(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb:='[]'::jsonb; o jsonb; k text; t text; keys text[]:=array[]::text[]; texts text[]:=array[]::text[];
begin
 if p_engagement is null or jsonb_typeof(p) is distinct from 'object' then return null; end if;
 if exists(select 1 from jsonb_object_keys(p) f where f not in ('preset','x_label','x_low','x_high','y_label','y_low','y_high','legend','items')) then return null; end if;
 if exists(select 1 from jsonb_each(p-'items') f(k,v) where jsonb_typeof(v) not in ('string','null')) then return null; end if;
 if coalesce(p->>'preset','custom') not in ('custom','pre_mortem') then return null; end if;
 if length(coalesce(p->>'x_label',''))>40 or length(coalesce(p->>'y_label',''))>40 or length(coalesce(p->>'legend',''))>40
  or length(coalesce(p->>'x_low',''))>30 or length(coalesce(p->>'x_high',''))>30 or length(coalesce(p->>'y_low',''))>30 or length(coalesce(p->>'y_high',''))>30 then return null; end if;
 if p ? 'items' and jsonb_typeof(p->'items') is distinct from 'array' then return null; end if;
 if jsonb_array_length(coalesce(p->'items','[]'::jsonb))>10 then return null; end if;
 for o in select v from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) v loop
  if jsonb_typeof(o) is distinct from 'object' or exists(select 1 from jsonb_object_keys(o) f where f not in ('key','text')) then return null; end if;
  if jsonb_typeof(o->'key') is distinct from 'string' or jsonb_typeof(o->'text') is distinct from 'string' then return null; end if;
  k:=o->>'key'; t:=btrim(regexp_replace(o->>'text','\s+',' ','g'));
  -- A line left empty in the editor is dropped, not refused.
  continue when length(t)=0;
  if k !~ '^[a-z0-9]{1,24}$' or length(t) not between 1 and 120 or k=any(keys) or lower(t)=any(texts) then return null; end if;
  keys:=keys||k; texts:=texts||lower(t);
  items:=items||jsonb_build_array(jsonb_build_object('key',k,'text',t));
 end loop;
 return jsonb_strip_nulls(jsonb_build_object('preset',case when p->>'preset'='pre_mortem' then 'pre_mortem' end,
  'x_label',nullif(btrim(coalesce(p->>'x_label','')),''),'x_low',nullif(btrim(coalesce(p->>'x_low','')),''),'x_high',nullif(btrim(coalesce(p->>'x_high','')),''),
  'y_label',nullif(btrim(coalesce(p->>'y_label','')),''),'y_low',nullif(btrim(coalesce(p->>'y_low','')),''),'y_high',nullif(btrim(coalesce(p->>'y_high','')),''),
  'legend',nullif(btrim(coalesce(p->>'legend','')),'')))||jsonb_build_object('items',items);
end $$;

-- One answer per person holds the person's whole set of placements: {places: {key: [x, y]}},
-- x and y from 0 to 1. The phone sends the whole set on each placement as a change.
create function private.grid_value(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb:=case when jsonb_typeof(p_session.options->'items')='array' then p_session.options->'items' else '[]'::jsonb end;
 place record; label text; x numeric; y numeric; placed jsonb:='{}'::jsonb; answers jsonb:='[]'::jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'places') is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_value) f where f<>'places') then return jsonb_build_object('status','invalid_answer'); end if;
 if (select count(*) from jsonb_object_keys(p_value->'places'))>10 then return jsonb_build_object('status','invalid_answer'); end if;
 for place in select t.k,t.v,o.n from jsonb_each(p_value->'places') t(k,v) left join lateral (select n from jsonb_array_elements(items) with ordinality e(i,n) where e.i->>'key'=t.k) o on true order by o.n loop
  select i->>'text' into label from jsonb_array_elements(items) i where i->>'key'=place.k;
  if label is null or jsonb_typeof(place.v) is distinct from 'array' or jsonb_array_length(place.v)<>2
   or jsonb_typeof(place.v->0) is distinct from 'number' or jsonb_typeof(place.v->1) is distinct from 'number' then return jsonb_build_object('status','invalid_answer'); end if;
  x:=(place.v->>0)::numeric; y:=(place.v->>1)::numeric;
  if x not between 0 and 1 or y not between 0 and 1 then return jsonb_build_object('status','invalid_answer'); end if;
  placed:=placed||jsonb_build_object(place.k,jsonb_build_array(round(x,4)::float8,round(y,4)::float8));
  answers:=answers||jsonb_build_array(jsonb_build_object('key',place.k,'text',label));
 end loop;
 if jsonb_array_length(answers)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 return jsonb_build_object('status','ok','text',jsonb_array_length(answers)||' of '||jsonb_array_length(items)||' placed','answers',answers,'value',jsonb_build_object('places',placed));
end $$;

-- Merges made on the control surface: a duplicate item's placements count toward the
-- survivor, until undone. A person who placed both counts once, at the mean of the two.
create table private.grid_merges (
 id uuid primary key default gen_random_uuid(),
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 item_key text not null check(item_key ~ '^[a-z0-9]{1,24}$'),
 into_key text not null check(into_key ~ '^[a-z0-9]{1,24}$' and into_key<>item_key),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create unique index grid_merges_item_idx on private.grid_merges(session_id,item_key) where not deleted;
create index grid_merges_engagement_idx on private.grid_merges(engagement_id);
create index grid_merges_session_engagement_idx on private.grid_merges(session_id,engagement_id);
alter table private.grid_merges enable row level security;
alter table private.grid_merges force row level security;
revoke all on private.grid_merges from public,anon,authenticated;
grant select,insert,update,delete on private.grid_merges to service_role;
create trigger touch_record before update on private.grid_merges for each row execute function private.touch_live_record('id');

-- Every number on the grid, computed once: each item's people, its mean position (x and y
-- averaged separately) and, once two people have placed it, each placement for the faint
-- dots. A placement is named only by the first eight characters of its answer id.
create function private.results_grid(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with listed as (
  select i->>'key' as key,i->>'text' as text,n::integer as num
  from public.sessions s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.options->'items')='array' then s.options->'items' else '[]'::jsonb end) with ordinality t(i,n)
  where s.id=p_session and s.engagement_id=p_engagement
 ), merges as (
  select item_key,into_key from private.grid_merges where session_id=p_session and engagement_id=p_engagement and not deleted
 ), raw as (
  select x.id,x.attendee_id,p.key as item,(p.value->>0)::float8 as px,(p.value->>1)::float8 as py
  from public.submissions x cross join lateral jsonb_each(case when jsonb_typeof(x.value->'places')='object' then x.value->'places' else '{}'::jsonb end) p
  where x.engagement_id=p_engagement and x.session_id=p_session and not x.deleted and not x.withdrawn and not x.hidden and jsonb_typeof(p.value)='array'
 ), placed as (
  select raw.id,raw.attendee_id,coalesce(m.into_key,raw.item) as key,avg(raw.px) as px,avg(raw.py) as py
  from raw join listed l on l.key=raw.item left join merges m on m.item_key=raw.item
  where not (raw.item=any(p_hidden)) and not (coalesce(m.into_key,raw.item)=any(p_hidden))
  group by raw.id,raw.attendee_id,coalesce(m.into_key,raw.item)
 ), stats as (
  select key,count(*)::integer as n,avg(px) as mx,avg(py) as my,
   jsonb_agg(jsonb_build_array(left(id::text,8),round(px::numeric,3)::float8,round(py::numeric,3)::float8) order by id) as places
  from placed group by key
 )
 select jsonb_build_object('total',(select count(*) from placed),'people',(select count(distinct attendee_id) from placed),
  'items',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',l.key,'num',l.num,'text',l.text,'count',coalesce(st.n,0),
    'x',case when st.n>0 and m.into_key is null then round(st.mx::numeric,4)::float8 end,'y',case when st.n>0 and m.into_key is null then round(st.my::numeric,4)::float8 end,
    'places',case when st.n>=2 and m.into_key is null then st.places end,'into',m.into_key)) order by l.num)
   from listed l left join merges m on m.item_key=l.key left join stats st on st.key=l.key where not (l.key=any(p_hidden))),'[]'::jsonb))
$$;

-- The control surface: each item with its people, hidden or merged.
create function private.items_grid(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with r as (select private.results_grid(s.engagement_id,s.id,array[]::text[]) as res from public.sessions s where s.id=p_session)
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key',i->>'key','text',i->>'text','num',(i->>'num')::integer,'count',(i->>'count')::integer,
   'hidden',(i->>'key')=any(p_hidden),'into',i->>'into')) order by (i->>'num')::integer),'[]'::jsonb)
 from r cross join lateral jsonb_array_elements(r.res->'items') i
$$;

-- ---------- INT-09 Private form ----------
-- Options: up to eight questions, each answered in words.
create function private.options_form(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare questions jsonb:='[]'::jsonb; o jsonb; k text; t text; keys text[]:=array[]::text[];
begin
 if p_engagement is null or jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) f where f<>'questions') then return null; end if;
 if p ? 'questions' and jsonb_typeof(p->'questions') is distinct from 'array' then return null; end if;
 if jsonb_array_length(coalesce(p->'questions','[]'::jsonb))>8 then return null; end if;
 for o in select v from jsonb_array_elements(coalesce(p->'questions','[]'::jsonb)) v loop
  if jsonb_typeof(o) is distinct from 'object' or exists(select 1 from jsonb_object_keys(o) f where f not in ('key','text'))
   or jsonb_typeof(o->'key') is distinct from 'string' or jsonb_typeof(o->'text') is distinct from 'string' then return null; end if;
  k:=o->>'key'; t:=btrim(o->>'text');
  continue when length(t)=0;
  if k !~ '^[a-z0-9]{1,24}$' or length(t) not between 1 and 300 or k=any(keys) then return null; end if;
  keys:=keys||k;
  questions:=questions||jsonb_build_array(jsonb_build_object('key',k,'text',t));
 end loop;
 return jsonb_build_object('questions',questions);
end $$;

-- One answer per person: {answers: {question key: text}}. Answers never reach the TV or
-- other phones (the kind does not share answers), so they are not screened for the TV:
-- a private answer to the facilitators can say what it needs to.
create function private.form_value(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare questions jsonb:=case when jsonb_typeof(p_session.options->'questions')='array' then p_session.options->'questions' else '[]'::jsonb end;
 a record; t text; out jsonb:='{}'::jsonb; n integer:=0;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'answers') is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(p_value) f where f<>'answers') then return jsonb_build_object('status','invalid_answer'); end if;
 for a in select k,v from jsonb_each(p_value->'answers') t(k,v) loop
  if not exists(select 1 from jsonb_array_elements(questions) q where q->>'key'=a.k) or jsonb_typeof(a.v) is distinct from 'string' then return jsonb_build_object('status','invalid_answer'); end if;
  t:=btrim(a.v#>>'{}');
  if length(t)>1000 then return jsonb_build_object('status','limit'); end if;
  if length(t)>0 then out:=out||jsonb_build_object(a.k,t); n:=n+1; end if;
 end loop;
 if n=0 then return jsonb_build_object('status','invalid_answer'); end if;
 return jsonb_build_object('status','ok','text','Answered '||n||' of '||jsonb_array_length(questions),'answers','[]'::jsonb,'value',jsonb_build_object('answers',out));
end $$;

create function private.results_form(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total',count(*),'people',count(distinct attendee_id))
 from public.submissions where engagement_id=p_engagement and session_id=p_session and not deleted and not withdrawn
$$;

-- Facilitators only (control_status checks the role): each person's answers, with the
-- person's name, in the order they arrived. Nothing here is ever broadcast.
create function private.items_form(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',x.id,'text',btrim(a.name),'count',(select count(*) from jsonb_object_keys(coalesce(x.value->'answers','{}'::jsonb))),'hidden',false,
   'at',x.server_received_at,'answers',coalesce((select jsonb_agg(jsonb_build_object('question',q->>'text','text',x.value->'answers'->>(q->>'key')) order by n)
     from public.sessions s cross join lateral jsonb_array_elements(case when jsonb_typeof(s.options->'questions')='array' then s.options->'questions' else '[]'::jsonb end) with ordinality t(q,n)
     where s.id=p_session and x.value->'answers' ? (q->>'key')),'[]'::jsonb)) order by x.server_received_at,x.id),'[]'::jsonb)
 from (select * from public.submissions where session_id=p_session and not deleted and not withdrawn order by server_received_at,id limit 500) x
 join public.attendees a on a.id=x.attendee_id
$$;

-- ---------- INT-10 Sign together ----------
-- Options: the full text to read, with "## Title" sections the phone expands.
create function private.options_sign(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_engagement is null or jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) f where f<>'text') then return null; end if;
 if p ? 'text' and jsonb_typeof(p->'text') not in ('string','null') then return null; end if;
 if length(coalesce(p->>'text',''))>20000 then return null; end if;
 return jsonb_strip_nulls(jsonb_build_object('text',nullif(btrim(coalesce(p->>'text','')),'')));
end $$;

-- A finger signature: {strokes: ["M12 34L13 35...", ...]} in a 600 by 200 field. The name is
-- read from the signed-in attendee, never from the phone, so no one can sign as another.
create function private.sign_value(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_name text; s jsonb; total integer:=0; strokes jsonb:='[]'::jsonb;
begin
 select btrim(a.name) into v_name from public.attendees a where a.engagement_id=p_session.engagement_id and a.id in(select private.room_attendee_ids()) limit 1;
 if v_name is null or length(v_name)=0 then return jsonb_build_object('status','invalid_answer'); end if;
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'strokes') is distinct from 'array'
  or exists(select 1 from jsonb_object_keys(p_value) f where f<>'strokes') then return jsonb_build_object('status','invalid_answer'); end if;
 if jsonb_array_length(p_value->'strokes') not between 1 and 60 then return jsonb_build_object('status','invalid_answer'); end if;
 for s in select v from jsonb_array_elements(p_value->'strokes') v loop
  if jsonb_typeof(s) is distinct from 'string' or (s#>>'{}') !~ '^M[0-9]{1,3} [0-9]{1,3}(L[0-9]{1,3} [0-9]{1,3})*$' then return jsonb_build_object('status','invalid_answer'); end if;
  total:=total+length(s#>>'{}');
  if total>7600 then return jsonb_build_object('status','limit'); end if;
  if exists(select 1 from regexp_matches(s#>>'{}','([0-9]+) ([0-9]+)','g') m where m[1]::integer>600 or m[2]::integer>200) then return jsonb_build_object('status','invalid_answer'); end if;
  strokes:=strokes||jsonb_build_array(s);
 end loop;
 return jsonb_build_object('status','ok','text',left(v_name,200),'answers','[]'::jsonb,'value',jsonb_build_object('name',left(v_name,200),'strokes',strokes));
end $$;

-- The names in the order people signed, without the strokes: the strokes travel once,
-- with each answer, never with every version's results.
create function private.results_sign(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('total',count(*),'people',count(distinct attendee_id),
  'signers',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(value->>'name',text)) order by created_at,id),'[]'::jsonb))
 from public.submissions where engagement_id=p_engagement and session_id=p_session and not deleted and not withdrawn and not hidden
$$;

create function private.items_sign(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',id,'text',coalesce(value->>'name',text),'count',1,'hidden',hidden,'at',created_at) order by created_at,id),'[]'::jsonb)
 from (select * from public.submissions where session_id=p_session and not deleted and not withdrawn order by created_at,id limit 500) x
$$;

-- ---------- Controls of their own, following room_control ----------
-- Merge a duplicate grid item into another, or undo it. Room row lock first, facilitator
-- check, the client's id for idempotency, one version and one broadcast.
create function private.grid_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; done private.room_controls; v_item text; v_into text; keys text[]; who text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('merge','unmerge') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>'grid_'||p_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
 if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
 select * into cur from public.sessions where id=r.live_session_id and not deleted for update;
 if cur.id is null or cur.interaction<>'grid' then return jsonb_build_object('status','invalid_state'); end if;
 select coalesce(array_agg(i->>'key'),array[]::text[]) into keys from jsonb_array_elements(case when jsonb_typeof(cur.options->'items')='array' then cur.options->'items' else '[]'::jsonb end) i;
 v_item:=p->>'item';
 if v_item is null or not (v_item=any(keys)) then return jsonb_build_object('status','missing'); end if;
 if p_action='merge' then
  v_into:=p->>'into';
  if v_into is null or not (v_into=any(keys)) or v_into=v_item then return jsonb_build_object('status','missing'); end if;
  -- One step only: a merged item cannot take others, and a survivor cannot be merged.
  if exists(select 1 from private.grid_merges where session_id=cur.id and not deleted and (item_key in (v_item,v_into) or into_key=v_item)) then return jsonb_build_object('status','invalid_state'); end if;
  insert into private.grid_merges(engagement_id,session_id,item_key,into_key) values(p_engagement,cur.id,v_item,v_into);
 else
  update private.grid_merges set deleted=true where session_id=cur.id and item_key=v_item and not deleted;
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
 end if;
 update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),'grid_'||p_action,cur.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','grid_'||p_action,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

-- Close signing on the step that is live: nothing more arrives and the TV shows Closed. The
-- engine's Reopen opens it again. Unhide a name with its signature: the engine's own Unhide
-- sends an answer back without its value, so a TV would get the name but not the strokes
-- until its next fresh snapshot. This one sends the whole answer in the same version.
create function private.sign_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; cur public.sessions; done private.room_controls; who text; v_action text; v_item uuid; v_ids uuid[];
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('close','unhide') or jsonb_typeof(p) is distinct from 'object' then return jsonb_build_object('status','invalid_request'); end if;
 v_action:=case when p_action='close' then 'close_signing' else 'sign_unhide' end;
 select * into done from private.room_controls where id=p_id;
 if found then
  if done.engagement_id<>p_engagement or done.action<>v_action then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status','duplicate','version',r.version);
 end if;
 if not (p ? 'from') or (p->>'from' is not null and p->>'from' !~ '^[0-9a-f-]{36}$') then return jsonb_build_object('status','invalid_request'); end if;
 if (p->>'from')::uuid is distinct from r.live_session_id then return jsonb_build_object('status','moved','version',r.version,'live_session_id',r.live_session_id); end if;
 select * into cur from public.sessions where id=r.live_session_id and not deleted for update;
 if cur.id is null or cur.interaction<>'sign' then return jsonb_build_object('status','invalid_state'); end if;
 if p_action='close' then
  if cur.state not in ('live','phones_down') then return jsonb_build_object('status','unchanged','version',r.version); end if;
  update public.sessions set state='closed',closed_at=clock_timestamp() where id=cur.id;
  update public.room_states set phones_down=false,burst_ends_at=null,results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 else
  if p->>'item' is null or p->>'item' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return jsonb_build_object('status','invalid_request'); end if;
  v_item:=(p->>'item')::uuid;
  if not exists(select 1 from public.submissions where id=v_item and session_id=cur.id and not deleted and not withdrawn) then return jsonb_build_object('status','missing'); end if;
  update public.submissions set hidden=false where id=v_item and hidden;
  if not found then return jsonb_build_object('status','unchanged','version',r.version); end if;
  v_ids:=coalesce((select array_agg(x.id order by x.id) from public.submissions x where x.session_id=cur.id and x.hidden and not x.deleted),array[]::uuid[]);
  perform set_config('clearway.live_answer',(select jsonb_build_object('id',x.id,'session_id',x.session_id,'revision',x.revision,'withdrawn',false,'hidden',false,
    'text',x.text,'answers',x.answers,'value',x.value) from public.submissions x where x.id=v_item)::text,true);
  update public.room_states set hidden_ids=v_ids,results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
  perform set_config('clearway.live_answer','',true);
 end if;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),v_action,cur.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action',v_action,'by',who,'version',r.version,'changed',true));
 return jsonb_build_object('status','ok','version',r.version);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

create function public.grid_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.grid_control(p_engagement,p_id,p_action,p) $$;
create function public.sign_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.sign_control(p_engagement,p_id,p_action,p) $$;

-- The engine's parse_<kind> entry points. Structured kinds read only the value; the text
-- they store is made on the server.
create function private.parse_grid(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.grid_value(p_session,p_value) $$;
create function private.parse_form(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.form_value(p_session,p_value) $$;
create function private.parse_sign(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.sign_value(p_session,p_value) $$;

revoke all on function private.options_grid(jsonb,uuid),private.grid_value(public.sessions,jsonb),private.parse_grid(public.sessions,text,jsonb),private.results_grid(uuid,uuid,text[]),private.items_grid(uuid,text[]),
 private.options_form(jsonb,uuid),private.form_value(public.sessions,jsonb),private.parse_form(public.sessions,text,jsonb),private.results_form(uuid,uuid,text[]),private.items_form(uuid,text[]),
 private.options_sign(jsonb,uuid),private.sign_value(public.sessions,jsonb),private.parse_sign(public.sessions,text,jsonb),private.results_sign(uuid,uuid,text[]),private.items_sign(uuid,text[]),
 private.grid_control(uuid,uuid,text,jsonb),private.sign_control(uuid,uuid,text,jsonb),public.grid_control(uuid,uuid,text,jsonb),public.sign_control(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.grid_control(uuid,uuid,text,jsonb),private.sign_control(uuid,uuid,text,jsonb),public.grid_control(uuid,uuid,text,jsonb),public.sign_control(uuid,uuid,text,jsonb) to authenticated;
commit;
