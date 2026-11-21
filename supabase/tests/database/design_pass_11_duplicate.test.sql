begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(5);

select is(private.duplicate_show_time('2026-03-07 14:30Z','2026-03-06','2026-03-10','America/Toronto','America/Toronto'),
 '2026-03-11 13:30Z'::timestamptz,'Preserve the second day and local start when crossing a clock change');
select is(private.duplicate_show_time('2026-03-07 14:30Z','2026-03-06','2026-03-10','America/Toronto','America/Winnipeg'),
 '2026-03-11 14:30Z'::timestamptz,'Keep the wall-clock start in the target engagement time zone');
select is(private.duplicate_show_time('2026-03-07 14:30Z','2026-03-06',null,'America/Toronto','America/Toronto'),
 '2026-03-07 14:30Z'::timestamptz,'Keep the original start when the target has no date');
select ok(not has_function_privilege('anon','public.duplicate_run_of_show(uuid,uuid,text,text,boolean,boolean,boolean,boolean,jsonb)','execute'),
 'An anonymous connection cannot copy a run of show');
select ok(not has_function_privilege('authenticated','private.duplicate_show_files(uuid)','execute'),
 'The private file inventory requires a permission-checked plan');

select * from finish();
rollback;
