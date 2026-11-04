-- /welcome visit counter: anonymous, no personal data.
create table public.welcome_visits (
  visit_id       uuid primary key,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  src            text not null default 'web' check (src ~ '^[a-z0-9-]{1,24}$'),
  device         text check (device in ('mobile', 'desktop')),
  active_seconds int not null default 0 check (active_seconds between 0 and 1800),
  max_section    int not null default 0 check (max_section between 0 and 10),
  wa_clicks      text[] not null default '{}' check (cardinality(wa_clicks) <= 10)
);
create index welcome_visits_created_at_idx on public.welcome_visits (created_at);

alter table public.welcome_visits enable row level security; -- no policies on purpose
revoke all on table public.welcome_visits from public, anon, authenticated;
grant select, insert, update, delete on table public.welcome_visits to service_role;

-- Guard: this table must carry no triggers (incl. block_write_when_not_writable).
do $$
begin
  if exists (select 1 from pg_trigger
             where tgrelid = 'public.welcome_visits'::regclass and not tgisinternal) then
    raise exception 'welcome_visits must have no triggers';
  end if;
end $$;

create function public.welcome_beacon_upsert(
  p_visit_id uuid, p_src text, p_device text,
  p_active_seconds int, p_max_section int, p_wa_clicks text[]
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.welcome_visits as v
    (visit_id, src, device, active_seconds, max_section, wa_clicks)
  values
    (p_visit_id, p_src, p_device, p_active_seconds, p_max_section, coalesce(p_wa_clicks, '{}'))
  on conflict (visit_id) do update set
    active_seconds = greatest(v.active_seconds, excluded.active_seconds),
    max_section    = greatest(v.max_section, excluded.max_section),
    wa_clicks      = coalesce((
      select array_agg(t order by t)
      from (select distinct t from unnest(v.wa_clicks || excluded.wa_clicks) as u(t)
            order by t limit 10) s
    ), '{}'),
    updated_at     = now();
$$;
revoke all on function public.welcome_beacon_upsert(uuid, text, text, int, int, text[])
  from public, anon, authenticated;
grant execute on function public.welcome_beacon_upsert(uuid, text, text, int, int, text[])
  to service_role;

create view public.welcome_funnel with (security_invoker = true) as
with periods(period, since) as (
  values
    ('today',       date_trunc('day', now() at time zone 'Asia/Amman') at time zone 'Asia/Amman'),
    ('last_7_days', now() - interval '7 days'),
    ('all_time',    '-infinity'::timestamptz)
)
select
  p.period,
  v.src,
  count(*)::int as visits,
  round(percentile_cont(0.5) within group (order by v.active_seconds)::numeric, 0) as median_active_seconds,
  round(100.0 * count(*) filter (where v.max_section >= 1)  / count(*), 1) as reached_1_pct,
  round(100.0 * count(*) filter (where v.max_section >= 2)  / count(*), 1) as reached_2_pct,
  round(100.0 * count(*) filter (where v.max_section >= 3)  / count(*), 1) as reached_3_pct,
  round(100.0 * count(*) filter (where v.max_section >= 4)  / count(*), 1) as reached_4_pct,
  round(100.0 * count(*) filter (where v.max_section >= 5)  / count(*), 1) as reached_5_pct,
  round(100.0 * count(*) filter (where v.max_section >= 6)  / count(*), 1) as reached_6_pct,
  round(100.0 * count(*) filter (where v.max_section >= 7)  / count(*), 1) as reached_7_pct,
  round(100.0 * count(*) filter (where v.max_section >= 8)  / count(*), 1) as reached_8_pct,
  round(100.0 * count(*) filter (where v.max_section >= 9)  / count(*), 1) as reached_9_pct,
  round(100.0 * count(*) filter (where v.max_section >= 10) / count(*), 1) as reached_10_pct,
  count(*) filter (where cardinality(v.wa_clicks) > 0)::int as wa_visits,
  round(100.0 * count(*) filter (where cardinality(v.wa_clicks) > 0) / count(*), 1) as wa_pct
from periods p
join public.welcome_visits v on v.created_at >= p.since
group by p.period, v.src;
revoke all on public.welcome_funnel from public, anon, authenticated;
grant select on public.welcome_funnel to service_role;
