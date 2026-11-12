-- After the workshop (design pass 8, step 4): a short summary of what the room said, drafted by AI from the same
-- results the recap shows and then the facilitator's to edit. One summary per engagement.
--  * private.workshop_summaries holds the words, who wrote them last and when.
--  * workshop_summary_state reads it, with whether AI is on for the engagement.
--  * workshop_summary_save keeps the facilitator's edit, or an AI draft with its run in the same log as every other AI job.
--  * workshop_summary_clear removes it.
-- The lead and co-facilitators and an admin only. Nothing here reaches the room, a phone or the TV.
begin;

create table private.workshop_summaries (
 engagement_id uuid primary key references public.engagements(id),
 body text not null check(length(body) between 1 and 6000),
 source text not null check(source in ('ai','edited')),
 run_id uuid references private.ai_runs(id),
 drafted_at timestamptz,
 updated_by uuid references public.clearway_users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index workshop_summaries_run_idx on private.workshop_summaries(run_id);
create index workshop_summaries_updated_by_idx on private.workshop_summaries(updated_by);
alter table private.workshop_summaries enable row level security;
alter table private.workshop_summaries force row level security;
revoke all on private.workshop_summaries from public,anon,authenticated;

alter table private.ai_runs drop constraint ai_runs_job_check;
alter table private.ai_runs add constraint ai_runs_job_check check(job in ('combine_words','group_wall','summarize_wall','fold_questions','merge_reasons','group_lens','overnight_draft','draft_lens_summary','fold_lens_summary','propose_candidates','fold_four_lists','draft_discover_themes','draft_what_we_heard','alignment_signal','fold_read_back','draft_report','draft_visibility_plan','draft_workshop_summary'));
alter table private.ai_runs drop constraint ai_runs_session_check;
alter table private.ai_runs add constraint ai_runs_session_check check(session_id is not null or job in ('overnight_draft','draft_discover_themes','draft_what_we_heard','draft_report','draft_visibility_plan','draft_workshop_summary'));

create function private.workshop_summary_state(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.engagements; w private.workshop_summaries;
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into w from private.workshop_summaries where engagement_id=p_engagement;
 return jsonb_build_object('status','ok','ai',coalesce(e.settings->>'ai_enabled','false')='true',
  'summary',case when w.engagement_id is null then null else jsonb_build_object('body',w.body,'source',w.source,'drafted_at',w.drafted_at,'updated_at',w.updated_at) end);
end $$;
create function public.workshop_summary_state(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.workshop_summary_state(p_engagement) $$;

-- p is {"body":"..."} for the facilitator's own words, or {"body":"...","ai":{"model":"...","prompt_version":"...","inputs":{...},
-- "input_tokens":n,"output_tokens":n,"cost_usd":n,"ms":n}} for a draft the server has just had written.
create function private.workshop_summary_save(p_engagement uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.engagements; v_body text; v_ai jsonb; v_run uuid; t timestamptz:=clock_timestamp();
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 select * into e from public.engagements where id=p_engagement and not deleted for update;
 if not found then return jsonb_build_object('status','missing'); end if;
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'body') is distinct from 'string' then return jsonb_build_object('status','invalid_request'); end if;
 v_body:=btrim(p->>'body');
 if length(v_body) not between 1 and 6000 then return jsonb_build_object('status','invalid_request'); end if;
 v_ai:=p->'ai';
 if v_ai is not null then
  if jsonb_typeof(v_ai)<>'object' or length(coalesce(v_ai->>'model','')) not between 1 and 100 or length(coalesce(v_ai->>'prompt_version','')) not between 1 and 60
   or jsonb_typeof(v_ai->'inputs') is distinct from 'object' or pg_column_size(v_ai->'inputs')>262144 then return jsonb_build_object('status','invalid_request'); end if;
  if coalesce(e.settings->>'ai_enabled','false')<>'true' then return jsonb_build_object('status','ai_off'); end if;
  insert into private.ai_runs(engagement_id,session_id,job,model,prompt_version,inputs,output,status,changed,input_tokens,output_tokens,cost_usd,ms,finished_at,created_at)
  values(p_engagement,null,'draft_workshop_summary',v_ai->>'model',v_ai->>'prompt_version',v_ai->'inputs',jsonb_build_object('body',v_body),'ok',true,
   least(greatest(coalesce((v_ai->>'input_tokens')::numeric,0),0),10000000)::integer,least(greatest(coalesce((v_ai->>'output_tokens')::numeric,0),0),10000000)::integer,
   least(greatest(coalesce((v_ai->>'cost_usd')::numeric,0),0),1000),least(greatest(coalesce((v_ai->>'ms')::numeric,0),0),600000)::integer,t,t) returning id into v_run;
 end if;
 insert into private.workshop_summaries(engagement_id,body,source,run_id,drafted_at,updated_by,updated_at)
 values(p_engagement,v_body,case when v_run is null then 'edited' else 'ai' end,v_run,case when v_run is null then null else t end,(select private.clearway_user_id()),t)
 on conflict(engagement_id) do update set body=excluded.body,source=excluded.source,run_id=coalesce(excluded.run_id,private.workshop_summaries.run_id),
  drafted_at=coalesce(excluded.drafted_at,private.workshop_summaries.drafted_at),updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 return private.workshop_summary_state(p_engagement);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid_request');
end $$;
create function public.workshop_summary_save(p_engagement uuid,p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.workshop_summary_save(p_engagement,p) $$;

create function private.workshop_summary_clear(p_engagement uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then raise insufficient_privilege; end if;
 if not exists(select 1 from public.engagements where id=p_engagement and not deleted) then return jsonb_build_object('status','missing'); end if;
 delete from private.workshop_summaries where engagement_id=p_engagement;
 return private.workshop_summary_state(p_engagement);
end $$;
create function public.workshop_summary_clear(p_engagement uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.workshop_summary_clear(p_engagement) $$;

revoke all on function private.workshop_summary_state(uuid),public.workshop_summary_state(uuid),private.workshop_summary_save(uuid,jsonb),public.workshop_summary_save(uuid,jsonb),
 private.workshop_summary_clear(uuid),public.workshop_summary_clear(uuid) from public,anon,authenticated;
grant execute on function private.workshop_summary_state(uuid),public.workshop_summary_state(uuid),private.workshop_summary_save(uuid,jsonb),public.workshop_summary_save(uuid,jsonb),
 private.workshop_summary_clear(uuid),public.workshop_summary_clear(uuid) to authenticated;

commit;
