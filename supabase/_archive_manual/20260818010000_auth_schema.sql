-- =====================================================================
-- Vitalix.ai — المرحلة ١: توسيع المخطط (إضافية بالكامل)
-- الخطوة ٤ من ١٢
--
-- لا تحذف شيئاً · لا تعدّل سياسة · لا تكسر أي كود قائم
-- النظام يعمل تماماً كما هو بعد تنفيذها
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- ١) مجموعات الفروع
--    فرع واحد = لا مجموعة (group_id يبقى null)
-- ---------------------------------------------------------------------
create table if not exists public.pharmacy_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_email text,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- ٢) مولّد رمز الصيدلية
--    عشوائي لا متسلسل: الترقيم المتسلسل يسمح بتعداد الصيدليات
--    الأبجدية بلا أحرف/أرقام متشابهة (O/0, I/1/L, Z/2, S/5, B/8)
-- ---------------------------------------------------------------------
create or replace function public.gen_pharmacy_code()
returns text
language plpgsql
as $$
declare
  alphabet text := 'ACDEFGHJKMNPQRTUVWXY34679';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.pharmacies where short_code = code);
  end loop;
  return code;
end;
$$;


-- ---------------------------------------------------------------------
-- ٣) توسيع pharmacies
-- ---------------------------------------------------------------------
alter table public.pharmacies
  add column if not exists group_id   uuid references public.pharmacy_groups(id) on delete set null,
  add column if not exists short_code text,
  add column if not exists license_no text,
  add column if not exists city       text,
  add column if not exists is_active  boolean not null default true,
  add column if not exists plan       text not null default 'founding_fifty';

-- توليد رموز للصيدليات الثلاث القائمة
update public.pharmacies
set short_code = public.gen_pharmacy_code()
where short_code is null;

alter table public.pharmacies alter column short_code set not null;
alter table public.pharmacies alter column short_code set default public.gen_pharmacy_code();

create unique index if not exists idx_pharmacies_code  on public.pharmacies(short_code);
create index        if not exists idx_pharmacies_group on public.pharmacies(group_id);


-- ---------------------------------------------------------------------
-- ٤) توسيع pharmacy_staff  ← التغيير الجوهري
--
--    user_id بـ SET NULL لا CASCADE: حذف حساب المصادقة يجب ألا يمحو
--    سجل الموظف، وإلا اختفى معه أثر «من سجّل هذه الزيارة»
-- ---------------------------------------------------------------------
alter table public.pharmacy_staff
  add column if not exists user_id         uuid references auth.users(id) on delete set null,
  add column if not exists role            text not null default 'staff',
  add column if not exists login_slug      text,
  add column if not exists is_active       boolean not null default true,
  add column if not exists must_change_pin boolean not null default true,
  add column if not exists last_login_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pharmacy_staff_role_chk') then
    alter table public.pharmacy_staff
      add constraint pharmacy_staff_role_chk
      check (role in ('owner','pharmacist','assistant','staff'));
  end if;
end $$;

create unique index if not exists idx_staff_user
  on public.pharmacy_staff(user_id) where user_id is not null;

create unique index if not exists idx_staff_slug_per_pharmacy
  on public.pharmacy_staff(pharmacy_id, login_slug) where login_slug is not null;

create index if not exists idx_staff_ph on public.pharmacy_staff(pharmacy_id);


-- ---------------------------------------------------------------------
-- ٥) أثر التدقيق: من سجّل هذه الزيارة؟
--    بدون هذا العمود، حسابات الموظفين بلا فائدة قانونية
-- ---------------------------------------------------------------------
alter table public.visitations
  add column if not exists recorded_by uuid references public.pharmacy_staff(id) on delete set null;

create index if not exists idx_visitations_recorded_by on public.visitations(recorded_by);


-- ---------------------------------------------------------------------
-- ٦) أجهزة الصيدلية
--    يُلغي الحاجة لـ RPC عامة: لا تعداد، + إبطال، + مؤشر مشاركة اشتراك
-- ---------------------------------------------------------------------
create table if not exists public.pharmacy_devices (
  id           uuid primary key default gen_random_uuid(),
  pharmacy_id  uuid not null references public.pharmacies(id) on delete cascade,
  token_hash   text not null unique,          -- sha256 hex، يُحسب في Node
  label        text,                           -- 'جهاز الكاونتر'
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists idx_devices_pharmacy on public.pharmacy_devices(pharmacy_id);


-- ---------------------------------------------------------------------
-- ٧) القفل التصاعدي — سيرفر فقط
--    ٦ أرقام = مليون احتمال. القفل هو الحماية، لا طول الرمز
-- ---------------------------------------------------------------------
create table if not exists public.staff_login_attempts (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  failed_count int not null default 0,
  locked_until timestamptz,
  last_attempt timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- ٨) سجلات التدقيق
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          bigserial primary key,
  actor_id    uuid not null,
  action      text not null,
  pharmacy_id uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.staff_audit_log (
  id          bigserial primary key,
  pharmacy_id uuid not null,
  actor_id    uuid not null,
  action      text not null,
  target_id   uuid,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_admin_audit_ph on public.admin_audit_log(pharmacy_id, created_at desc);
create index if not exists idx_staff_audit_ph on public.staff_audit_log(pharmacy_id, created_at desc);


-- ---------------------------------------------------------------------
-- ٩) مقاييس الاستخدام — مؤشرات لا أقفال
-- ---------------------------------------------------------------------
create table if not exists public.pharmacy_usage_daily (
  pharmacy_id      uuid not null references public.pharmacies(id) on delete cascade,
  day              date not null,
  distinct_devices int not null default 0,
  distinct_staff   int not null default 0,
  patients_added   int not null default 0,
  peak_concurrent  int not null default 0,
  primary key (pharmacy_id, day)
);


-- ---------------------------------------------------------------------
-- ١٠) فهارس العزل — تحسّن أداء RLS بشكل ملحوظ
-- ---------------------------------------------------------------------
create index if not exists idx_patients_ph    on public.patients(pharmacy_id);
create index if not exists idx_visitations_ph on public.visitations(pharmacy_id);
create index if not exists idx_chronic_ph     on public.chronic_medications(pharmacy_id);
create index if not exists idx_weight_ph      on public.weight_plans(pharmacy_id);
create index if not exists idx_catalog_ph     on public.pharmacy_catalog(pharmacy_id);
create index if not exists idx_refill_ph      on public.refill_tracking_pipeline(pharmacy_id);
create index if not exists idx_recs_ph        on public.pharmacy_recommendations(pharmacy_id);
create index if not exists idx_feedback_ph    on public.feedback(pharmacy_id);
commit;


-- =====================================================================
-- تحقّق — نفّذه بعد نجاح ما سبق
-- =====================================================================
select id, name, short_code, is_active, plan, group_id
from public.pharmacies;
