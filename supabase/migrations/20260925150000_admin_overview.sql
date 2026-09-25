-- نظرة الإدارة: صف لكل صيدلية غير مؤرشفة بكل أرقام البطاقة في استعلام واحد. service_role فقط.
create or replace function public.admin_pharmacy_overview()
returns table (
  id uuid, name text, pharmacist_name text, phone_number text, email text, city_address text, country text,
  status text, short_code text, max_staff integer, created_at timestamptz,
  sub_status text, sub_ends_on date, sub_plan_name text, sub_lifetime boolean, sub_final_price numeric, sub_paid_amount numeric,
  patients_count bigint, chronic_count bigint, visits_30d bigint, last_visit_at timestamptz,
  staff_active bigint, last_activity_at timestamptz, uncategorized_count bigint, ai_tokens_30d bigint
) language sql stable security definer set search_path = public as $$
  with latest_sub as (
    select distinct on (s.pharmacy_id) s.pharmacy_id, s.status, s.ends_on, s.final_price, s.paid_amount, pl.name as plan_name, coalesce(pl.lifetime_price, false) as lifetime
    from public.subscriptions s left join public.plans pl on pl.id = s.plan_id
    order by s.pharmacy_id, s.ends_on desc
  )
  select p.id, p.name, p.pharmacist_name, p.phone_number, u.email::text, p.city_address, p.country,
         p.status, p.short_code, p.max_staff, p.created_at,
         ls.status, ls.ends_on, ls.plan_name, ls.lifetime, ls.final_price, ls.paid_amount,
         (select count(*) from public.patients x where x.pharmacy_id = p.id),
         (select count(distinct patient_id) from public.chronic_medications x where x.pharmacy_id = p.id and x.status = 'active'),
         (select count(*) from public.visitations x where x.pharmacy_id = p.id and x.created_at >= now() - interval '30 days'),
         (select max(created_at) from public.visitations x where x.pharmacy_id = p.id),
         (select count(*) from public.pharmacy_staff x where x.pharmacy_id = p.id and x.is_active = true),
         (select max(created_at) from public.activity_log x where x.pharmacy_id = p.id),
         (select count(*) from public.pharmacy_products x where x.pharmacy_id = p.id and x.category = 'uncategorized' and x.is_active = true),
         (select coalesce(sum(total_tokens), 0) from public.ai_usage_log x where x.pharmacy_id = p.id and x.created_at >= now() - interval '30 days' and x.outcome = 'used')
  from public.pharmacies p
  left join auth.users u on u.id = p.id
  left join latest_sub ls on ls.pharmacy_id = p.id
  where p.status <> 'archived'
  order by p.created_at desc;
$$;
revoke execute on function public.admin_pharmacy_overview() from public, anon, authenticated;
grant  execute on function public.admin_pharmacy_overview() to service_role;
