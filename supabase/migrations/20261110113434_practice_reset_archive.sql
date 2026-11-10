-- Reuse the complete reset chain for a fixed-room, service-only nightly job.
-- The base's only change is allowing the trusted SQL service_role. Browser
-- metadata and JWT claims cannot grant that database role.
begin;
create or replace function private.reset_practice_room_base() returns boolean
language plpgsql security definer set search_path='' as $$

declare eng uuid:='90000000-0000-4000-8000-000000000010'::uuid; target_sessions uuid[];
begin
 if not (current_setting('role',true)='service_role' or (select private.is_admin()) or private.can_facilitate(eng)) then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(eng::text,7));
 if not exists(select 1 from public.engagements where id=eng and type='practice' and not deleted) then return false; end if;
 perform 1 from public.room_states where engagement_id=eng for update;
 update public.submissions set deleted=true where engagement_id=eng and not deleted;
 update private.latency_logs set deleted=true where engagement_id=eng and not deleted;
 delete from private.lens_summary_locks where engagement_id=eng;
 update private.scribe_cards set deleted=true where engagement_id=eng and not deleted;
 update private.scribe_files set deleted=true where engagement_id=eng and not deleted;
 update private.signals set deleted=true where engagement_id=eng and not deleted;
 update private.discover_theme_sources set deleted=true where engagement_id=eng and not deleted;
 update private.discover_themes set deleted=true,merged_into=null where engagement_id=eng and not deleted;
 update private.discover_theme_rounds set deleted=true where engagement_id=eng and not deleted;
 update private.survey_findings set deleted=true where engagement_id=eng and not deleted;
 update private.conversation_notes set deleted=true where engagement_id=eng and not deleted;
 update private.candidate_suggestions set deleted=true where engagement_id=eng and not deleted;
 update private.candidate_sources set deleted=true where engagement_id=eng and not deleted;
 update private.candidates set deleted=true,outcome_id=null where engagement_id=eng and not deleted;
 update private.candidate_boards set deleted=true,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_responses set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sources set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summary_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_summaries set deleted=true,current_version_id=null,signed_off_version_id=null,decision_id=null where engagement_id=eng and not deleted;
 update private.lens_summary_versions set deleted=true where engagement_id=eng and not deleted;
 update private.lens_sentences set deleted=true where engagement_id=eng and not deleted;
 update private.lens_openings set deleted=true where engagement_id=eng and not deleted;
 update private.overnight_publications set withdrawn_at=coalesce(withdrawn_at,clock_timestamp()) where engagement_id=eng and withdrawn_at is null;
 delete from private.review_presence where engagement_id=eng;
 update private.draft_photo_texts set deleted=true where engagement_id=eng and not deleted;
 update private.draft_notes set deleted=true where engagement_id=eng and not deleted;
 update private.draft_sources set deleted=true where engagement_id=eng and not deleted;
 update private.draft_bullets set deleted=true where engagement_id=eng and not deleted;
 update private.draft_outcomes set deleted=true where engagement_id=eng and not deleted;
 update private.overnight_rounds set deleted=true where engagement_id=eng and not deleted;
 update private.first_steps set deleted=true where engagement_id=eng and not deleted;
 update private.intent_card_people set deleted=true where engagement_id=eng and not deleted;
 update private.intent_cards set deleted=true where engagement_id=eng and not deleted;
 update private.goal_risks set deleted=true where engagement_id=eng and not deleted;
 update private.goals set deleted=true where engagement_id=eng and not deleted;
 update private.risk_mitigations set deleted=true where engagement_id=eng and not deleted;
 update private.risks set deleted=true where engagement_id=eng and not deleted;
 update private.outcome_indicators set deleted=true where engagement_id=eng and not deleted;
 update private.vision_outcomes set deleted=true,decision_id=null where engagement_id=eng and not deleted;
 update private.decisions set deleted=true where engagement_id=eng and not deleted;
 update private.key_metrics set deleted=true where engagement_id=eng and not deleted;
 update private.celebrations set deleted=true where engagement_id=eng and not deleted;
 update private.map_drafts set deleted=true where engagement_id=eng and not deleted;
 update public.sessions set state='ready',closed_at=null where engagement_id=eng and not deleted and state in ('live','phones_down','closed','open');
 select array_agg(distinct auth_session_id) into target_sessions from public.device_sessions where engagement_id=eng;
 update public.device_sessions set revoked_at=coalesce(revoked_at,now()) where engagement_id=eng;
 update private.room_auth_devices set revoked_at=coalesce(revoked_at,now()),granted_at=null,claim_id=null,claim_started_at=null,deleted=true where engagement_id=eng;
 update private.room_auth_challenges set consumed_at=coalesce(consumed_at,now()),deleted=true where engagement_id=eng;
 update public.join_requests set deleted=true where engagement_id=eng;
 update public.attendees set deleted=true where engagement_id=eng;
 -- Preserve device audit rows, while invalidating JWT access and refresh immediately.
 delete from auth.sessions where id=any(coalesce(target_sessions,array[]::uuid[]));
 update public.engagements set status='setup',survey_respondents=null where id=eng;
 update public.room_states set live_session_id=null,tv_content='holding',phones_down=false,burst_ends_at=null,spotlight_id=null,
   hidden_ids=array[]::uuid[],remote_holder_id=null,team_led_block_id=null,show_tv_on_phones=false,
   results='{"total":0,"people":0,"words":[]}' where engagement_id=eng;
 return true;
end $$;

create table private.practice_reset_runs (
 reset_on date primary key,
 reset_at timestamptz not null default clock_timestamp()
);
alter table private.practice_reset_runs enable row level security;
alter table private.practice_reset_runs force row level security;
revoke all on private.practice_reset_runs from public,anon,authenticated,service_role;

create function private.nightly_practice_reset() returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='1s' as $$
declare eng constant uuid:='90000000-0000-4000-8000-000000000010';
 at_time timestamptz:=clock_timestamp(); day_key date:=(at_time at time zone 'UTC')::date;
begin
 -- The same lock as guest claims, submissions and manual reset, before reading.
 if not pg_try_advisory_xact_lock(hashtextextended(eng::text,7)) then
  return jsonb_build_object('status','busy');
 end if;
 if exists(select 1 from private.practice_reset_runs where reset_on=day_key) then
  return jsonb_build_object('status','already_reset','reset_on',day_key);
 end if;
 if not exists(select 1 from public.engagements where id=eng and type='practice' and not deleted) then
  return jsonb_build_object('status','missing');
 end if;
 perform 1 from public.room_states where engagement_id=eng for update nowait;
 -- An unattended TV does not block cleanup. A phone, recent control press,
 -- setup edit, input or active drafting/review does. Skips consume no daily run.
 if exists(select 1 from public.device_sessions where engagement_id=eng and not deleted and revoked_at is null and last_seen_at>at_time-interval '15 minutes')
  or exists(select 1 from private.room_controls where engagement_id=eng and not deleted and created_at>at_time-interval '15 minutes')
  or exists(select 1 from public.engagements where id=eng and updated_at>at_time-interval '15 minutes')
  or exists(select 1 from public.sessions where engagement_id=eng and not deleted and updated_at>at_time-interval '15 minutes')
  or exists(select 1 from public.submissions where engagement_id=eng and not deleted and updated_at>at_time-interval '15 minutes')
  or exists(select 1 from private.scribe_cards where engagement_id=eng and not deleted and updated_at>at_time-interval '15 minutes')
  or exists(select 1 from private.review_presence where engagement_id=eng and seen_at>at_time-interval '15 minutes')
  or exists(select 1 from private.ai_runs where engagement_id=eng and not deleted and status='running' and updated_at>at_time-interval '15 minutes') then
  return jsonb_build_object('status','active');
 end if;
 if not private.reset_practice_room() then return jsonb_build_object('status','missing'); end if;
 insert into private.practice_reset_runs(reset_on,reset_at) values(day_key,at_time);
 return jsonb_build_object('status','reset','reset_on',day_key);
exception when lock_not_available then return jsonb_build_object('status','busy');
end $$;
create function public.nightly_practice_reset() returns jsonb
language sql security invoker set search_path='' as $$ select private.nightly_practice_reset() $$;
revoke all on function private.nightly_practice_reset(),public.nightly_practice_reset() from public,anon,authenticated;
grant execute on function private.nightly_practice_reset(),public.nightly_practice_reset() to service_role;

-- A single stable RPC reads all records from one MVCC snapshot. Table and column
-- allowlists are fixed at version 1 so future private columns cannot leak by default.
create function private.engagement_archive(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare spec record; rows jsonb; records jsonb:='{}'; filter text;
begin
 if not ((select private.is_admin()) or private.can_facilitate(p_engagement)) then
  return jsonb_build_object('status','denied');
 end if;
 if not exists(select 1 from public.engagements e join public.churches c on c.id=e.church_id
   where e.id=p_engagement and not e.deleted and not c.deleted) then return jsonb_build_object('status','missing'); end if;
 for spec in select * from (values
  ('private','ai_group_members',array['id','group_id','submission_id','engagement_id','session_id','run_id','removed_at','removed_by','created_at','updated_at','deleted']),
  ('private','ai_groups',array['id','engagement_id','session_id','label','ai_label','renamed_by','renamed_at','pinned','run_id','undone_at','undone_by','created_at','updated_at','deleted']),
  ('private','ai_runs',array['id','engagement_id','session_id','job','model','prompt_version','inputs','output','status','changed','input_tokens','output_tokens','cost_usd','ms','error','finished_at','undone_at','undone_by','created_at','updated_at','deleted']),
  ('private','ai_summaries',array['id','engagement_id','session_id','text','answers','cut_at','run_id','created_at','updated_at','deleted']),
  ('private','ai_word_merges',array['id','engagement_id','session_id','survivor_key','member_key','run_id','undone_at','undone_by','created_at','updated_at','deleted']),
  ('private','bullet_drafts',array['id','engagement_id','session_id','attendee_id','outcome_id','text','seq','typed_at','created_at','updated_at','deleted']),
  ('private','candidate_boards',array['session_id','engagement_id','phase','cut','ai_requested_at','ai_drafted_at','ai_note','marked_at','decision_id','created_at','updated_at','deleted']),
  ('private','candidate_sources',array['id','engagement_id','candidate_id','sentence_id','created_at','updated_at','deleted']),
  ('private','candidate_suggestions',array['id','engagement_id','session_id','attendee_id','kind','candidate_id','into_id','text','status','created_at','updated_at','deleted','test']),
  ('private','candidates',array['id','engagement_id','session_id','name','position','status','merged_into','origin','edited','run_id','outcome_id','created_at','updated_at','deleted']),
  ('private','celebrations',array['id','engagement_id','text','theme','session_id','created_at','updated_at','deleted']),
  ('private','check_in_answers',array['id','recipient_id','engagement_id','first_step_id','goal_id','answer','note','followed_up_at','followed_up_by','created_at','updated_at']),
  ('private','check_in_recipients',array['id','round_id','engagement_id','email','name','attendee_id','items','send_result','sent_at','opened_at','answered_at','help','created_at','updated_at']),
  ('private','check_in_rounds',array['id','engagement_id','day','due_on','status','sent_at','sent_by','claimed_at','snapshot','created_at','updated_at','made_by_close']),
  ('private','conversation_notes',array['id','engagement_id','kind','person','title','body','source_kind','char_count','word_count','seq','created_at','updated_at','deleted']),
  ('private','decisions',array['id','engagement_id','session_id','subject','subject_id','subject_label','decision','reasons','counts','marked_by','marked_at','created_at','updated_at','deleted']),
  ('private','discover_theme_rounds',array['id','engagement_id','status','request_id','redraft','requested_at','requested_by','attempts','last_failed_at','last_error','last_ok_at','last_offered','last_refused','inputs','created_at','updated_at','deleted']),
  ('private','discover_theme_sources',array['id','engagement_id','theme_id','finding_id','note_id','card_id','quote','created_at','updated_at','deleted']),
  ('private','discover_themes',array['id','engagement_id','source','label','detail','rests_on','out_of','quotes','status','merged_into','ai_run','test','seq','created_at','updated_at','deleted','original_label']),
  ('private','draft_bullets',array['id','engagement_id','draft_outcome_id','position','text','ai_text','room_text','origin','removed','created_at','updated_at','deleted']),
  ('private','draft_notes',array['id','engagement_id','draft_outcome_id','kind','text','source_kind','source_id','position','created_at','updated_at','deleted']),
  ('private','draft_outcomes',array['id','engagement_id','round_id','outcome_id','position','name','original_name','description','tidy','thin_ack_by','thin_ack_at','reviewed_by','reviewed_at','unreadable','revision','created_at','updated_at','deleted']),
  ('private','draft_photo_texts',array['file_id','engagement_id','text','typed_by','typed_at','created_at','updated_at','deleted']),
  ('private','draft_sources',array['id','engagement_id','draft_outcome_id','bullet_id','kind','ref_id','excerpt','position','created_at','updated_at','deleted']),
  ('private','draft_versions',array['id','engagement_id','draft_outcome_id','n','kind','what','actor_id','at','snapshot']),
  ('private','first_steps',array['id','engagement_id','card_id','text','owner_attendee_id','owner_name','owner_email','due_date','position','created_at','updated_at','deleted']),
  ('private','followup_access',array['id','engagement_id','attendee_id','email','session_ids','opens_at','closes_at','attempts','locked_until','revoked_at','swept_at','issued_at','issued_by','created_at','updated_at','deleted']),
  ('private','four_list_agrees',array['id','engagement_id','session_id','card_id','attendee_id','agreed','revision','phone_sent_at','queued_at','server_received_at','test','created_at','updated_at','deleted']),
  ('private','four_list_cards',array['submission_id','engagement_id','session_id','col','words','pinned','pinned_by','created_at','updated_at','deleted']),
  ('private','four_list_folds',array['id','engagement_id','session_id','survivor_id','member_id','made_by','detail','undone_at','undone_by','created_at','updated_at','deleted']),
  ('private','goal_risks',array['goal_id','risk_id','engagement_id','created_at','updated_at','deleted']),
  ('private','goals',array['id','engagement_id','outcome_id','title','result','result_clear','owner_attendee_id','owner_name','owner_email','end_date','season','position','created_at','updated_at','deleted','proposed_by']),
  ('private','grid_merges',array['id','engagement_id','session_id','item_key','into_key','created_at','updated_at','deleted','made_by','run_id']),
  ('private','heard_drafts',array['id','engagement_id','source_key','number','line','detail','quotes','rests','thin','thin_reason','basis','theme_ids','by_hand','edited','ai_run','drafted_at','applied_at','applied_session','test','seq','created_at','updated_at','deleted']),
  ('private','heard_rounds',array['id','engagement_id','status','request_id','requested_at','requested_by','attempts','last_failed_at','last_error','last_ok_at','last_offered','last_refused','last_kept','inputs','created_at','updated_at','deleted']),
  ('private','intent_card_people',array['card_id','attendee_id','engagement_id','created_at','updated_at','deleted']),
  ('private','intent_cards',array['id','engagement_id','outcome_id','intent','must_do','what_we_stop','created_at','updated_at','deleted']),
  ('private','key_metrics',array['id','engagement_id','text','rank','session_id','created_at','updated_at','deleted']),
  ('private','latency_logs',array['id','engagement_id','submission_id','revision','room_version','phone_sent_at','server_received_at','server_accepted_at','tv_session_id','tv_received_at','clock_uncertainty_ms','created_at','updated_at','deleted']),
  ('private','lens_openings',array['id','engagement_id','lens','session_id','opened_at','created_at','updated_at','deleted']),
  ('private','lens_sentences',array['id','engagement_id','lens','source','text','session_id','submission_id','attendee_id','withdrawn','created_at','updated_at','deleted']),
  ('private','lens_summaries',array['id','engagement_id','lens','state','current_version_id','signed_off_version_id','decision_id','created_at','updated_at','deleted','draft_held','fold_held','fold_now_at','fold_tried','fold_tried_at']),
  ('private','lens_summary_responses',array['id','engagement_id','version_id','attendee_id','response','suggestion','created_at','updated_at','deleted','submission_id']),
  ('private','lens_summary_sentences',array['id','engagement_id','version_id','position','text','created_at','updated_at','deleted','from_sentence_id']),
  ('private','lens_summary_sources',array['summary_sentence_id','lens_sentence_id','engagement_id','created_at','updated_at','deleted']),
  ('private','lens_summary_versions',array['id','engagement_id','summary_id','version','author','ai_run_id','note','changes','shown_at','undone_at','created_at','updated_at','deleted','tracked','based_on']),
  ('private','map_drafts',array['engagement_id','pages','version','assembled_at','created_at','updated_at','deleted']),
  ('private','outcome_focus',array['session_id','engagement_id','outcome_id','created_at','updated_at','deleted']),
  ('private','outcome_indicators',array['id','engagement_id','outcome_id','text','position','created_at','updated_at','deleted','submission_id']),
  ('private','overnight_publications',array['id','engagement_id','round_id','n','snapshot','published_by','published_at','withdrawn_at']),
  ('private','overnight_rounds',array['id','engagement_id','status','day_closed_at','ready_at','attempts','last_failed_at','last_error','inputs','unreadable','published_at','published_by','created_at','updated_at','deleted']),
  ('private','qa_merges',array['id','engagement_id','session_id','survivor_id','member_id','made_by','actor_id','detail','undone_at','undone_by','created_at','updated_at','deleted']),
  ('private','qa_questions',array['submission_id','engagement_id','session_id','words','edited_text','edited_by','edited_at','answered_at','answered_by','created_at','updated_at','deleted']),
  ('private','qa_votes',array['id','engagement_id','session_id','question_id','attendee_id','voted','revision','phone_sent_at','queued_at','server_received_at','created_at','updated_at','deleted','test']),
  ('private','ranking_suggestions',array['id','engagement_id','session_id','attendee_id','text','words','status','option_key','created_at','updated_at','deleted','test']),
  ('private','read_back_boards',array['session_id','engagement_id','current_item_id','pub_n','loaded_at','test','created_at','updated_at','deleted']),
  ('private','read_back_corrections',array['id','engagement_id','session_id','item_id','version_id','line_id','new_line','wording','reason','source','by_user','by_attendee','state','failure','run_id','result_version_id','test','created_at','updated_at','deleted']),
  ('private','read_back_items',array['id','engagement_id','session_id','kind','lens','outcome_id','heading','position','state','current_version_id','settled_version_id','decision_id','landed_version_id','landed_prev_id','test','created_at','updated_at','deleted']),
  ('private','read_back_lines',array['id','engagement_id','version_id','position','text','from_line_id','base_text','origin','sources','created_at','updated_at','deleted']),
  ('private','read_back_versions',array['id','engagement_id','item_id','version','author','ai_run_id','correction_id','note','tracked','based_on','changes','undone_at','created_at','updated_at','deleted']),
  ('private','read_only_links',array['id','engagement_id','name','created_by','created_at','revoked_by','revoked_at','last_opened_at','open_count']),
  ('private','rehearsal_log',array['id','engagement_id','actor_id','action','answers','votes','suggestions','sessions','created_at','updated_at','deleted','themes','signals','other']),
  ('private','report_drafts',array['id','engagement_id','created_by','test','created_at','updated_at','deleted']),
  ('private','report_rounds',array['id','engagement_id','status','request_id','requested_at','requested_by','queue','current','attempts','last_failed_at','last_error','last_ok_at','last_kept','last_dropped','test','created_at','updated_at','deleted']),
  ('private','report_sections',array['id','engagement_id','draft_id','key','position','heading','kind','status','blocks','ai_run','error','dropped','drafted_at','reviewed_by','reviewed_at','created_at','updated_at','deleted','plan_stale']),
  ('private','report_sentences',array['id','engagement_id','section_id','position','text','origin','ai_text','quote','thin_label','touched','created_at','updated_at','deleted']),
  ('private','report_sign_offs',array['id','engagement_id','n','request_id','snapshot','signed_by','signed_at','test','created_at','updated_at','deleted']),
  ('private','report_sources',array['id','engagement_id','sentence_id','kind','ref_id','excerpt','room_words','position','created_at','updated_at','deleted']),
  ('private','risk_mitigations',array['id','engagement_id','risk_id','text','recorded_by','created_at','updated_at','deleted','card_id','link_removed']),
  ('private','risks',array['id','engagement_id','text','likelihood','impact','merged_into','created_at','updated_at','deleted','session_id','item_key','added_by']),
  ('private','room_controls',array['id','engagement_id','actor_id','action','session_id','room_version','created_at','updated_at','deleted']),
  ('private','scribe_cards',array['id','engagement_id','session_id','kind','text','detail','speaker','attendee_id','captured_at','queued_at','received_at','seq','revision','refiled_from','created_at','updated_at','deleted','test','promoted_session','promoted_text','promoted_at']),
  ('private','scribe_files',array['id','engagement_id','session_id','kind','name','content_type','bytes','storage_path','uploaded_at','attendee_id','captured_at','queued_at','received_at','seq','refiled_from','created_at','updated_at','deleted','test']),
  ('private','session_media',array['id','engagement_id','session_id','mime','width','height','created_at','updated_at','deleted']),
  ('private','session_notes',array['session_id','engagement_id','notes','created_at','updated_at','deleted']),
  ('private','signals',array['id','engagement_id','session_id','kind','theme_id','evidence','dismissed_at','saved_as_citation_at','neutral_question_sent_at','ai_run','test','seq','created_at','updated_at','deleted','title','line','ask','ask_sent','on_tv']),
  ('private','survey_findings',array['id','engagement_id','title','figure','rests_on','seq','created_at','updated_at','deleted']),
  ('private','team_blocks',array['id','engagement_id','session_ids','attendee_id','holder','via','followup_id','started_at','ended_at','end_reason','created_at','updated_at','deleted']),
  ('private','visibility_plan_rounds',array['id','engagement_id','status','request_id','requested_at','requested_by','attempts','last_failed_at','last_error','last_ok_at','last_kept','last_dropped','test','created_at','updated_at','deleted']),
  ('private','visibility_plan_rows',array['id','engagement_id','plan_id','position','stage','who','when_text','when_date','by_whom','what_they_hear','risk','origin','touched','reviewed_at','reviewed_by','test','created_at','updated_at','deleted','when_blanked']),
  ('private','visibility_plan_sources',array['id','engagement_id','row_id','kind','ref_id','excerpt','position','created_at','updated_at','deleted']),
  ('private','visibility_plans',array['id','engagement_id','moment','public_date','status','error','dropped','ai_run','drafted_at','created_by','test','created_at','updated_at','deleted']),
  ('private','vision_outcomes',array['id','engagement_id','title','description','status','what_we_stop','position','decision_id','confirmed_at','created_at','updated_at','deleted','renamed_from']),
  ('public','attendees',array['id','engagement_id','name','email','room_role','role_at_church','verified_at','team_hub_person_id','extra_fields','created_at','updated_at','deleted']),
  ('public','churches',array['id','name','timezone','logo_url','mission','purpose','values','strategy','leadership_rhythms','governance_body_name','team_hub_client_id','core_organization_id','created_at','updated_at','deleted']),
  ('public','engagement_facilitators',array['id','engagement_id','clearway_user_id','role','created_at','updated_at','deleted']),
  ('public','engagements',array['id','church_id','title','type','status','start_date','end_date','base_year','lens_names','settings','how_the_room_decides','team_hub_client_id','team_hub_engagement_id','created_at','updated_at','deleted','pre_call_at','retreat_start_date','retreat_end_date','room_code','survey_respondents','day2_closed_at']),
  ('public','room_states',array['engagement_id','live_session_id','tv_content','phones_down','burst_ends_at','spotlight_id','hidden_ids','remote_holder_id','team_led_block_id','show_tv_on_phones','phone_refresh_version','results','version','created_at','updated_at','deleted','spotlight_key','hidden_keys','neutral_question']),
  ('public','sessions',array['id','engagement_id','title','part','position','planned_start','planned_minutes','mode','interaction','prompt','phone_depth','state','max_sends','max_characters','max_words','closed_at','created_at','updated_at','deleted','revision','settings','opens_at','closes_at','lands_in','segment','hidden_keys','shown_at','options','seeded_from','team_led']),
  ('public','submissions',array['id','engagement_id','session_id','attendee_id','text','answers','revision','withdrawn','hidden','test','phone_sent_at','queued_at','server_received_at','clock_uncertainty_ms','created_at','updated_at','deleted','value','replaced_by'])
 ) as allowed(schema_name,table_name,columns)
 loop
  filter:=case spec.table_name
   when 'churches' then 't.id=(select church_id from public.engagements where id=$1)'
   when 'engagements' then 't.id=$1'
   else 't.engagement_id=$1' end;
  if spec.table_name='lens_sentences' then
   filter:=filter||' and (t.source=''live'' or private.lens_is_open($1,t.lens))';
  elsif spec.table_name='submissions' then
   filter:=filter||' and not exists(select 1 from private.lens_sentences l where l.submission_id=t.id and l.source=''seeded'' and not private.lens_is_open($1,l.lens))';
  end if;
  execute format('select coalesce(jsonb_agg((select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(t)) where key=any($2)) order by to_jsonb(t)->>''id''),''[]''::jsonb) from %I.%I t where %s',
   spec.schema_name,spec.table_name,filter) into rows using p_engagement,spec.columns;
  records:=records||jsonb_build_object(spec.table_name,rows);
 end loop;
 records:=records||jsonb_build_object('facilitators',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'email',u.email) order by u.id)
  from public.clearway_users u where exists(select 1 from public.engagement_facilitators f where f.engagement_id=p_engagement and f.clearway_user_id=u.id)),'[]'::jsonb));
 return jsonb_build_object('status','ok','format','clearway.engagement','version',1,'exported_at',statement_timestamp(),
  'engagement_id',p_engagement,'includes_deleted',true,'file_bytes_included',false,'records',records);
end $$;
create function public.engagement_archive(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.engagement_archive(p_engagement) $$;
revoke all on function private.engagement_archive(uuid),public.engagement_archive(uuid) from public,anon,authenticated;
grant execute on function private.engagement_archive(uuid),public.engagement_archive(uuid) to authenticated;
commit;
