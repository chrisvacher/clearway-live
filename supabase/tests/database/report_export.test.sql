-- Milestone 7, step 5: the one public door for the signed report's export. Only the service role may call it, it is a security invoker wrapper,
-- and it hands back exactly what the step 1 contract function returns (null while nothing is signed).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(8);

select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='report_export_signed'),1::bigint,'The export door exists in public');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='report_export_signed'),false,'as a security invoker wrapper');
select is(has_function_privilege('anon','public.report_export_signed(uuid)','execute'),false,'Anonymous browsers cannot call it');
select is(has_function_privilege('authenticated','public.report_export_signed(uuid)','execute'),false,'and neither can a signed-in facilitator, who goes through the route');
select is(has_function_privilege('service_role','public.report_export_signed(uuid)','execute'),true,'The service role can');

set local role authenticated;
select throws_ok($$select public.report_export_signed('ae070000-0000-4000-8000-000000000100')$$,'42501',null,'A facilitator calling it directly is refused');
reset role;
set local role service_role;
select is(public.report_export_signed('ae070000-0000-4000-8000-000000000999'),null::jsonb,'The service role gets null where nothing is signed');
select is(public.report_export_signed('ae070000-0000-4000-8000-000000000999'),private.report_signed_for_view('ae070000-0000-4000-8000-000000000999'),'which is what the contract function returns');
reset role;

select * from finish();
rollback;
