-- Milestone 7, step 5: the clean export of the signed-off report.
-- The export route reads the newest signed version through the service role. Step 1 keeps that contract in the private schema, which the API does not expose,
-- so this adds the one public door the route needs: a security invoker wrapper that only the service role may call. It changes no table and no earlier function.
--   public.report_export_signed(p_engagement)   the newest signed version, sources stripped, or null before the first sign-off   (service role only)
-- The route checks that the caller is a lead or co-facilitator of the engagement first (by the facilitator's own report_pulse call), then calls this.

create function public.report_export_signed(p_engagement uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.report_signed_for_view(p_engagement) $$;

revoke all on function public.report_export_signed(uuid) from public,anon,authenticated;
grant execute on function public.report_export_signed(uuid) to service_role;
