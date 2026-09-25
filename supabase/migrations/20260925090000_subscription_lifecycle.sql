-- دورة حياة الاشتراك: تنبيه قبل الانتهاء → grace (كتابة مسموحة) → expired (قراءة فقط، لا حذف).
-- القفل في القاعدة نفسها (trigger) كي يشمل كل طرق الكتابة. الإدارة (pharmacies/subscriptions) غير مقفلة فالتجديد يعمل دائماً.

-- 1) إشعارات الإدارة (خادم فقط)
create table if not exists public.admin_notifications (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('expiring_soon', 'entered_grace', 'expired', 'inactive_pharmacy', 'payment_due')),
  pharmacy_id  uuid references public.pharmacies(id) on delete cascade,
  message      text not null,
  is_read      boolean not null default false,
  created_at   timestamptz not null default timezone('utc', now())
);
-- إشعار واحد من كل نوع لكل صيدلية في اليوم
create unique index if not exists admin_notifications_daily_uniq
  on public.admin_notifications (kind, pharmacy_id, ((created_at at time zone 'utc')::date));
alter table public.admin_notifications enable row level security;
revoke all on table public.admin_notifications from anon, authenticated;
grant  all on table public.admin_notifications to service_role;

-- 2) هل الصيدلية قابلة للكتابة؟ (expired/suspended/archived = لا)
create or replace function public.pharmacy_writable(p_pharmacy_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.status not in ('expired', 'suspended', 'archived') from public.pharmacies p where p.id = p_pharmacy_id), false);
$$;
revoke execute on function public.pharmacy_writable(uuid) from public, anon;
grant  execute on function public.pharmacy_writable(uuid) to authenticated, service_role;

-- 3) trigger القفل — يُطبَّق على جداول بيانات الصيدلية فقط
create or replace function public.block_write_when_not_writable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid uuid;
begin
  v_pid := coalesce(case when tg_op = 'DELETE' then old.pharmacy_id else new.pharmacy_id end, null);
  if v_pid is not null and not public.pharmacy_writable(v_pid) then
    raise exception 'SUBSCRIPTION_READ_ONLY: انتهى اشتراك الصيدلية — القراءة فقط حتى التجديد' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['patients','visitations','weight_plans','chronic_medications','pharmacy_products','pharmacy_catalog',
                           'pharmacy_recommendations','refill_tracking_pipeline','inventory_stock','pharmacy_staff','birthday_greetings']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_block_read_only on public.%I', t);
      execute format('create trigger trg_block_read_only before insert or update or delete on public.%I for each row execute function public.block_write_when_not_writable()', t);
    end if;
  end loop;
end $$;

-- 4) الجولة اليومية: انتقالات الحالة + إشعارات. تُستدعى من cron أو يدوياً من الإدارة (service_role فقط).
create or replace function public.run_subscription_lifecycle()
returns table (pharmacy_id uuid, action text) language plpgsql security definer set search_path = public as $$
declare s record; v_grace int; v_warn int; v_today date := current_date;
begin
  select grace_days, warn_days_before into v_grace, v_warn from public.platform_settings where id = true;
  for s in
    select distinct on (sub.pharmacy_id) sub.id, sub.pharmacy_id, sub.ends_on, sub.status, p.name, p.status as pstatus
    from public.subscriptions sub join public.pharmacies p on p.id = sub.pharmacy_id
    where p.status not in ('suspended', 'archived')
    order by sub.pharmacy_id, sub.ends_on desc
  loop
    if s.status in ('trial', 'active') and s.ends_on >= v_today and (s.ends_on - v_today) <= v_warn then
      insert into public.admin_notifications (kind, pharmacy_id, message)
      values ('expiring_soon', s.pharmacy_id, format('ينتهي اشتراك «%s» خلال %s يوماً (%s)', s.name, s.ends_on - v_today, s.ends_on))
      on conflict do nothing;
      pharmacy_id := s.pharmacy_id; action := 'warned'; return next;
    elsif s.status in ('trial', 'active', 'grace') and s.ends_on < v_today and (v_today - s.ends_on) <= v_grace then
      if s.status <> 'grace' then
        update public.subscriptions set status = 'grace' where id = s.id;
        update public.pharmacies set status = 'grace' where id = s.pharmacy_id;
        insert into public.admin_notifications (kind, pharmacy_id, message)
        values ('entered_grace', s.pharmacy_id, format('انتهى اشتراك «%s» — مهلة %s أيام قبل القراءة فقط', s.name, v_grace)) on conflict do nothing;
        pharmacy_id := s.pharmacy_id; action := 'grace'; return next;
      end if;
    elsif s.status in ('trial', 'active', 'grace') and (v_today - s.ends_on) > v_grace then
      update public.subscriptions set status = 'expired' where id = s.id;
      update public.pharmacies set status = 'expired' where id = s.pharmacy_id;
      insert into public.admin_notifications (kind, pharmacy_id, message)
      values ('expired', s.pharmacy_id, format('صيدلية «%s» صارت قراءة فقط — بانتظار التجديد', s.name)) on conflict do nothing;
      pharmacy_id := s.pharmacy_id; action := 'expired'; return next;
    end if;
  end loop;
  return;
end $$;
revoke execute on function public.run_subscription_lifecycle() from public, anon, authenticated;
grant  execute on function public.run_subscription_lifecycle() to service_role;
