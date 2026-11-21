-- Design pass 11, part 4: scale dot identities are opaque within one step.
-- Private-room filtering still happens after results are computed.
begin;
alter function private.bar_options_scale(jsonb) rename to bar_options_scale_pre_pass11;
create function private.bar_options_scale(p jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare out jsonb; bands boolean;
begin
 if jsonb_typeof(p) is distinct from 'object' then return null; end if;
 bands:=private.bar_flag(p->'nps',false);
 if bands is null then return null; end if;
 out:=private.bar_options_scale_pre_pass11(p-'nps');
 if out is null or (bands and out->>'max'<>'10') then return null; end if;
 return out||jsonb_build_object('nps',bands);
end $$;
alter function private.results_scale(uuid,uuid,text[]) rename to results_scale_pre_pass11;
create function private.results_scale(p_engagement uuid,p_session uuid,p_hidden text[]) returns jsonb
language sql stable security definer set search_path='' as $$
 with base as (select private.results_scale_pre_pass11(p_engagement,p_session,p_hidden) as r),
 a as (select attendee_id,(value->>'value')::integer as v from private.bar_answers(p_engagement,p_session) where not ((value->>'value')=any(p_hidden))),
 bands as (select count(*) filter(where v<=6)::integer as low,count(*) filter(where v in (7,8))::integer as middle,count(*) filter(where v>=9)::integer as high,count(*)::integer as total from a)
 select jsonb_set(base.r,'{scale}',base.r->'scale'||jsonb_build_object(
  'dots',coalesce((select jsonb_agg(jsonb_build_object('key',md5(p_session::text||':'||attendee_id::text),'value',v) order by attendee_id) from a),'[]'::jsonb),
  'nps',jsonb_build_object('score',case when total>0 then round(100.0*(high-low)/total)::integer else null end,'low',low,'middle',middle,'high',high)))
 from base,bands
$$;
revoke all on function private.bar_options_scale(jsonb),private.bar_options_scale_pre_pass11(jsonb),private.results_scale(uuid,uuid,text[]),private.results_scale_pre_pass11(uuid,uuid,text[]) from public,anon,authenticated;
commit;
