-- The live room's screen buttons and its preview (November 15).
--
-- 1. Blackout, Join and Home under the live screen. One press, tv_screen with screen 'blackout', 'join' or 'holding',
--    takes whatever is live off the TV (like Nothing live: the step stays open for late answers in its segment) and
--    shows that screen. Blackout is a new TV screen: the whole TV goes black.
-- 2. The preview screen. session_preview gives one step of the run of show, live or not, in the shape the TV draws:
--    the step's public fields, its results from the same results functions the TV uses, and its answers.
--
-- room_control keeps every line it has. Its definition is read from the database and rewritten, as the Discover
-- migration did, so nothing else in it can drift.
begin;

alter table public.room_states drop constraint room_states_tv_content_check;
alter table public.room_states add constraint room_states_tv_content_check check (tv_content in ('holding','join','session','screen_check','blackout'));

do $patch$
declare def text; patched text;
 procedure_name constant text:='private.room_control(uuid,uuid,text,jsonb)';
begin
 def:=pg_get_functiondef(procedure_name::regprocedure);
 -- tv_screen is a navigation press: it carries the step it was pressed against and is refused if the room has moved.
 patched:=replace(def,'navigation:=p_action in (''go_live'',''next'',''back'',''nothing_live'',''reopen'');',
  'navigation:=p_action in (''go_live'',''next'',''back'',''nothing_live'',''reopen'',''tv_screen'');');
 if patched=def then raise exception 'The navigation list in % did not patch cleanly',procedure_name; end if;
 def:=patched;
 -- Checked with the other navigation presses: a known screen, and something to change.
 patched:=replace(def,E'elsif p_action=''nothing_live'' then\n   if cur.id is null then return jsonb_build_object(''status'',''unchanged'',''version'',r.version); end if;',
  E'elsif p_action=''tv_screen'' then\n   if p->>''screen'' is null or p->>''screen'' not in (''blackout'',''join'',''holding'') then return jsonb_build_object(''status'',''invalid_request''); end if;\n   if cur.id is null and r.tv_content=p->>''screen'' then return jsonb_build_object(''status'',''unchanged'',''version'',r.version); end if;\n  elsif p_action=''nothing_live'' then\n   if cur.id is null then return jsonb_build_object(''status'',''unchanged'',''version'',r.version); end if;');
 if patched=def then raise exception 'The tv_screen check in % did not patch cleanly',procedure_name; end if;
 def:=patched;
 -- A screen, like Nothing live (a break), does not end the segment.
 patched:=replace(def,'if anchor.id is not null and p_action<>''nothing_live'' and target.id is distinct from anchor.id',
  'if anchor.id is not null and p_action not in (''nothing_live'',''tv_screen'') and target.id is distinct from anchor.id');
 if patched=def then raise exception 'The segment rule in % did not patch cleanly',procedure_name; end if;
 def:=patched;
 -- Nothing goes live; the TV shows the chosen screen.
 patched:=replace(def,E'elsif p_action=''nothing_live'' then\n   v_live:=null; v_content:=''holding''; v_down:=false; v_burst:=null;',
  E'elsif p_action=''tv_screen'' then\n   v_live:=null; v_content:=p->>''screen''; v_down:=false; v_burst:=null;\n  elsif p_action=''nothing_live'' then\n   v_live:=null; v_content:=''holding''; v_down:=false; v_burst:=null;');
 if patched=def then raise exception 'The tv_screen change in % did not patch cleanly',procedure_name; end if;
 execute patched;
end $patch$;

-- One step as the TV would draw it, for the facilitator's preview. Facilitators of the engagement only.
create function private.session_preview(p_engagement uuid,p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.sessions; e public.engagements; shares boolean;
begin
 if p_engagement is null or p_session is null or not coalesce(private.show_allowed(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
 select * into s from public.sessions where id=p_session and engagement_id=p_engagement and not deleted;
 if not found then return jsonb_build_object('status','missing'); end if;
 select * into e from public.engagements where id=p_engagement and not deleted;
 select coalesce(k.shares_answers,true) into shares from private.interaction_kinds k where k.kind=s.interaction;
 return jsonb_build_object('status','ok','server_time',clock_timestamp(),
  'session',jsonb_build_object('id',s.id,'title',s.title,'interaction',s.interaction,'prompt',private.fill_years(s.prompt,e.base_year),'state',s.state,'revision',s.revision,'base_year',e.base_year,
   'max_sends',s.max_sends,'max_characters',s.max_characters,'max_words',s.max_words,'options',private.public_options(s,e.settings),'kind',private.kind_public(s.interaction),
   'settings',jsonb_build_object('anonymous',s.settings->'anonymous','burst_minutes',s.settings->'burst_minutes','join_strip',s.settings->'join_strip')),
  'hidden_keys',to_jsonb(s.hidden_keys),
  'hidden_ids',coalesce((select jsonb_agg(x.id order by x.id) from public.submissions x where x.session_id=s.id and x.hidden and not x.deleted),'[]'::jsonb),
  'results',private.live_results_for(p_engagement,s.id,s.hidden_keys),
  'answers',case when coalesce(shares,true) then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'session_id',x.session_id,'text',x.text,'answers',private.visible_answers(x.answers,s.hidden_keys),
     'value',x.value,'revision',x.revision,'created_at',x.created_at) order by x.id)
    from (select * from public.submissions y where y.session_id=s.id and not y.deleted and not y.withdrawn and not y.hidden order by y.id limit 500) x),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create function public.session_preview(p_engagement uuid,p_session uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.session_preview(p_engagement,p_session) $$;
revoke all on function private.session_preview(uuid,uuid),public.session_preview(uuid,uuid) from public,anon,authenticated;
grant execute on function private.session_preview(uuid,uuid),public.session_preview(uuid,uuid) to authenticated;

commit;
