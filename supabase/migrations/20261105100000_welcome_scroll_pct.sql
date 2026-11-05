-- /welcome: deepest scroll percentage per visit + repair of mis-cut WhatsApp tags.

alter table public.welcome_visits
  add column max_scroll_pct int not null default 0 check (max_scroll_pct between 0 and 100);

-- New overload with p_max_scroll_pct. The 6-argument function is left in place on purpose,
-- so a page/route still running the previous release keeps writing during the rollout.
create function public.welcome_beacon_upsert(
  p_visit_id uuid, p_src text, p_device text,
  p_active_seconds int, p_max_section int, p_wa_clicks text[], p_max_scroll_pct int
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.welcome_visits as v
    (visit_id, src, device, active_seconds, max_section, wa_clicks, max_scroll_pct)
  values
    (p_visit_id, p_src, p_device, p_active_seconds, p_max_section, coalesce(p_wa_clicks, '{}'), p_max_scroll_pct)
  on conflict (visit_id) do update set
    active_seconds = greatest(v.active_seconds, excluded.active_seconds),
    max_section    = greatest(v.max_section, excluded.max_section),
    max_scroll_pct = greatest(v.max_scroll_pct, excluded.max_scroll_pct),
    wa_clicks      = coalesce((
      select array_agg(t order by t)
      from (select distinct t from unnest(v.wa_clicks || excluded.wa_clicks) as u(t)
            order by t limit 10) s
    ), '{}'),
    updated_at     = now();
$$;
revoke all on function public.welcome_beacon_upsert(uuid, text, text, int, int, text[], int)
  from public, anon, authenticated;
grant execute on function public.welcome_beacon_upsert(uuid, text, text, int, int, text[], int)
  to service_role;

-- Repair: the client used to cut the tag at the first dash, so "fb-b-float" was stored as "b-float".
-- Idempotent: only rows holding a tag outside the four known ones that ends with one of them are touched.
update public.welcome_visits v
set wa_clicks = (
  select coalesce(array_agg(distinct fixed order by fixed), '{}')
  from (select regexp_replace(t, '^.*-(hero|offer|start|float)$', '\1') as fixed
        from unnest(v.wa_clicks) as u(t)) s
)
where exists (
  select 1 from unnest(v.wa_clicks) as u(t)
  where t !~ '^(hero|offer|start|float)$' and t ~ '-(hero|offer|start|float)$'
);
