-- Keep engagement dates separate from the retreat that sets the horizon years.
begin;

alter table public.engagements
  add column pre_call_at timestamptz,
  add column retreat_start_date date,
  add column retreat_end_date date,
  add constraint engagements_retreat_dates_check
    check (retreat_end_date is null or retreat_start_date is null or retreat_end_date >= retreat_start_date),
  alter column base_year drop default;

grant update (pre_call_at, retreat_start_date, retreat_end_date) on public.engagements to authenticated;

create function private.default_engagement_base_year() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.base_year is null then
    new.base_year := extract(year from coalesce(new.retreat_start_date, new.start_date, current_date));
  end if;
  return new;
end
$$;
revoke all on function private.default_engagement_base_year() from public, anon, authenticated;
create trigger engagements_default_base_year before insert on public.engagements
  for each row execute function private.default_engagement_base_year();

commit;
