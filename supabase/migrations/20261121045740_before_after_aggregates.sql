-- Design pass 11 part 8. Aggregate distributions only; raw pairs never reach room state.
begin;
insert into private.interaction_kinds(kind,label,input,one_per_person,counts,structured,shares_answers,spotlight,named,position,private_ok)
values('before_after','Before and after',true,true,'people',true,false,'none','never',55,true);
create function private.options_before_after(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare mode text:=coalesce(p->>'mode','paired'); m integer; b public.sessions; a public.sessions; out jsonb; change boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('mode','max','low','high','before_label','after_label','show_change','before_session','after_session')) or mode not in ('paired','steps') then return null; end if;
 m:=case when p?'max' then private.bar_int(p->'max',5,10) else 10 end;
 if m is null or (mode='paired' and m not in (5,7,10)) then return null; end if;
 change:=private.bar_flag(p->'show_change',true); if change is null then return null; end if;
 if mode='steps' then
  if coalesce(p->>'before_session','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or coalesce(p->>'after_session','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return null; end if;
  select * into b from public.sessions where id=(p->>'before_session')::uuid and engagement_id=p_engagement and not deleted and interaction='scale';
  select * into a from public.sessions where id=(p->>'after_session')::uuid and engagement_id=p_engagement and not deleted and interaction='scale';
  if b.id is null or a.id is null or b.id=a.id or b.options->>'max' is distinct from a.options->>'max' then return null; end if;
  m:=(b.options->>'max')::integer;
 end if;
 out:=jsonb_build_object('mode',mode,'max',m,'low',private.bar_label(p->'low','Not at all'),'high',private.bar_label(p->'high','Completely'),
  'before_label',private.bar_label(p->'before_label','Before today'),'after_label',private.bar_label(p->'after_label','After today'),'show_change',change);
 if out->'low'='null'::jsonb or out->'high'='null'::jsonb or out->'before_label'='null'::jsonb or out->'after_label'='null'::jsonb or length(out->>'before_label')>60 or length(out->>'after_label')>60 then return null; end if;
 return out||case when mode='steps' then jsonb_build_object('before_session',b.id,'after_session',a.id) else '{}'::jsonb end;
end $$;
create function private.before_after_validate() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sessions;
begin
 if new.deleted then return new; end if;
 if new.interaction='before_after' and new.options->>'mode'='steps' then
  if private.options_before_after(new.options-'visibility'-'timer'-'image'-'untitled',new.engagement_id) is null then raise check_violation using message='Choose two earlier scale steps with the same range.'; end if;
  for s in select * from public.sessions where id in ((new.options->>'before_session')::uuid,(new.options->>'after_session')::uuid) loop
   if (private.part_order(s.part),s.position,s.id)>=(private.part_order(new.part),new.position,new.id) then raise check_violation using message='Choose scale steps earlier in the run of show.'; end if;
  end loop;
 end if;
 if new.interaction='scale' then
  for s in select * from public.sessions where engagement_id=new.engagement_id and not deleted and interaction='before_after' and options->>'mode'='steps' and new.id::text in (options->>'before_session',options->>'after_session') loop
   if (private.part_order(new.part),new.position,new.id)>=(private.part_order(s.part),s.position,s.id) or new.options->>'max' is distinct from s.options->>'max' then raise check_violation using message='This scale is used by Before and after. Keep its range and earlier place.'; end if;
  end loop;
 end if;
 return new;
end $$;
create trigger before_after_validate before insert or update of interaction,options,part,position,deleted on public.sessions for each row execute function private.before_after_validate();
create function private.parse_before_after(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b integer; a integer; out jsonb:='{}'::jsonb;
begin
 if p_session.options->>'mode'='steps' or jsonb_typeof(p_value) is distinct from 'object' or p_value='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_value) k where k not in ('before','after')) then return jsonb_build_object('status','invalid_answer'); end if;
 if p_value?'before' then b:=private.bar_int(p_value->'before',1,(p_session.options->>'max')::integer); if b is null then return jsonb_build_object('status','invalid_answer'); end if; out:=out||jsonb_build_object('before',b); end if;
 if p_value?'after' then a:=private.bar_int(p_value->'after',1,(p_session.options->>'max')::integer); if a is null then return jsonb_build_object('status','invalid_answer'); end if; out:=out||jsonb_build_object('after',a); end if;
 return jsonb_build_object('status','ok','text','Before: '||coalesce(b::text,'')||'; After: '||coalesce(a::text,''),'answers','[]'::jsonb,'value',out);
end $$;
create function private.results_before_after(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with s as (select * from public.sessions where id=p_session and engagement_id=p_engagement and not deleted),
 vals as (
  select attendee_id,'before' as side,(value->>'before')::integer as v from s cross join lateral private.bar_answers(p_engagement,s.id) where s.options->>'mode'='paired' and value?'before'
  union all select attendee_id,'after',(value->>'after')::integer from s cross join lateral private.bar_answers(p_engagement,s.id) where s.options->>'mode'='paired' and value?'after'
  union all select attendee_id,'before',(value->>'value')::integer from s cross join lateral private.bar_answers(p_engagement,(s.options->>'before_session')::uuid) where s.options->>'mode'='steps'
  union all select attendee_id,'after',(value->>'value')::integer from s cross join lateral private.bar_answers(p_engagement,(s.options->>'after_session')::uuid) where s.options->>'mode'='steps'
 ), stats as (select count(*) filter(where side='before') as bn,count(*) filter(where side='after') as an,avg(v) filter(where side='before') as ba,avg(v) filter(where side='after') as aa from vals),
 arrays as (select coalesce((s.options->>'max')::integer,10) as m from s),
 cols as (select n,(select count(*) from vals where side='before' and v=n) as b,(select count(*) from vals where side='after' and v=n) as a from arrays cross join generate_series(1,m) n)
 select jsonb_build_object('total',(select count(distinct attendee_id) from vals),'people',(select count(distinct attendee_id) from vals),'words','[]'::jsonb,
 'before_after',jsonb_build_object('max',m,'before',jsonb_build_object('count',bn,'average',ba,'columns',(select jsonb_agg(b order by n) from cols)),
 'after',jsonb_build_object('count',an,'average',aa,'columns',(select jsonb_agg(a order by n) from cols)),'change',round(aa-ba,1))) from stats,arrays
$$;
-- shares_answers=false means no raw pair or per-person patch can leave in snapshots/broadcasts.
-- Inherited privacy covers either source scale, including private seeded scales.
alter function private.step_private(text,jsonb,uuid) rename to step_private_pre_before_after;
create function private.step_private(p_kind text,p_options jsonb,p_seeded uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.step_private_pre_before_after(p_kind,p_options,p_seeded) or (p_kind='before_after' and p_options->>'mode'='steps' and exists(
  select 1 from public.sessions s where s.id::text in (p_options->>'before_session',p_options->>'after_session') and private.step_private_pre_before_after(s.interaction,s.options,s.seeded_from)))
$$;
-- A late source answer must recount and broadcast the currently live aggregate step too.
create function private.before_after_source_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.room_states r set results=private.live_results(r.engagement_id)
 where r.engagement_id=new.engagement_id and not r.deleted and exists(select 1 from public.sessions s where s.id=r.live_session_id and s.interaction='before_after' and not s.deleted and s.options->>'mode'='steps' and new.session_id::text in (s.options->>'before_session',s.options->>'after_session'));
 return new;
end $$;
create trigger before_after_source_changed after insert or update of value,hidden,deleted,withdrawn on public.submissions for each row execute function private.before_after_source_changed();
create function private.before_after_source_visibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.room_states r set results=private.live_results(r.engagement_id)
 where r.engagement_id=new.engagement_id and not r.deleted and exists(select 1 from public.sessions s where s.id=r.live_session_id and s.interaction='before_after' and not s.deleted and s.options->>'mode'='steps' and new.id::text in (s.options->>'before_session',s.options->>'after_session'));
 return new;
end $$;
create trigger before_after_source_visibility after update of options,seeded_from on public.sessions for each row execute function private.before_after_source_visibility();
-- Facilitator status intentionally receives this aggregate, never individual paired submissions.
create function private.items_before_after(p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_array(jsonb_build_object('key','aggregate','text','Room aggregate','count',0,'hidden',false,'before_after',private.results_before_after(s.engagement_id,s.id,p_hidden)->'before_after')) from public.sessions s where s.id=p_session
$$;
revoke all on function private.options_before_after(jsonb,uuid),private.before_after_validate(),private.parse_before_after(public.sessions,text,jsonb),private.results_before_after(uuid,uuid,text[]),private.step_private(text,jsonb,uuid),private.step_private_pre_before_after(text,jsonb,uuid),private.before_after_source_changed(),private.before_after_source_visibility(),private.items_before_after(uuid,text[]) from public,anon,authenticated;
commit;
