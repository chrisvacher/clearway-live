begin;

alter function private.options_before_after(jsonb,uuid) rename to options_before_after_pre_question;
create function private.options_before_after(p jsonb,p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare core jsonb; question text;
begin
 if jsonb_typeof(p) is distinct from 'object' then return null; end if;
 if p?'question' and jsonb_typeof(p->'question') is distinct from 'string' then return null; end if;
 question:=nullif(btrim(p->>'question'),'');
 if length(question)>4000 then return null; end if;
 -- Two source scales dictate the range, while the paired mode has its own range.
 core:=private.options_before_after_pre_question(
  case when p->>'mode'='steps' then p-'question'-'max' else p-'question' end,p_engagement);
 if core is null or question is null or core->>'mode'<>'paired' then return core; end if;
 return core||jsonb_build_object('question',question);
end $$;

revoke all on function private.options_before_after(jsonb,uuid),private.options_before_after_pre_question(jsonb,uuid)
from public,anon,authenticated;

-- Reordering sets all positions in one statement. Validate once the scale
-- sources and comparison have all reached their new positions.
drop trigger before_after_validate on public.sessions;
create constraint trigger before_after_validate after insert or update of interaction,options,part,position,deleted on public.sessions
 deferrable initially immediate for each row execute function private.before_after_validate();

commit;
