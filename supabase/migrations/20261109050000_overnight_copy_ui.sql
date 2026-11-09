-- The results recap counts what its own CSV holds (overnight acceptance, November 9).
-- The card's count came from the TV's results, which count words in a word cloud and only
-- the questions still waiting in Q&A, while the CSV has one row for each answer that was
-- not deleted or withdrawn. Each recap entry now also carries csv_rows, counted the way
-- private.session_export lists rows, and the card shows that number.
begin;
alter function private.results_recap(uuid) rename to results_recap_pre_overnight_copy_ui;
create function private.results_recap(p_engagement uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
 base:=private.results_recap_pre_overnight_copy_ui(p_engagement);
 if base->>'status' is distinct from 'ok' then return base; end if;
 return jsonb_set(base,'{sessions}',coalesce((select jsonb_agg(e.entry||jsonb_build_object('csv_rows',
    (select least(count(*),20000)::integer from public.submissions x join public.attendees a on a.id=x.attendee_id
      where x.session_id=(e.entry->'session'->>'id')::uuid and not x.deleted and not x.withdrawn)) order by e.n)
   from jsonb_array_elements(base->'sessions') with ordinality e(entry,n)),'[]'::jsonb));
end $$;
revoke all on function private.results_recap_pre_overnight_copy_ui(uuid) from public,anon,authenticated;
revoke all on function private.results_recap(uuid) from public,anon,authenticated;
grant execute on function private.results_recap(uuid) to authenticated;
commit;
