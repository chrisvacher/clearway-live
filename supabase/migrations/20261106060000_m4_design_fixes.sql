-- Milestone 4 design fixes (November 5). One database change.
--
-- A seeded lens sentence may run to 400 characters. private.parse_lens already refused anything over 400,
-- but then handed the sentence to private.parse_text_answers, which holds it to the step's own
-- max_characters (never more than 280), so a sentence between 281 and 400 was refused.
-- For a seeding step only, the check now uses 400. The live lens wall keeps the step's limit.
-- This is the lens wall's definition (20261104110000) with that one change; nothing else differs.
create or replace function private.parse_lens(p_session public.sessions,p_text text,p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare parsed jsonb; v_lens integer; s public.sessions:=p_session;
begin
 if coalesce(p_session.options->>'seed','false')='true' then
  if jsonb_typeof(p_value) is distinct from 'object' or p_value->>'lens' is null or p_value->>'lens' !~ '^[1-5]$'
   or exists(select 1 from jsonb_object_keys(p_value) k where k<>'lens') then return jsonb_build_object('status','invalid_answer'); end if;
  v_lens:=(p_value->>'lens')::integer;
  s.max_characters:=400;
 elsif p_session.options->>'lens' is null or p_session.options->>'lens' !~ '^[1-5]$' then return jsonb_build_object('status','invalid_answer');
 end if;
 if p_text is null or length(btrim(p_text))>400 or btrim(p_text)='Hidden until Day 1' then return jsonb_build_object('status','invalid_answer'); end if;
 parsed:=private.parse_text_answers(s,p_text,false);
 if parsed->>'status'<>'ok' then return parsed; end if;
 return case when v_lens is not null then parsed||jsonb_build_object('value',jsonb_build_object('lens',v_lens)) else parsed end;
end $$;
