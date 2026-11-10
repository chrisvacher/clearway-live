-- Operational data stays private and is excluded from engagement exports.
begin;
create table private.file_backups (
 id uuid primary key default gen_random_uuid(),
 file_id uuid,
 source_version text not null check(length(source_version) between 1 and 100),
 storage_path text not null check(length(storage_path) between 1 and 300),
 name text not null check(length(name) between 1 and 200),
 content_type text not null check(length(content_type) between 1 and 120),
 bytes integer not null check(bytes between 1 and 15728640),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 probe boolean not null default false,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(storage_path,source_version,sha256)
);
create index file_backups_file_idx on private.file_backups(file_id,completed_at);
create table private.file_backup_chunks (
 backup_id uuid not null references private.file_backups(id) on delete cascade,
 part integer not null check(part between 0 and 14),
 data bytea not null check(octet_length(data) between 1 and 1048576),
 primary key(backup_id,part)
);
create table private.operations_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(),
 finished_at timestamptz, copied integer not null default 0, failed integer not null default 0,
 status text not null default 'running' check(status in ('running','ok','failed')),
 recovery_verified_at timestamptz
);
create index operations_runs_recent_idx on private.operations_runs(started_at desc);
create table private.client_errors (
 id uuid primary key default gen_random_uuid(), hour timestamptz not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 event jsonb not null check(jsonb_typeof(event)='object' and octet_length(event::text)<=4096),
 release text not null check(release ~ '^(unknown|[a-f0-9]{7,40})$'),
 occurrences integer not null default 1, first_seen timestamptz not null default now(),
 last_seen timestamptz not null default now(), unique(hour,fingerprint,release)
);
create index client_errors_recent_idx on private.client_errors(last_seen desc);
create table private.operations_limits (
 hour timestamptz not null, client_hash text not null, hits integer not null, primary key(hour,client_hash)
);
create table private.operations_alerts (
 hour timestamptz primary key, snapshot jsonb not null, claimed_at timestamptz not null default now(), sent_at timestamptz
);
do $$ declare n text; begin
 foreach n in array array['file_backups','file_backup_chunks','operations_runs','client_errors','operations_limits','operations_alerts'] loop
  execute format('alter table private.%I enable row level security',n);
  execute format('alter table private.%I force row level security',n);
  execute format('revoke all on private.%I from public,anon,authenticated',n);
  execute format('grant select,insert,update,delete on private.%I to service_role',n);
 end loop;
end $$;

create function public.ops_backup_candidates(p_file uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(x),'[]'::jsonb) from (
 select f.id,f.storage_path as path,f.name,f.content_type,f.bytes,
   md5(o.updated_at::text||coalesce(o.metadata->>'eTag','')) as source_version
 from private.scribe_files f join public.engagements e on e.id=f.engagement_id
 left join storage.objects o on o.bucket_id='scribe' and o.name=f.storage_path
 where f.uploaded_at is not null and not f.deleted and not e.deleted and e.type<>'practice'
   and (p_file is null or f.id=p_file)
   and not exists(select 1 from private.file_backups b where b.file_id=f.id and b.completed_at is not null
     and b.source_version=md5(o.updated_at::text||coalesce(o.metadata->>'eTag','')))
 order by f.uploaded_at,f.id limit 20) x
$$;
create function public.ops_backup_begin(p_file uuid,p_source text,p_sha text,p_bytes integer,p_probe uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f private.scribe_files; b private.file_backups; version text; path text; name_ text; type_ text;
begin
 if p_probe is not null then
  if not exists(select 1 from private.operations_runs where id=p_probe and status='running') then return jsonb_build_object('status','denied'); end if;
  path:='operations-probe/'||p_probe::text||'/backup-check.txt'; name_:='backup-check.txt'; type_:='text/plain';
  if p_file is not null or p_bytes>15728640 then return jsonb_build_object('status','invalid'); end if;
 else
  select s.* into f from private.scribe_files s join public.engagements e on e.id=s.engagement_id
   where s.id=p_file and s.uploaded_at is not null and not s.deleted and not e.deleted and e.type<>'practice';
  if not found then return jsonb_build_object('status','not_found'); end if;
  path:=f.storage_path; name_:=f.name; type_:=f.content_type;
  if f.bytes<>p_bytes then return jsonb_build_object('status','size_mismatch'); end if;
 end if;
 select md5(o.updated_at::text||coalesce(o.metadata->>'eTag','')) into version from storage.objects o where o.bucket_id='scribe' and o.name=path;
 if version is distinct from p_source then return jsonb_build_object('status','changed'); end if;
 if p_sha is null or p_sha !~ '^[a-f0-9]{64}$' or p_bytes is null or p_bytes not between 1 and 15728640 then return jsonb_build_object('status','invalid'); end if;
 insert into private.file_backups(file_id,source_version,storage_path,name,content_type,bytes,sha256,probe)
  values(p_file,p_source,path,name_,type_,p_bytes,p_sha,p_probe is not null)
  on conflict(storage_path,source_version,sha256) do nothing;
 select * into b from private.file_backups where storage_path=path and source_version=p_source and sha256=p_sha;
 return jsonb_build_object('status',case when b.completed_at is null then 'pending' else 'complete' end,'id',b.id,'parts',ceil(b.bytes/1048576.0)::integer);
end $$;
create function public.ops_backup_put(p_backup uuid,p_part integer,p_data text) returns boolean
language plpgsql security definer set search_path='' as $$
declare b private.file_backups; raw bytea;
begin
 select * into b from private.file_backups where id=p_backup for update;
 if not found or b.completed_at is not null or p_part is null or p_part<0 or p_part>=ceil(b.bytes/1048576.0) or p_data is null or length(p_data)>1500000 then return false; end if;
 raw:=decode(p_data,'base64');
 if octet_length(raw)<>least(1048576,b.bytes-p_part*1048576) then return false; end if;
 insert into private.file_backup_chunks values(p_backup,p_part,raw) on conflict(backup_id,part) do update set data=excluded.data;
 return true;
exception when invalid_parameter_value then return false;
end $$;
create function public.ops_backup_finish(p_backup uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare b private.file_backups; raw bytea; n bigint;
begin
 select * into b from private.file_backups where id=p_backup for update;
 if not found then return false; end if;
 if b.completed_at is not null then return true; end if;
 if not b.probe and not exists(select 1 from storage.objects o where o.bucket_id='scribe' and o.name=b.storage_path and md5(o.updated_at::text||coalesce(o.metadata->>'eTag',''))=b.source_version) then return false; end if;
 select string_agg(data,''::bytea order by part),count(*) into raw,n from private.file_backup_chunks where backup_id=p_backup;
 if n<>ceil(b.bytes/1048576.0)::integer or octet_length(raw)<>b.bytes or encode(extensions.digest(raw,'sha256'),'hex')<>b.sha256 then return false; end if;
 update private.file_backups set completed_at=clock_timestamp() where id=p_backup;
 return true;
end $$;
create function public.ops_backup_chunk(p_backup uuid,p_part integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b private.file_backups;
begin
 if not (current_setting('role',true)='service_role' or (select private.is_admin())) then return jsonb_build_object('status','denied'); end if;
 select * into b from private.file_backups where id=p_backup and completed_at is not null;
 if not found then return jsonb_build_object('status','not_found'); end if;
 return jsonb_build_object('status','ok','name',b.name,'content_type',b.content_type,'bytes',b.bytes,'sha256',b.sha256,
  'parts',ceil(b.bytes/1048576.0)::integer,'data',(select encode(data,'base64') from private.file_backup_chunks where backup_id=b.id and part=p_part));
end $$;
create function public.ops_backup_run(p_run uuid default null,p_copied integer default 0,p_failed integer default 0,p_verified boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare id_ uuid;
begin
 if p_run is null then
  insert into private.operations_runs default values returning id into id_;
  return id_;
 end if;
 update private.operations_runs set finished_at=clock_timestamp(),copied=greatest(0,p_copied),failed=greatest(0,p_failed),
  status=case when p_failed>0 then 'failed' else 'ok' end,recovery_verified_at=case when p_verified then clock_timestamp() end where id=p_run;
 return p_run;
end $$;
create function public.ops_probe_source(p_run uuid) returns text
language sql stable security definer set search_path='' as $$
 select md5(o.updated_at::text||coalesce(o.metadata->>'eTag','')) from storage.objects o
 join private.operations_runs r on r.id=p_run and r.status='running'
 where o.bucket_id='scribe' and o.name='operations-probe/'||p_run::text||'/backup-check.txt'
$$;
create function public.ops_record_error(p_event jsonb,p_fingerprint text,p_client_hash text,p_release text) returns text
language plpgsql security definer set search_path='' as $$
declare h timestamptz:=date_trunc('hour',now()); global_hits integer; client_hits integer;
begin
 if p_fingerprint is null or p_client_hash is null or p_release is null or p_event is null or jsonb_typeof(p_event)<>'object' or octet_length(p_event::text)>4096 or p_fingerprint !~ '^[a-f0-9]{64}$'
  or p_client_hash !~ '^[a-f0-9]{64}$' or p_release !~ '^(unknown|[a-f0-9]{7,40})$' then return 'invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended('operations-errors',0));
 select hits into global_hits from private.operations_limits where hour=h and client_hash='global';
 select hits into client_hits from private.operations_limits where hour=h and client_hash=p_client_hash;
 if coalesce(global_hits,0)>=1000 or coalesce(client_hits,0)>=30 then return 'limited'; end if;
 insert into private.operations_limits values(h,'global',1) on conflict(hour,client_hash) do update set hits=private.operations_limits.hits+1;
 insert into private.operations_limits values(h,p_client_hash,1) on conflict(hour,client_hash) do update set hits=private.operations_limits.hits+1;
 insert into private.client_errors(hour,fingerprint,event,release) values(h,p_fingerprint,p_event,p_release)
  on conflict(hour,fingerprint,release) do update set occurrences=private.client_errors.occurrences+1,last_seen=clock_timestamp();
 return 'recorded';
end $$;
create function public.ops_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (current_setting('role',true)='service_role' or (select private.is_admin())) then return jsonb_build_object('status','denied'); end if;
 return jsonb_build_object('status','ok',
  'eligible_files',(select count(*) from private.scribe_files f join public.engagements e on e.id=f.engagement_id where not f.deleted and f.uploaded_at is not null and not e.deleted and e.type<>'practice'),
  'pending',(select count(*) from private.scribe_files f join public.engagements e on e.id=f.engagement_id
   left join storage.objects o on o.bucket_id='scribe' and o.name=f.storage_path
   where f.uploaded_at is not null and not f.deleted and not e.deleted and e.type<>'practice'
    and not exists(select 1 from private.file_backups b where b.file_id=f.id and b.completed_at is not null and b.source_version=md5(o.updated_at::text||coalesce(o.metadata->>'eTag','')))),
  'protected_files',(select count(distinct file_id) from private.file_backups where completed_at is not null and not probe),
  'protected_bytes',(select coalesce(sum(bytes),0) from private.file_backups where completed_at is not null and not probe),
  'last_run',(select to_jsonb(r) from private.operations_runs r where recovery_verified_at is null order by started_at desc limit 1),
  'last_recovery_check',(select max(recovery_verified_at) from private.operations_runs),
  'errors',coalesce((select jsonb_agg(x) from (select id,event,release,occurrences,first_seen,last_seen from private.client_errors order by last_seen desc limit 30) x),'[]'::jsonb),
  'backups',coalesce((select jsonb_agg(x) from (select id,name,bytes,sha256,completed_at,probe from private.file_backups where completed_at is not null order by completed_at desc limit 30) x),'[]'::jsonb),
  'last_alert',(select to_jsonb(x) from (select hour,sent_at from private.operations_alerts order by hour desc limit 1) x));
end $$;
create function public.ops_alert_claim(p_sent timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h timestamptz:=date_trunc('hour',now()); a private.operations_alerts; snapshot_ jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('operations-alerts',0));
 if p_sent is not null then
  update private.operations_alerts set sent_at=clock_timestamp() where hour=p_sent and sent_at is null;
  return jsonb_build_object('status','ok');
 end if;
 -- Operational telemetry expires after seven days. File copies follow engagement retention, still an open product decision.
 delete from private.client_errors where last_seen<now()-interval '7 days';
 delete from private.operations_limits where hour<h-interval '1 hour';
 delete from private.operations_alerts where hour<h-interval '7 days';
 select * into a from private.operations_alerts where hour=h for update;
 if found then
  if a.sent_at is not null or a.claimed_at>now()-interval '10 minutes' then return jsonb_build_object('status','quiet'); end if;
  update private.operations_alerts set claimed_at=clock_timestamp() where hour=h;
  return jsonb_build_object('status','send','hour',h,'snapshot',a.snapshot);
 end if;
 select jsonb_build_object('errors',coalesce((select sum(occurrences) from private.client_errors where last_seen>=h-interval '1 hour'),0),
  'backup_failures',(select count(*) from private.operations_runs where (status='failed' or (status='running' and started_at<now()-interval '10 minutes')) and started_at>=h-interval '1 hour')) into snapshot_;
 if (snapshot_->>'errors')::integer=0 and (snapshot_->>'backup_failures')::integer=0 then return jsonb_build_object('status','quiet'); end if;
 insert into private.operations_alerts(hour,snapshot) values(h,snapshot_);
 return jsonb_build_object('status','send','hour',h,'snapshot',snapshot_);
end $$;
-- Every worker function is service-only. Browser admin reads have their own live Auth check.
do $$ declare f record; begin
 for f in select oid::regprocedure as name from pg_proc where pronamespace='public'::regnamespace and proname like 'ops_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.name);
  execute format('grant execute on function %s to service_role',f.name);
 end loop;
end $$;
grant execute on function public.ops_state(),public.ops_backup_chunk(uuid,integer) to authenticated;
commit;
