-- خطط واشتراكات وعروض وإعدادات المنصة — تُدار من الشاشة، لا أرقام في الكود.
-- إصدار واحد للنظام بكل المميزات: الخطة = شروط الدفع فقط. خادم فقط (service_role).

create table if not exists public.platform_settings (
  id                     boolean primary key default true check (id),  -- صف واحد فقط
  default_trial_days     integer not null default 60 check (default_trial_days between 0 and 365),
  grace_days             integer not null default 7  check (grace_days between 0 and 90),
  warn_days_before       integer not null default 14 check (warn_days_before between 0 and 90),
  currency               text    not null default 'JOD',
  updated_at             timestamptz not null default timezone('utc', now()),
  updated_by             uuid
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.plans (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  price                  numeric(10,2) not null check (price >= 0),
  duration_months        integer not null check (duration_months between 1 and 36),
  free_months            integer not null default 0 check (free_months between 0 and 24),
  seats_limit            integer check (seats_limit is null or seats_limit > 0),  -- فارغ = بلا حد (للمؤسس: عدد المقاعد)
  lifetime_price         boolean not null default false,                          -- سعر مثبّت مدى الحياة
  note                   text,
  is_active              boolean not null default true,
  created_at             timestamptz not null default timezone('utc', now()),
  created_by             uuid
);

create table if not exists public.promotions (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  discount_type          text not null check (discount_type in ('percent', 'amount')),
  discount_value         numeric(10,2) not null check (discount_value > 0),
  code                   text unique,
  valid_from             date,
  valid_to               date,
  max_uses               integer check (max_uses is null or max_uses > 0),
  used_count             integer not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default timezone('utc', now()),
  created_by             uuid
);

create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  pharmacy_id            uuid not null references public.pharmacies(id) on delete cascade,
  plan_id                uuid references public.plans(id),          -- فارغ = تجريبي
  promotion_id           uuid references public.promotions(id),
  starts_on              date not null,
  ends_on                date not null,
  list_price             numeric(10,2) not null default 0,            -- سعر الخطة وقت التعاقد (محفوظ)
  discount               numeric(10,2) not null default 0,
  final_price            numeric(10,2) not null default 0,            -- المبلغ المستحق لهذا الاشتراك
  paid_amount            numeric(10,2) not null default 0,
  status                 text not null default 'active' check (status in ('trial', 'active', 'grace', 'expired', 'suspended')),
  note                   text,
  created_at             timestamptz not null default timezone('utc', now()),
  created_by             uuid,
  check (ends_on >= starts_on),
  check (paid_amount <= final_price or final_price = 0)
);
create index if not exists idx_subscriptions_pharmacy on public.subscriptions (pharmacy_id, ends_on desc);

-- نقل الوضع الحالي: سجل اشتراك أولي لكل صيدلية من أعمدتها القديمة (لا تُلمس الأعمدة نفسها)
insert into public.subscriptions (pharmacy_id, starts_on, ends_on, list_price, final_price, paid_amount, status, note)
select p.id,
       coalesce(p.created_at::date, current_date),
       greatest(p.expiry_date, coalesce(p.created_at::date, current_date)),
       coalesce(p.total_amount_due, 0),
       coalesce(p.total_amount_due, 0),
       least(coalesce(p.paid_amount, 0), coalesce(p.total_amount_due, 0)),
       case when p.status in ('trial', 'active', 'suspended') then p.status else 'expired' end,
       'منقول من أعمدة pharmacies القديمة'
from public.pharmacies p
where not exists (select 1 from public.subscriptions s where s.pharmacy_id = p.id);

-- خادم فقط
alter table public.platform_settings enable row level security;
alter table public.plans              enable row level security;
alter table public.promotions         enable row level security;
alter table public.subscriptions      enable row level security;
revoke all on table public.platform_settings, public.plans, public.promotions, public.subscriptions from anon, authenticated;
grant  all on table public.platform_settings, public.plans, public.promotions, public.subscriptions to service_role;
