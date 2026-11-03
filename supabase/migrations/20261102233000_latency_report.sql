-- Milestone 2, PR 7: the latency report behind the acceptance test.
-- Live only, after merge. No session is started and no data is seeded here.
--
-- The brief's measure: 95 of 100 submissions reach the TV in under one second,
-- read from the latency log. A submission counts once, at its slowest paired TV,
-- because the room sees it only when every screen shows it. Answers queued
-- offline are reported apart: their wait is the network, not the room.
-- Facilitators of the engagement and Clearway admins only.
begin;

create function private.latency_report(p_engagement uuid,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_to timestamptz:=coalesce(p_to,clock_timestamp()); v_from timestamptz:=coalesce(p_from,coalesce(p_to,clock_timestamp())-interval '1 day');
begin
  if not coalesce(private.is_admin() or private.can_facilitate(p_engagement),false) then return jsonb_build_object('status','denied'); end if;
  if v_from>v_to or v_to-v_from>interval '7 days' then return jsonb_build_object('status','invalid_request'); end if;
  return (with sent as (
    select l.submission_id,l.revision,l.phone_sent_at,l.server_received_at,l.clock_uncertainty_ms,x.session_id,x.queued_at is not null as queued
    from private.latency_logs l join public.submissions x on x.id=l.submission_id
    where l.engagement_id=p_engagement and l.tv_session_id is null and not l.deleted and l.server_received_at between v_from and v_to
  ), seen as (
    select s.*,max(t.tv_received_at) as tv_at,count(t.id) as screens,max(t.clock_uncertainty_ms) as uncertainty
    from sent s left join private.latency_logs t on t.submission_id=s.submission_id and t.revision=s.revision and t.tv_session_id is not null and not t.deleted
    group by s.submission_id,s.revision,s.phone_sent_at,s.server_received_at,s.clock_uncertainty_ms,s.session_id,s.queued
  ), timed as (
    select *,extract(epoch from tv_at-phone_sent_at)*1000 as phone_tv,extract(epoch from server_received_at-phone_sent_at)*1000 as phone_server,
      extract(epoch from tv_at-server_received_at)*1000 as server_tv from seen
  ), live as (select * from timed where not queued and tv_at is not null)
  select jsonb_build_object('status','ok','from',v_from,'to',v_to,
    'sent',(select count(*) from timed),
    'queued',(select count(*) from timed where queued),
    'missing_tv',(select count(*) from timed where not queued and tv_at is null),
    'measured',(select count(*) from live),
    'under_second',(select count(*) from live where phone_tv<1000),
    'phone_tv',(select jsonb_build_object('p50',round(percentile_cont(0.5) within group (order by phone_tv)),'p95',round(percentile_cont(0.95) within group (order by phone_tv)),
      'p99',round(percentile_cont(0.99) within group (order by phone_tv)),'max',round(max(phone_tv))) from live),
    'phone_server',(select jsonb_build_object('p50',round(percentile_cont(0.5) within group (order by phone_server)),'p95',round(percentile_cont(0.95) within group (order by phone_server))) from live),
    'server_tv',(select jsonb_build_object('p50',round(percentile_cont(0.5) within group (order by server_tv)),'p95',round(percentile_cont(0.95) within group (order by server_tv))) from live),
    'uncertainty_ms',(select round(max(uncertainty)) from live),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',g.session_id,'title',g.title,'measured',g.measured,'under_second',g.under_second,'p95',g.p95) order by g.first)
      from (select l.session_id,s.title,count(*) as measured,count(*) filter (where l.phone_tv<1000) as under_second,
        round(percentile_cont(0.95) within group (order by l.phone_tv)) as p95,min(l.server_received_at) as first
        from live l join public.sessions s on s.id=l.session_id group by l.session_id,s.title) g),'[]'::jsonb)));
end $$;

create function public.latency_report(p_engagement uuid,p_from timestamptz default null,p_to timestamptz default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.latency_report(p_engagement,p_from,p_to) $$;
revoke all on function private.latency_report(uuid,timestamptz,timestamptz),public.latency_report(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function private.latency_report(uuid,timestamptz,timestamptz),public.latency_report(uuid,timestamptz,timestamptz) to authenticated;
commit;
