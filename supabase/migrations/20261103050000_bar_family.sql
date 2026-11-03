-- Milestone 3, step 2: the bar family. Multiple choice (INT-04), scale (INT-05), ranking
-- with Add an option (INT-06), 100 points (INT-07) and statements (INT-17).
-- Live only, after merge and Chris's approval. No session is started and no data is seeded.
--
-- Each kind registers itself and supplies its own parse_, results_, options_ and items_
-- functions (milestone-3-brief.md). Nothing shared is redefined. Every number the TV shows
-- (counts, percentages, averages, average places, shares, the cut line) is computed here.
-- Each kind is one answer per person, counted by people, structured, and spotlit by option key.
begin;

insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position) values
 ('choice','Multiple choice',true,true,'people',true,true,'key','never',40),
 ('scale','Scale',true,true,'people',true,true,'key','never',50),
 ('ranking','Ranking',true,true,'people',true,true,'key','never',60),
 ('points','100 points',true,true,'people',true,true,'key','never',70),
 ('statements','Statements',true,true,'people',true,true,'key','never',170);

-- ---------- Shared helpers for this step's kinds (new, private) ----------
-- A list of options as the run of show sends it: [{key?, text}]. Text is trimmed and
-- single-spaced; a missing key gets the next free "oN". Keys never change once saved,
-- so answers and Spotlight keep addressing the same option.
create function private.bar_option_list(p jsonb,p_min integer,p_max integer,p_length integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb:='[]'::jsonb; item jsonb; k text; t text; used text[]:=array[]::text[]; texts text[]:=array[]::text[]; n integer:=0;
begin
 if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) not between p_min and p_max then return null; end if;
 for item in select v from jsonb_array_elements(p) v loop
  if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item) x where x not in ('key','text')) then return null; end if;
  if jsonb_typeof(item->'key')='string' then
   if item->>'key' !~ '^[a-z0-9_-]{1,40}$' or item->>'key'=any(used) then return null; end if;
   used:=used||(item->>'key');
  elsif item ? 'key' and jsonb_typeof(item->'key')<>'null' then return null;
  end if;
 end loop;
 for item in select v from jsonb_array_elements(p) v loop
  if jsonb_typeof(item->'text') is distinct from 'string' then return null; end if;
  t:=btrim(regexp_replace(item->>'text','\s+',' ','g'));
  if length(t) not between 1 and p_length or lower(t)=any(texts) then return null; end if;
  texts:=texts||lower(t);
  k:=case when jsonb_typeof(item->'key')='string' then item->>'key' end;
  if k is null then loop n:=n+1; k:='o'||n; exit when not k=any(used); end loop; used:=used||k; end if;
  out:=out||jsonb_build_array(jsonb_build_object('key',k,'text',t));
 end loop;
 return out;
end $$;

-- An end label: a string or nothing, trimmed, up to 80 characters.
create function private.bar_label(p jsonb,p_default text) returns text
language sql immutable security definer set search_path='' as $$
 select case when p is null or jsonb_typeof(p)='null' then p_default
  when jsonb_typeof(p)<>'string' or length(btrim(p#>>'{}'))>80 then null
  else coalesce(nullif(btrim(regexp_replace(p#>>'{}','\s+',' ','g')),''),p_default) end
$$;
create function private.bar_flag(p jsonb,p_default boolean) returns boolean
language sql immutable security definer set search_path='' as $$
 select case when p is null or jsonb_typeof(p)='null' then p_default when jsonb_typeof(p)='boolean' then (p#>>'{}')::boolean end
$$;
-- A whole number in range from a JSON value, or null.
create function private.bar_int(p jsonb,p_min integer,p_max integer) returns integer
language sql immutable security definer set search_path='' as $$
 select case when jsonb_typeof(p)='number' and (p#>>'{}')::numeric=trunc((p#>>'{}')::numeric) and (p#>>'{}')::numeric between p_min and p_max then (p#>>'{}')::integer end
$$;
-- A session's options as a set of rows, in the order written.
create function private.bar_options(p_session public.sessions) returns table(key text,text text,ord bigint)
language sql stable security definer set search_path='' as $$
 select o->>'key',o->>'text',t.ord from jsonb_array_elements(case when jsonb_typeof(p_session.options->'items')='array' then p_session.options->'items' else '[]'::jsonb end) with ordinality t(o,ord)
$$;
-- "Top three" for the cut line.
create function private.bar_cut_label(p_n integer) returns text
language sql immutable security definer set search_path='' as $$
 select 'Top '||coalesce((array['one','two','three','four','five','six','seven','eight','nine','ten','eleven'])[p_n],p_n::text)
$$;
-- The answers that stand: not deleted, not withdrawn or replaced, not hidden.
create function private.bar_answers(p_engagement uuid,p_session uuid) returns setof public.submissions
language sql stable security definer set search_path='' as $$
 select * from public.submissions where engagement_id=p_engagement and session_id=p_session and not deleted and not withdrawn and not hidden
$$;
-- Words for matching suggested options: lower case, no punctuation, little words and a
-- trailing s dropped (the word cloud's rules).
create function private.bar_words(p_text text) returns text[]
language sql immutable security definer set search_path='' as $$
 select coalesce(array_agg(distinct case when length(w)>3 and right(w,1)='s' then left(w,-1) else w end),array[]::text[])
 from regexp_split_to_table(btrim(regexp_replace(lower(coalesce(p_text,'')),'[^[:alnum:][:space:]]','','g')),'\s+') w
 where w<>'' and w not in ('a','an','the','and','in','my','our','of','to','for','on','at','with','or')
$$;

-- ---------- Options ----------
-- INT-04: two to twelve choices; pick one, or pick any.
create function private.bar_options_choice(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; many boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('items','multiple')) then return null; end if;
 many:=private.bar_flag(p->'multiple',false); items:=private.bar_option_list(p->'items',2,12,200);
 if many is null or items is null then return null; end if;
 return jsonb_build_object('items',items,'multiple',many);
end $$;
-- INT-05: 1 to 2..10 with labeled ends. Its items are the numbers and the average, made
-- here, so Spotlight can address "the average" or one number before anyone answers.
create function private.bar_options_scale(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare top integer; lo text; hi text;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('max','low','high','items')) then return null; end if;
 top:=case when p ? 'max' then private.bar_int(p->'max',2,10) else 5 end;
 lo:=private.bar_label(p->'low','Not at all'); hi:=private.bar_label(p->'high','Completely');
 if top is null or lo is null or hi is null then return null; end if;
 return jsonb_build_object('max',top,'low',lo,'high',hi,'items',(select jsonb_agg(jsonb_build_object('key',n::text,'text',case when n=1 then '1 · '||lo when n=top then top||' · '||hi else n::text end) order by n)
  from generate_series(1,top) n)||jsonb_build_array(jsonb_build_object('key','average','text','The average')));
end $$;
-- INT-06: two to twelve options; Add an option lets phones suggest a missing one.
create function private.bar_options_ranking(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; add boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('items','suggest')) then return null; end if;
 add:=private.bar_flag(p->'suggest',false); items:=private.bar_option_list(p->'items',2,12,120);
 if add is null or items is null then return null; end if;
 return jsonb_build_object('items',items,'suggest',add);
end $$;
-- INT-07: two to eight options and an optional cut line after the top N (0 for none).
create function private.bar_options_points(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; cut integer;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('items','cut')) then return null; end if;
 items:=private.bar_option_list(p->'items',2,8,120);
 if items is null then return null; end if;
 cut:=case when p ? 'cut' and jsonb_typeof(p->'cut')<>'null' then private.bar_int(p->'cut',0,jsonb_array_length(items)-1) else 0 end;
 if cut is null then return null; end if;
 return jsonb_build_object('items',items,'cut',cut);
end $$;
-- INT-17: one to eight statements, the two end labels, and Flag divided statements.
create function private.bar_options_statements(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; lo text; hi text; flag boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('items','low','high','flag_divided')) then return null; end if;
 items:=private.bar_option_list(p->'items',1,8,200);
 lo:=private.bar_label(p->'low','Strongly disagree'); hi:=private.bar_label(p->'high','Strongly agree'); flag:=private.bar_flag(p->'flag_divided',true);
 if items is null or lo is null or hi is null or flag is null then return null; end if;
 return jsonb_build_object('items',items,'low',lo,'high',hi,'flag_divided',flag);
end $$;

-- ---------- Parsing one answer ----------
-- Each answer carries its value, plain text for exports and the person's own phone, and
-- the option keys it touches (so Spotlight and Hide find them).
create function private.bar_parse_choice(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare picks text[]; many boolean:=coalesce((p_session.options->>'multiple')::boolean,false); answers jsonb; label text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'choices') is distinct from 'array'
  or exists(select 1 from jsonb_array_elements(p_value->'choices') v where jsonb_typeof(v)<>'string') then return jsonb_build_object('status','invalid_answer'); end if;
 select array_agg(v) into picks from jsonb_array_elements_text(p_value->'choices') v;
 if picks is null or (not many and cardinality(picks)<>1) or cardinality(picks)<>(select count(distinct x) from unnest(picks) x)
  or not picks<@(select coalesce(array_agg(o.key),array[]::text[]) from private.bar_options(p_session) o) then return jsonb_build_object('status','invalid_answer'); end if;
 select jsonb_agg(jsonb_build_object('key',o.key,'text',o.text) order by o.ord),string_agg(o.text,', ' order by o.ord) into answers,label
  from private.bar_options(p_session) o where o.key=any(picks);
 return jsonb_build_object('status','ok','text',left(label,1404),'answers',answers,
  'value',jsonb_build_object('choices',(select jsonb_agg(a->'key') from jsonb_array_elements(answers) a)));
end $$;
create function private.bar_parse_scale(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v integer;
begin
 if jsonb_typeof(p_value) is distinct from 'object' then return jsonb_build_object('status','invalid_answer'); end if;
 v:=private.bar_int(p_value->'value',1,coalesce((p_session.options->>'max')::integer,5));
 if v is null then return jsonb_build_object('status','invalid_answer'); end if;
 return jsonb_build_object('status','ok','text',v::text,'answers',jsonb_build_array(jsonb_build_object('key',v::text,'text',v::text)),'value',jsonb_build_object('value',v));
end $$;
-- A partial ranking counts: one to all of the options, each once, in priority order.
create function private.bar_parse_ranking(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare picks text[]; answers jsonb; label text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'order') is distinct from 'array'
  or exists(select 1 from jsonb_array_elements(p_value->'order') v where jsonb_typeof(v)<>'string') then return jsonb_build_object('status','invalid_answer'); end if;
 select array_agg(v order by i) into picks from jsonb_array_elements_text(p_value->'order') with ordinality t(v,i);
 if picks is null or cardinality(picks)<>(select count(distinct x) from unnest(picks) x)
  or not picks<@(select coalesce(array_agg(o.key),array[]::text[]) from private.bar_options(p_session) o) then return jsonb_build_object('status','invalid_answer'); end if;
 select jsonb_agg(jsonb_build_object('key',o.key,'text',o.text) order by t.i),string_agg(t.i||'. '||o.text,', ' order by t.i) into answers,label
  from unnest(picks) with ordinality t(k,i) join private.bar_options(p_session) o on o.key=t.k;
 return jsonb_build_object('status','ok','text',left(label,1404),'answers',answers,'value',jsonb_build_object('order',to_jsonb(picks)));
end $$;
-- A person's points count once all 100 are placed: only a full budget is accepted.
create function private.bar_parse_points(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare given jsonb:=p_value->'points'; pts jsonb; answers jsonb; label text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(given) is distinct from 'object'
  or exists(select 1 from jsonb_each(given) e where private.bar_int(e.value,0,100) is null or e.key not in (select o.key from private.bar_options(p_session) o))
  or (select coalesce(sum((e.value#>>'{}')::integer),0) from jsonb_each(given) e)<>100 then return jsonb_build_object('status','invalid_answer'); end if;
 select jsonb_object_agg(o.key,coalesce((given->>o.key)::integer,0)) into pts from private.bar_options(p_session) o;
 select jsonb_agg(jsonb_build_object('key',o.key,'text',o.text) order by o.ord),string_agg(o.text||' '||(given->>o.key),', ' order by o.ord) into answers,label
  from private.bar_options(p_session) o where coalesce((given->>o.key)::integer,0)>0;
 return jsonb_build_object('status','ok','text',left(label,1404),'answers',answers,'value',jsonb_build_object('points',pts));
end $$;
-- A person's ratings, 1 to 5, for one or more statements are one answer. Each tap sends
-- the whole set, so the latest replaces the earlier.
create function private.bar_parse_statements(p_session public.sessions,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare given jsonb:=p_value->'ratings'; n integer; answers jsonb;
begin
 if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(given) is distinct from 'object' or given='{}'::jsonb
  or exists(select 1 from jsonb_each(given) e where private.bar_int(e.value,1,5) is null or e.key not in (select o.key from private.bar_options(p_session) o)) then return jsonb_build_object('status','invalid_answer'); end if;
 select count(*)::integer,jsonb_agg(jsonb_build_object('key',o.key,'text',o.text) order by o.ord) into n,answers from private.bar_options(p_session) o where given ? o.key;
 return jsonb_build_object('status','ok','text',n||' of '||(select count(*) from private.bar_options(p_session))||' rated','answers',answers,'value',jsonb_build_object('ratings',given));
end $$;

-- The registry finds each kind's functions by name and signature. The engagement and
-- the typed text are not needed here: the value is the answer.
create function private.options_choice(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_options_choice(p) $$;
create function private.parse_choice(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_parse_choice(p_session,p_value) $$;
create function private.options_scale(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_options_scale(p) $$;
create function private.parse_scale(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_parse_scale(p_session,p_value) $$;
create function private.options_ranking(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_options_ranking(p) $$;
create function private.parse_ranking(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_parse_ranking(p_session,p_value) $$;
create function private.options_points(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_options_points(p) $$;
create function private.parse_points(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_parse_points(p_session,p_value) $$;
create function private.options_statements(p jsonb,p_engagement uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_options_statements(p) $$;
create function private.parse_statements(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_parse_statements(p_session,p_value) $$;

-- ---------- Results: every number on screen ----------
-- Each bar is {key, text, place, fraction (its length, 0 to 1), leader} plus its own
-- numbers, in display order. Hidden options leave the bars. Ties share the lead.
create function private.results_choice(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement),
 opts as (select o.* from s cross join lateral private.bar_options(s) o where not (o.key=any(p_hidden))),
 ans as (select * from private.bar_answers(p_engagement,p_session)),
 who as (select count(*)::integer as total,count(distinct attendee_id)::integer as people from ans),
 counted as (select o.key,o.text,o.ord,(select count(*) from ans where jsonb_typeof(ans.value->'choices')='array' and ans.value->'choices' ? o.key)::integer as n from opts o),
 ranked as (select c.*,max(n) over() as top,row_number() over(order by n desc,ord) as place from counted c)
 select jsonb_build_object('total',who.total,'people',who.people,'multiple',coalesce((select (options->>'multiple')::boolean from s),false),
  'bars',coalesce((select jsonb_agg(jsonb_build_object('key',key,'text',text,'place',place,'count',n,
    'percent',case when who.people>0 then round(n*100.0/who.people)::integer else 0 end,
    'fraction',case when top>0 then round(n::numeric/top,4) else 0 end,'leader',top>0 and n=top) order by place) from ranked),'[]'::jsonb))
 from who
$$;
create function private.results_scale(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement),
 top as (select coalesce((select (options->>'max')::integer from s),5) as m),
 ans as (select attendee_id,(value->>'value')::integer as v from private.bar_answers(p_engagement,p_session) where not ((value->>'value')=any(p_hidden))),
 cols as (select n,(select count(*) from ans where v=n)::integer as c from top cross join generate_series(1,top.m) n),
 tall as (select max(c) as t from cols),
 agg as (select count(*)::integer as total,count(distinct attendee_id)::integer as people,round(avg(v),1) as average,min(v) as low,max(v) as high from ans)
 select jsonb_build_object('total',agg.total,'people',agg.people,'scale',jsonb_build_object('max',top.m,'average',agg.average,'low',agg.low,'high',agg.high,
  'columns',(select jsonb_agg(jsonb_build_object('key',n::text,'value',n,'count',c,'fraction',case when tall.t>0 then round(c::numeric/tall.t,4) else 0 end) order by n) from cols,tall)))
 from agg,top
$$;
-- Unranked options take the middle of the remaining places; the room's order is by
-- average place. An option added later is unranked in every earlier ranking.
create function private.results_ranking(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement),
 opts as (select o.* from s cross join lateral private.bar_options(s) o where not (o.key=any(p_hidden))),
 total as (select count(*)::numeric as n from opts),
 ans as (select * from private.bar_answers(p_engagement,p_session)),
 who as (select count(*)::integer as total,count(distinct attendee_id)::integer as people from ans),
 placed as (select a.id,r.k,row_number() over(partition by a.id order by r.i) as place from ans a
  cross join lateral jsonb_array_elements_text(case when jsonb_typeof(a.value->'order')='array' then a.value->'order' else '[]'::jsonb end) with ordinality r(k,i)
  where r.k in (select key from opts)),
 lens as (select a.id,(select count(*) from placed p where p.id=a.id)::numeric as len from ans a),
 scored as (select o.key,o.text,o.ord,avg(coalesce(p.place::numeric,l.len+(total.n-l.len+1)/2)) as average,count(p.place)::integer as ranked
  from opts o cross join total left join lens l on true left join placed p on p.id=l.id and p.k=o.key group by o.key,o.text,o.ord),
 ordered as (select *,row_number() over(order by average nulls last,ord) as place,min(round(average,1)) over() as best from scored)
 select jsonb_build_object('total',who.total,'people',who.people,'options',(select n from total)::integer,
  'bars',coalesce((select jsonb_agg(jsonb_build_object('key',key,'text',text,'place',place,'ranked',ranked,'average',round(average,1),
    'fraction',case when average is null then 0 else round(((select n from total)+1-average)/(select n from total),4) end,
    'leader',average is not null and round(average,1)=best) order by place) from ordered),'[]'::jsonb))
 from who
$$;
-- Each option's share of the room's points. Only full budgets are ever stored.
create function private.results_points(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement),
 opts as (select o.* from s cross join lateral private.bar_options(s) o where not (o.key=any(p_hidden))),
 ans as (select * from private.bar_answers(p_engagement,p_session)),
 who as (select count(*)::integer as total,count(distinct attendee_id)::integer as people from ans),
 summed as (select o.key,o.text,o.ord,coalesce((select sum(coalesce((a.value->'points'->>o.key)::integer,0)) from ans a),0)::integer as pts from opts o),
 ranked as (select *,row_number() over(order by pts desc,ord) as place,max(pts) over() as top,sum(pts) over() as everything from summed),
 cut as (select least(coalesce((select (options->>'cut')::integer from s),0),greatest((select count(*) from opts)-1,0))::integer as n)
 select jsonb_build_object('total',who.total,'people',who.people,'cut',cut.n,'cut_label',case when cut.n>0 then private.bar_cut_label(cut.n) end,
  'bars',coalesce((select jsonb_agg(jsonb_build_object('key',key,'text',text,'place',place,'points',pts,
    'share',case when everything>0 then round(pts*100.0/everything)::integer else 0 end,
    'fraction',case when top>0 then round(pts::numeric/top,4) else 0 end,'leader',top>0 and pts=top) order by place) from ranked),'[]'::jsonb))
 from who,cut
$$;
-- Each statement from 1 (empty) to 5 (full), by average agreement, with the share who
-- agree (4 or 5). Divided never appears here: the TV never sees it.
create function private.results_statements(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement),
 opts as (select o.* from s cross join lateral private.bar_options(s) o where not (o.key=any(p_hidden))),
 ans as (select * from private.bar_answers(p_engagement,p_session)),
 who as (select count(*)::integer as total,count(distinct attendee_id)::integer as people from ans),
 rated as (select o.key,o.text,o.ord,r.v from opts o left join lateral (select private.bar_int(a.value->'ratings'->o.key,1,5) as v from ans a) r on r.v is not null),
 agg as (select key,text,ord,count(v)::integer as n,round(avg(v),1) as average,count(*) filter (where v>=4)::integer as agree from rated group by key,text,ord),
 ordered as (select *,row_number() over(order by average desc nulls last,ord) as place,max(average) over() as best from agg)
 select jsonb_build_object('total',who.total,'people',who.people,'low',(select options->>'low' from s),'high',(select options->>'high' from s),
  'bars',coalesce((select jsonb_agg(jsonb_build_object('key',key,'text',text,'place',place,'count',n,'average',average,
    'agree',case when n>0 then round(agree*100.0/n)::integer else 0 end,
    'fraction',case when n>0 then round((average-1)/4,4) else 0 end,'leader',n>0 and average=best) order by place) from ordered),'[]'::jsonb))
 from who
$$;

-- ---------- Control surface items ----------
-- Every option, in the room's order, with its numbers. Hidden options stay listed so they
-- can be unhidden. Statements carry Divided here, on the facilitator's view only.
create function private.bar_items(p_session uuid,p_hidden text[],p_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; res jsonb; fn text:=private.kind_function('results',p_kind,'uuid,uuid,text[]');
begin
 select * into s from public.sessions where id=p_session and not deleted;
 if s.id is null or fn is null then return '[]'::jsonb; end if;
 execute format('select %s($1,$2,$3)',fn) into res using s.engagement_id,s.id,array[]::text[];
 return coalesce((select jsonb_agg(jsonb_build_object('key',b->>'key','count',coalesce((b->>'count')::integer,(b->>'ranked')::integer,(b->>'points')::integer,0),
   'hidden',(b->>'key')=any(p_hidden),'place',(b->>'place')::integer,
   'text',(b->>'text')||' · '||case p_kind
     when 'choice' then (b->>'count')||' · '||(b->>'percent')||'%'
     when 'ranking' then coalesce('avg '||(b->>'average'),'no rankings yet')
     when 'points' then (b->>'share')||'% · '||(b->>'points')||' points'
     else coalesce((b->>'average')||' average · '||(b->>'agree')||'% agree','no answers yet') end)
  order by (b->>'key')=any(p_hidden),(b->>'place')::integer) from jsonb_array_elements(res->'bars') b),'[]'::jsonb);
end $$;
create function private.items_choice(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_items(p_session,p_hidden,'choice') $$;
create function private.items_ranking(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_items(p_session,p_hidden,'ranking') $$;
create function private.items_points(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$ select private.bar_items(p_session,p_hidden,'points') $$;
-- Divided: at least 35% disagree (1 or 2) and at least 35% agree (4 or 5), once four or
-- more people have rated it, when the session flags divided statements.
create function private.items_statements(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and not deleted),
 split as (select o.key,count(r.v)::integer as n,count(*) filter (where r.v<=2)::integer as disagree,count(*) filter (where r.v>=4)::integer as agree
  from s cross join lateral private.bar_options(s) o left join lateral (select private.bar_int(a.value->'ratings'->o.key,1,5) as v from private.bar_answers(s.engagement_id,s.id) a) r on r.v is not null group by o.key)
 select coalesce(jsonb_agg(i||jsonb_build_object('disagree',x.disagree,'agree',x.agree,'divided',d.divided,
   'text',(i->>'text')||case when d.divided then ' · Divided: '||x.disagree||' disagree, '||x.agree||' agree' else '' end) order by t.ord),'[]'::jsonb)
 from jsonb_array_elements(private.bar_items(p_session,p_hidden,'statements')) with ordinality t(i,ord)
  join split x on x.key=i->>'key'
  cross join lateral (select coalesce((select (options->>'flag_divided')::boolean from s),true) and x.n>=4 and x.disagree*100>=35*x.n and x.agree*100>=35*x.n as divided) d
$$;
create function private.items_scale(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and not deleted),
 res as (select private.results_scale(s.engagement_id,s.id,array[]::text[])->'scale' as r,private.results_scale(s.engagement_id,s.id,array[]::text[])->>'people' as people from s)
 select coalesce((select jsonb_build_array(jsonb_build_object('key','average','text','The average · '||coalesce((r->>'average')||' average of '||people,'no answers yet'),'count',people::integer,'hidden',false))
  ||coalesce((select jsonb_agg(jsonb_build_object('key',c->>'key','text',o.text||' · '||(c->>'count')||case when (c->>'count')='1' then ' person' else ' people' end,'count',(c->>'count')::integer,'hidden',(c->>'key')=any(p_hidden)) order by (c->>'value')::integer)
   from jsonb_array_elements(r->'columns') c join s on true cross join lateral private.bar_options(s) o where o.key=c->>'key'),'[]'::jsonb) from res),'[]'::jsonb)
$$;

-- ---------- INT-06 Add an option ----------
-- A phone suggests a missing option. It waits on the control surface, matched with other
-- suggestions by their words, until the facilitator adds it (merging duplicates) or dismisses it.
create table private.ranking_suggestions (
 id uuid primary key,
 engagement_id uuid not null references public.engagements(id),
 session_id uuid not null,
 attendee_id uuid not null references public.attendees(id),
 text text not null check(length(text) between 1 and 80),
 words text[] not null check(cardinality(words) between 1 and 40),
 status text not null default 'pending' check(status in ('pending','added','dismissed')),
 option_key text check(option_key ~ '^[a-z0-9_-]{1,40}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 deleted boolean not null default false,
 foreign key(session_id,engagement_id) references public.sessions(id,engagement_id)
);
create index ranking_suggestions_session_idx on private.ranking_suggestions(session_id,engagement_id) where not deleted;
create index ranking_suggestions_engagement_idx on private.ranking_suggestions(engagement_id);
create index ranking_suggestions_attendee_idx on private.ranking_suggestions(attendee_id);
alter table private.ranking_suggestions enable row level security;
alter table private.ranking_suggestions force row level security;
revoke all on private.ranking_suggestions from public,anon,authenticated;
grant select,insert,update,delete on private.ranking_suggestions to service_role;
create trigger touch_record before update on private.ranking_suggestions for each row execute function private.touch_live_record('id');

-- The phone's suggestion: the live (or still open) ranking step, Add an option on, the word
-- filter, up to three per person per step. The id is made on the phone, so a resend is a duplicate.
create function private.ranking_suggest(p_engagement uuid,p_id uuid,p_session uuid,p_text text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; who uuid; done private.ranking_suggestions; t text:=btrim(regexp_replace(coalesce(p_text,''),'\s+',' ','g')); w text[];
begin
 if private.live_role(p_engagement) is distinct from 'participant' then return jsonb_build_object('status','denied'); end if;
 select id into who from public.attendees where engagement_id=p_engagement and not deleted and id in(select private.room_attendee_ids());
 if who is null or p_id is null then return jsonb_build_object('status','denied'); end if;
 select * into done from private.ranking_suggestions where id=p_id;
 if found then return jsonb_build_object('status',case when done.attendee_id=who and done.session_id=p_session then 'duplicate' else 'conflict' end,'id',p_id); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if s.id is null or s.interaction<>'ranking' or not coalesce((s.options->>'suggest')::boolean,false) then return jsonb_build_object('status','invalid_session'); end if;
 if not ((r.live_session_id=s.id and s.state='live' and not r.phones_down and (r.burst_ends_at is null or r.burst_ends_at>clock_timestamp())) or (r.live_session_id is distinct from s.id and s.state='open')) then return jsonb_build_object('status','closed'); end if;
 if length(t) not between 1 and 80 then return jsonb_build_object('status','invalid_answer'); end if;
 if private.screen_text(t) then return jsonb_build_object('status','filtered'); end if;
 w:=private.bar_words(t);
 if cardinality(w) not between 1 and 40 then return jsonb_build_object('status','invalid_answer'); end if;
 if (select count(*) from private.ranking_suggestions where session_id=s.id and attendee_id=who and not deleted)>=3 then return jsonb_build_object('status','limit'); end if;
 insert into private.ranking_suggestions(id,engagement_id,session_id,attendee_id,text,words) values(p_id,p_engagement,s.id,who,t,w);
 -- The control surface refreshes on this private notice. No name travels with it.
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','action','ranking_suggest','version',r.version,'changed',false));
 return jsonb_build_object('status','accepted','id',p_id);
end $$;

-- The facilitator's list for the live ranking step: suggestions matched by their words
-- (one's words inside another's) shown as one, and any that match an existing option.
create function private.ranking_suggestions_for(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.room_states; s public.sessions; x record; groups jsonb:='[]'::jsonb; g jsonb; found_at integer; gw text[]; existing jsonb;
begin
 if not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted;
 select * into s from public.sessions where id=r.live_session_id and not deleted;
 if s.id is null or s.interaction<>'ranking' then return jsonb_build_object('status','ok','session',null,'groups','[]'::jsonb); end if;
 for x in select q.id,q.text,q.words from private.ranking_suggestions q join public.attendees a on a.id=q.attendee_id and not a.deleted
   where q.session_id=s.id and q.status='pending' and not q.deleted order by q.created_at,q.id limit 300 loop
  found_at:=null;
  for i in 0..jsonb_array_length(groups)-1 loop
   select coalesce(array_agg(v),array[]::text[]) into gw from jsonb_array_elements_text(groups->i->'words') v;
   if x.words<@gw or gw<@x.words then found_at:=i; exit; end if;
  end loop;
  if found_at is null then
   groups:=groups||jsonb_build_array(jsonb_build_object('ids',jsonb_build_array(x.id),'text',x.text,'texts',jsonb_build_array(x.text),'words',to_jsonb(x.words)));
  else
   g:=groups->found_at;
   select coalesce(array_agg(distinct v),array[]::text[]) into gw from (select jsonb_array_elements_text(g->'words') v union select unnest(x.words)) u;
   -- The fullest wording leads: "Prayer and discernment" over "Prayer".
   g:=jsonb_build_object('ids',(g->'ids')||to_jsonb(x.id),'texts',case when (g->'texts') ? x.text then g->'texts' else (g->'texts')||to_jsonb(x.text) end,'words',to_jsonb(gw),
    'text',case when cardinality(x.words)>jsonb_array_length(groups->found_at->'words') then x.text else g->>'text' end);
   groups:=jsonb_set(groups,array[found_at::text],g);
  end if;
 end loop;
 select coalesce(jsonb_agg(gr-'words'||jsonb_build_object('count',jsonb_array_length(gr->'ids'),'existing',(
   select jsonb_build_object('key',o.key,'text',o.text) from private.bar_options(s) o
    where private.bar_words(o.text)<@(select array_agg(v) from jsonb_array_elements_text(gr->'words') v) or (select array_agg(v) from jsonb_array_elements_text(gr->'words') v)<@private.bar_words(o.text) limit 1))
  order by ord),'[]'::jsonb) into existing from jsonb_array_elements(groups) with ordinality t(gr,ord);
 return jsonb_build_object('status','ok','session',s.id,'suggest',coalesce((s.options->>'suggest')::boolean,false),'options',jsonb_array_length(coalesce(s.options->'items','[]'::jsonb)),'groups',existing);
end $$;

-- Add (merging every suggestion in the group) or dismiss, as one press: room row lock
-- first, facilitator check, a client-made id, and the version raised once, which broadcasts.
-- An added option appears on every phone and on the TV; earlier rankings treat it as unranked.
create function private.ranking_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.room_states; s public.sessions; ids uuid[]; t text; k text; opts jsonb; who text;
begin
 if p_engagement='90000000-0000-4000-8000-000000000010'::uuid then perform pg_advisory_xact_lock(hashtextextended(p_engagement::text,7)); end if;
 select * into r from public.room_states where engagement_id=p_engagement and not deleted for update;
 if not found or not coalesce(private.show_allowed(p_engagement),false) or private.live_role(p_engagement) is distinct from 'facilitator' then return jsonb_build_object('status','denied'); end if;
 if exists(select 1 from public.engagements where id=p_engagement and status='closed') then return jsonb_build_object('status','closed'); end if;
 if p_id is null or p_action is null or p_action not in ('add_option','dismiss') or jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'ids') is distinct from 'array'
  or jsonb_array_length(p->'ids') not between 1 and 300 or exists(select 1 from jsonb_array_elements(p->'ids') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then return jsonb_build_object('status','invalid_request'); end if;
 if exists(select 1 from private.room_controls where id=p_id) then
  if exists(select 1 from private.room_controls where id=p_id and engagement_id=p_engagement and action='ranking_'||p_action) then return jsonb_build_object('status','duplicate','version',r.version); end if;
  return jsonb_build_object('status','conflict');
 end if;
 select * into s from public.sessions where id=r.live_session_id and not deleted for update;
 if s.id is null or s.interaction<>'ranking' or s.state='closed' then return jsonb_build_object('status','invalid_state'); end if;
 select array_agg((v#>>'{}')::uuid) into ids from jsonb_array_elements(p->'ids') v;
 if (select count(*) from private.ranking_suggestions where id=any(ids) and session_id=s.id and status='pending' and not deleted)<>(select count(distinct x) from unnest(ids) x) then return jsonb_build_object('status','missing'); end if;
 if p_action='add_option' then
  t:=btrim(regexp_replace(coalesce(p->>'text',''),'\s+',' ','g'));
  if length(t) not between 1 and 120 then return jsonb_build_object('status','invalid_request'); end if;
  if exists(select 1 from private.bar_options(s) o where lower(o.text)=lower(t)) then return jsonb_build_object('status','exists'); end if;
  if jsonb_array_length(coalesce(s.options->'items','[]'::jsonb))>=12 then return jsonb_build_object('status','full'); end if;
  k:='a'||left(replace(p_id::text,'-',''),10);
  opts:=private.options_ranking(s.options||jsonb_build_object('items',coalesce(s.options->'items','[]'::jsonb)||jsonb_build_array(jsonb_build_object('key',k,'text',t))),p_engagement);
  if opts is null then return jsonb_build_object('status','invalid_request'); end if;
  update public.sessions set options=opts where id=s.id;
  update private.ranking_suggestions set status='added',option_key=k where id=any(ids);
  update public.room_states set results=private.live_results(p_engagement) where engagement_id=p_engagement returning * into r;
 else
  update private.ranking_suggestions set status='dismissed' where id=any(ids);
 end if;
 insert into private.room_controls(id,engagement_id,actor_id,action,session_id,room_version,created_at) values(p_id,p_engagement,private.clearway_user_id(),'ranking_'||p_action,s.id,r.version,clock_timestamp());
 select split_part(btrim(name),' ',1) into who from public.clearway_users where id=private.clearway_user_id();
 perform private.fac_notice(p_engagement,jsonb_build_object('kind','control','id',p_id,'action','ranking_'||p_action,'by',who,'version',r.version,'changed',p_action='add_option'));
 return jsonb_build_object('status','ok','version',r.version,'key',k);
exception when invalid_text_representation then return jsonb_build_object('status','invalid_request');
end $$;

create function public.ranking_suggest(p_engagement uuid,p_id uuid,p_session uuid,p_text text) returns jsonb
language sql security invoker set search_path='' as $$ select private.ranking_suggest(p_engagement,p_id,p_session,p_text) $$;
create function public.ranking_suggestions_for(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.ranking_suggestions_for(p_engagement) $$;
create function public.ranking_control(p_engagement uuid,p_id uuid,p_action text,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.ranking_control(p_engagement,p_id,p_action,p) $$;

revoke all on function private.bar_option_list(jsonb,integer,integer,integer),private.bar_label(jsonb,text),private.bar_flag(jsonb,boolean),private.bar_int(jsonb,integer,integer),
 private.bar_options(public.sessions),private.bar_cut_label(integer),private.bar_answers(uuid,uuid),private.bar_words(text),
 private.bar_options_choice(jsonb),private.bar_parse_choice(public.sessions,jsonb),private.bar_options_scale(jsonb),private.bar_parse_scale(public.sessions,jsonb),private.bar_options_ranking(jsonb),private.bar_parse_ranking(public.sessions,jsonb),private.bar_options_points(jsonb),private.bar_parse_points(public.sessions,jsonb),private.bar_options_statements(jsonb),private.bar_parse_statements(public.sessions,jsonb),
 private.options_choice(jsonb,uuid),private.options_scale(jsonb,uuid),private.options_ranking(jsonb,uuid),private.options_points(jsonb,uuid),private.options_statements(jsonb,uuid),
 private.parse_choice(public.sessions,text,jsonb),private.parse_scale(public.sessions,text,jsonb),private.parse_ranking(public.sessions,text,jsonb),private.parse_points(public.sessions,text,jsonb),private.parse_statements(public.sessions,text,jsonb),
 private.results_choice(uuid,uuid,text[]),private.results_scale(uuid,uuid,text[]),private.results_ranking(uuid,uuid,text[]),private.results_points(uuid,uuid,text[]),private.results_statements(uuid,uuid,text[]),
 private.bar_items(uuid,text[],text),private.items_choice(uuid,text[]),private.items_scale(uuid,text[]),private.items_ranking(uuid,text[]),private.items_points(uuid,text[]),private.items_statements(uuid,text[]),
 private.ranking_suggest(uuid,uuid,uuid,text),private.ranking_suggestions_for(uuid),private.ranking_control(uuid,uuid,text,jsonb),
 public.ranking_suggest(uuid,uuid,uuid,text),public.ranking_suggestions_for(uuid),public.ranking_control(uuid,uuid,text,jsonb)
 from public,anon,authenticated;
grant execute on function private.ranking_suggest(uuid,uuid,uuid,text),private.ranking_suggestions_for(uuid),private.ranking_control(uuid,uuid,text,jsonb),
 public.ranking_suggest(uuid,uuid,uuid,text),public.ranking_suggestions_for(uuid),public.ranking_control(uuid,uuid,text,jsonb)
 to authenticated;
commit;
