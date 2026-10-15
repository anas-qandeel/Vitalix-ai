-- «طلبات المرضى» — إعادة بناء المخطط بالتصميم النهائي: مرحلة لكل صنف، وتسليم جزئي، ودفعات.
-- الهجرات الثلاث السابقة (20261015100000 و 20261015120000 و 20261015130000) افترضت مرحلة واحدة للطلب كله؛
-- أما الاستخدام الفعلي فيحتاج أن يصل كل صنف ويُسلَّم على حدة وأن تُحصَّل المبالغ عند كل تسليم.
-- هذه الهجرة لبيئة التطوير فقط (بيانات اختبار تُهمَل ولا تُدفع إلى الإنتاج)، فتحذف كل ما سبق وتبنيه من جديد.
--
-- قرارات التصميم:
--  • الطلب «open» حتى يُسلَّم كل صنف فعّال (يُشتق تلقائياً) أو يُلغى كله؛ المرحلة (recorded/ordered/arrived/
--    delivered/cancelled) على البند لا على الطلب.
--  • قاعدة العميل مقابل النظام: triggers الحراسة SECURITY INVOKER وتعدّ التغيير «عميلاً» حين
--    current_user هو anon أو authenticated، وأي دور آخر (مثل مالك الدالة داخل SECURITY DEFINER) «نظاماً».
--    الترقيم والتسجيل والاشتقاق والإلغاء المتتابع دوال SECURITY DEFINER، فالعميل لا يستطيع تسليم بند
--    ولا تسجيل دفعة ولا كتابة حدث نظام إلا عبر الدوال المعتمدة.
--  • التسليم والدفع عبر deliver_patient_request_items() وحدها، ودفتر الدفعات للإضافة فقط.
--  • الخط الزمني والدفعات والأحداث لا تُعدَّل ولا تُحذف (سياسات + revoke صريح).
--  • الأرقام بالصيدلية (request_number) من عدّاد لا يُعاد استخدام رقمه.
--  • أربع قواعد تحمي المبالغ:
--    ١) لا يُمسح السعر الإجمالي بعد تحصيل أي دفعة (PRICE_REQUIRED)؛ يُعدَّل فقط.
--    ٢) تسجيل إعادة العربون على الطلب الملغى من false إلى true فقط ونهائي (DEPOSIT_RETURN_FINAL).
--    ٣) آخر تسليم يُحصّل فيه المتبقي كاملاً بالضبط إن كان للطلب سعر (AMOUNT_MUST_SETTLE).
--    ٤) لا يُغلق الطلب مسلَّماً ما دام المتبقي على المريض لا يساوي صفراً (REMAINING_NOT_SETTLED)،
--       ويشمل ذلك إلغاء آخر صنف مفتوح بعد تسليم جزئي.

-- ═══════════════════════════════════════════════════════════════
-- ٠) حذف الكائنات القديمة (بيانات الاختبار تُهمَل). لا شيء خارج هذه الميزة يُمسّ
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.create_patient_request(uuid, jsonb, numeric, numeric, text, text);
drop function if exists public.create_patient_request(uuid, jsonb, numeric, numeric, text);

drop table if exists public.patient_request_events cascade;
drop table if exists public.patient_request_items cascade;
drop table if exists public.patient_requests cascade;

drop function if exists public.patient_requests_guard() cascade;
drop function if exists public.patient_requests_status_rules() cascade;
drop function if exists public.patient_requests_log_events() cascade;
drop function if exists public.patient_requests_mark_items_arrived() cascade;
drop function if exists public.patient_request_items_insert_guard() cascade;
drop function if exists public.patient_request_items_update_guard() cascade;
drop function if exists public.patient_request_items_log_events() cascade;
drop function if exists public.patient_request_events_set_parent() cascade;

-- ═══════════════════════════════════════════════════════════════
-- ١) patient_request_counters — عدّاد أرقام الطلبات لكل صيدلية
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.patient_request_counters (
  pharmacy_id uuid primary key references public.pharmacies(id) on delete cascade,
  last_number integer not null default 0
);

-- RLS مفعّلة بلا أي سياسة: لا يصل إليه أحد إلا trigger الترقيم (security definer)
alter table public.patient_request_counters enable row level security;
revoke all on public.patient_request_counters from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٢) patient_requests
-- ═══════════════════════════════════════════════════════════════
create table public.patient_requests (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies(id) on delete cascade,
  request_number   integer not null,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  price            numeric(10,3) check (price >= 0),   -- السعر الإجمالي للطلب كله
  deposit          numeric(10,3) check (deposit >= 0),
  status           text not null default 'open' check (status in ('open','delivered','cancelled')),
  cancel_reason    text,
  deposit_returned boolean,
  created_by       uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  updated_at       timestamptz not null default now(),
  constraint patient_requests_number_uniq unique (pharmacy_id, request_number),
  constraint patient_requests_deposit_le_price
    check (price is null or deposit is null or deposit <= price),
  constraint patient_requests_cancel_needs_reason
    check (status <> 'cancelled' or char_length(btrim(coalesce(cancel_reason, ''))) > 0),
  constraint patient_requests_cancel_deposit_answer
    check (status <> 'cancelled' or coalesce(deposit, 0) = 0 or deposit_returned is not null)
);

create index idx_patient_requests_ph_status  on public.patient_requests (pharmacy_id, status);
create index idx_patient_requests_ph_created on public.patient_requests (pharmacy_id, created_at desc);
create index idx_patient_requests_patient    on public.patient_requests (patient_id);

-- ═══════════════════════════════════════════════════════════════
-- ٣) patient_request_items — لكل بند مرحلته
-- ═══════════════════════════════════════════════════════════════
create table public.patient_request_items (
  id            uuid primary key default gen_random_uuid(),
  pharmacy_id   uuid not null references public.pharmacies(id) on delete cascade,
  request_id    uuid not null references public.patient_requests(id) on delete cascade,
  product_name  text not null check (char_length(btrim(product_name)) between 1 and 200),
  quantity      integer not null default 1 check (quantity > 0),
  supplier      text check (supplier is null or char_length(btrim(supplier)) between 1 and 100),
  stage         text not null default 'recorded'
                check (stage in ('recorded','ordered','arrived','delivered','cancelled')),
  ordered_at    timestamptz,
  arrived_at    timestamptz,
  delivered_at  timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_by    uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  created_at    timestamptz not null default clock_timestamp(),
  constraint patient_request_items_cancel_needs_reason
    check (stage <> 'cancelled' or char_length(btrim(coalesce(cancel_reason, ''))) > 0)
);

create index idx_patient_request_items_req      on public.patient_request_items (request_id);
create index idx_patient_request_items_ph_created on public.patient_request_items (pharmacy_id, created_at desc);
create index idx_patient_request_items_ph_stage on public.patient_request_items (pharmacy_id, stage);

-- ═══════════════════════════════════════════════════════════════
-- ٤) patient_request_payments — دفتر المبالغ المحصَّلة عند التسليم (إضافة فقط)
-- ═══════════════════════════════════════════════════════════════
create table public.patient_request_payments (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  request_id  uuid not null references public.patient_requests(id) on delete cascade,
  amount      numeric(10,3) not null check (amount >= 0),
  staff_id    uuid not null references public.pharmacy_staff(id),
  created_at  timestamptz not null default clock_timestamp()
);

create index idx_patient_request_payments_req on public.patient_request_payments (request_id);

-- ═══════════════════════════════════════════════════════════════
-- ٥) patient_request_events — الخط الزمني
-- ═══════════════════════════════════════════════════════════════
create table public.patient_request_events (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  request_id  uuid not null references public.patient_requests(id) on delete cascade,
  kind        text not null check (kind in (
                'created','note','message_sent','price_change','deposit_change','deposit_return_change',
                'status_change','item_added','item_cancelled','item_supplier_change','item_stage_change','payment')),
  body        text,
  details     jsonb,
  staff_id    uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  created_at  timestamptz not null default clock_timestamp(),
  constraint patient_request_events_note_body
    check (kind <> 'note' or (body is not null and char_length(btrim(body)) between 1 and 1000)),
  -- message_sent يكتبه العميل، فيُتحقق من شكل details هنا لا في الواجهة
  constraint patient_request_events_message_details
    check (kind <> 'message_sent' or (
      details->>'message' in ('confirmation','arrival')
      and jsonb_typeof(details->'amounts_included') = 'boolean'
    ))
);

create index idx_patient_request_events_req on public.patient_request_events (request_id, created_at);

-- ═══════════════════════════════════════════════════════════════
-- ٦) RLS
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_requests         enable row level security;
alter table public.patient_request_items    enable row level security;
alter table public.patient_request_payments enable row level security;
alter table public.patient_request_events   enable row level security;

-- الطلبات
create policy "patient_requests_select" on public.patient_requests
  for select to authenticated using (pharmacy_id = public.current_pharmacy_id());
create policy "patient_requests_insert" on public.patient_requests
  for insert to authenticated
  with check (pharmacy_id = public.current_pharmacy_id() and created_by = public.current_staff_id());
create policy "patient_requests_update" on public.patient_requests
  for update to authenticated
  using (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());
revoke delete, truncate on public.patient_requests from anon, authenticated;

-- البنود
create policy "patient_request_items_select" on public.patient_request_items
  for select to authenticated using (pharmacy_id = public.current_pharmacy_id());
create policy "patient_request_items_insert" on public.patient_request_items
  for insert to authenticated
  with check (pharmacy_id = public.current_pharmacy_id() and created_by = public.current_staff_id());
create policy "patient_request_items_update" on public.patient_request_items
  for update to authenticated
  using (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());
revoke delete, truncate on public.patient_request_items from anon, authenticated;

-- الدفعات: قراءة فقط للصيدلية؛ تُكتب من deliver_patient_request_items() وحدها
create policy "patient_request_payments_select" on public.patient_request_payments
  for select to authenticated using (pharmacy_id = public.current_pharmacy_id());
revoke insert, update, delete, truncate on public.patient_request_payments from anon, authenticated;

-- الأحداث: العميل يكتب الملاحظات وسجل الرسائل فقط؛ أنواع النظام تكتبها triggers بصلاحية الدالة
create policy "patient_request_events_select" on public.patient_request_events
  for select to authenticated using (pharmacy_id = public.current_pharmacy_id());
create policy "patient_request_events_insert" on public.patient_request_events
  for insert to authenticated
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and kind in ('note','message_sent')
    and staff_id = public.current_staff_id()
  );
revoke update, delete, truncate on public.patient_request_events from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٧) triggers الأحداث: الصيدلية من الطلب الأصل
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_request_events_set_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacy uuid;
begin
  select pharmacy_id into v_pharmacy from public.patient_requests where id = new.request_id;
  if v_pharmacy is null then
    raise exception 'REQUEST_NOT_FOUND: الطلب غير موجود' using errcode = 'foreign_key_violation';
  end if;
  new.pharmacy_id := v_pharmacy;   -- قيمة العميل تُهمَل
  return new;
end;
$$;

create trigger trg_patient_request_events_set_parent
  before insert on public.patient_request_events
  for each row execute function public.patient_request_events_set_parent();

-- ═══════════════════════════════════════════════════════════════
-- ٨) triggers الطلبات
-- أسماء BEFORE: a_number (إدراج فقط) ثم b_guard ثم c_updated_at — تُنفَّذ أبجدياً
-- ═══════════════════════════════════════════════════════════════

-- أ) الترقيم: أرقام كل صيدلية متسلسلة من 1 ولا يُعاد استخدام رقم؛ قيمة العميل تُستبدل دائماً
create or replace function public.patient_requests_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.patient_request_counters as c (pharmacy_id, last_number)
  values (new.pharmacy_id, 1)
  on conflict (pharmacy_id) do update set last_number = c.last_number + 1
  returning c.last_number into new.request_number;
  return new;
end;
$$;

create trigger trg_patient_requests_a_number
  before insert on public.patient_requests
  for each row execute function public.patient_requests_assign_number();

-- ب) الحارس (security invoker): عميل = current_user في anon/authenticated، وغيره نظام
create or replace function public.patient_requests_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_system           boolean := current_user not in ('anon','authenticated');
  v_patient_pharmacy uuid;
  v_paid             numeric;
begin
  if tg_op = 'INSERT' then
    -- رسالة واحدة للمريض غير الموجود وللتابع لصيدلية أخرى حتى لا يُكشف وجوده
    select pharmacy_id into v_patient_pharmacy from public.patients where id = new.patient_id;
    if v_patient_pharmacy is null or v_patient_pharmacy <> new.pharmacy_id then
      raise exception 'PATIENT_MISMATCH: المريض غير تابع لهذه الصيدلية' using errcode = 'check_violation';
    end if;
    if new.status <> 'open' then
      raise exception 'STATUS_NOT_ALLOWED: الطلب الجديد يبدأ مفتوحاً' using errcode = 'check_violation';
    end if;
    new.delivered_at := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- تحديث
  if new.pharmacy_id is distinct from old.pharmacy_id
     or new.patient_id is distinct from old.patient_id
     or new.request_number is distinct from old.request_number
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'IMMUTABLE_FIELD: لا يمكن تغيير الصيدلية أو المريض أو رقم الطلب أو المنشئ أو وقت الإنشاء'
      using errcode = 'check_violation';
  end if;

  -- طلب نهائي: التغيير الوحيد المسموح إجابة إرجاع العربون على طلب ملغى
  if old.status <> 'open' then
    if old.status = 'cancelled'
       and (to_jsonb(new) - 'deposit_returned' - 'updated_at') = (to_jsonb(old) - 'deposit_returned' - 'updated_at') then
      -- تسجيل الإعادة نهائي: false ← true فقط، ولا رجوع ولا مسح
      if new.deposit_returned is distinct from old.deposit_returned
         and not (old.deposit_returned = false and new.deposit_returned = true) then
        raise exception 'DEPOSIT_RETURN_FINAL: تسجيل إعادة العربون نهائي ولا يمكن التراجع عنه.'
          using errcode = 'check_violation';
      end if;
      return new;
    end if;
    raise exception 'REQUEST_CLOSED: الطلب مغلق ولا يمكن تعديله' using errcode = 'check_violation';
  end if;

  -- التواقيت تضبطها القاعدة عند الانتقال فقط
  new.delivered_at := old.delivered_at;
  new.cancelled_at := old.cancelled_at;

  if new.status is distinct from old.status then
    if not v_system then
      if not (old.status = 'open' and new.status = 'cancelled') then
        raise exception 'STATUS_NOT_ALLOWED: يمكن للموظف إلغاء الطلب المفتوح فقط، والتسليم يتم من شاشة التسليم'
          using errcode = 'check_violation';
      end if;
      if exists (select 1 from public.patient_request_items where request_id = new.id and stage = 'delivered') then
        raise exception 'REQUEST_HAS_DELIVERIES: لا يمكن إلغاء طلب سُلّمت بعض أصنافه'
          using errcode = 'check_violation';
      end if;
    end if;
    if new.status = 'delivered' then
      new.delivered_at := now();
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  end if;

  -- بعد تحصيل أي دفعة لا يُمسح السعر الإجمالي (بل يُعدَّل)، وإلا سقط سقف المتبقي
  if old.price is not null and new.price is null
     and exists (select 1 from public.patient_request_payments where request_id = new.id) then
    raise exception 'PRICE_REQUIRED: لا يمكن مسح السعر الإجمالي بعد تحصيل دفعة. عدّله بدلاً من ذلك.'
      using errcode = 'check_violation';
  end if;

  -- السعر الإجمالي لا ينزل عن العربون مع ما دُفع عند التسليم
  if new.price is not null then
    select coalesce(sum(amount), 0) into v_paid from public.patient_request_payments where request_id = new.id;
    if new.price < coalesce(new.deposit, 0) + v_paid then
      raise exception 'PRICE_BELOW_PAID: السعر الإجمالي أقل من العربون مع ما دُفع عند التسليم'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_patient_requests_b_guard
  before insert or update on public.patient_requests
  for each row execute function public.patient_requests_guard();

-- ج) updated_at أخيراً
create trigger trg_patient_requests_c_updated_at
  before update on public.patient_requests
  for each row execute function public.set_updated_at();

-- د) إلغاء الطلب يلغي أصنافه الفعّالة. الأصناف المسلَّمة تبقى
create or replace function public.patient_requests_cascade_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.patient_request_items
       set stage = 'cancelled', cancel_reason = 'أُلغي الطلب'
     where request_id = new.id
       and stage in ('recorded','ordered','arrived');
  end if;
  return new;
end;
$$;

-- الاسم يبدأ بـ d_ ليُنفَّذ قبل سجل الطلب (e_) فتسبق أحداث البنود الملغاة حدث تغيّر الحالة
create trigger trg_patient_requests_d_cascade_cancel
  after update on public.patient_requests
  for each row execute function public.patient_requests_cascade_cancel();

-- هـ) تسجيل الخط الزمني. بلا هوية موظف نرفض بدل تسجيل حدث بلا فاعل
create or replace function public.patient_requests_log_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff uuid := public.current_staff_id();
begin
  if v_staff is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لتسجيل الحدث' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.id, 'created', jsonb_build_object('request_number', new.request_number), v_staff);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.id, 'status_change',
            jsonb_build_object('from', old.status, 'to', new.status,
                               'reason', new.cancel_reason, 'deposit_returned', new.deposit_returned), v_staff);
  end if;

  if new.price is distinct from old.price then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.id, 'price_change',
            jsonb_build_object('old', old.price, 'new', new.price), v_staff);
  end if;

  if new.deposit is distinct from old.deposit then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.id, 'deposit_change',
            jsonb_build_object('old', old.deposit, 'new', new.deposit), v_staff);
  end if;

  if new.deposit_returned is distinct from old.deposit_returned then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.id, 'deposit_return_change',
            jsonb_build_object('old', old.deposit_returned, 'new', new.deposit_returned), v_staff);
  end if;

  return new;
end;
$$;

create trigger trg_patient_requests_e_log_insert
  after insert on public.patient_requests
  for each row execute function public.patient_requests_log_events();

create trigger trg_patient_requests_e_log_update
  after update on public.patient_requests
  for each row execute function public.patient_requests_log_events();

-- ═══════════════════════════════════════════════════════════════
-- ٩) triggers البنود
-- ═══════════════════════════════════════════════════════════════

-- و) حارس الإدراج (security invoker)
create or replace function public.patient_request_items_insert_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_pharmacy uuid;
  v_status   text;
begin
  select pharmacy_id, status into v_pharmacy, v_status
  from public.patient_requests where id = new.request_id;

  if v_pharmacy is null then
    raise exception 'REQUEST_NOT_FOUND: الطلب غير موجود' using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'open' then
    raise exception 'REQUEST_CLOSED: الطلب مغلق ولا يمكن إضافة أصناف إليه' using errcode = 'check_violation';
  end if;

  new.pharmacy_id   := v_pharmacy;
  new.stage         := 'recorded';
  new.ordered_at    := null;
  new.arrived_at    := null;
  new.delivered_at  := null;
  new.cancelled_at  := null;
  new.cancel_reason := null;
  new.supplier      := nullif(btrim(new.supplier), '');
  return new;
end;
$$;

create trigger trg_patient_request_items_a_insert_guard
  before insert on public.patient_request_items
  for each row execute function public.patient_request_items_insert_guard();

-- ز) حارس التعديل (security invoker): المورد والمرحلة فقط، والتواقيت تضبطها القاعدة
create or replace function public.patient_request_items_update_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_system boolean := current_user not in ('anon','authenticated');
  v_status text;
begin
  if new.id is distinct from old.id
     or new.pharmacy_id is distinct from old.pharmacy_id
     or new.request_id is distinct from old.request_id
     or new.product_name is distinct from old.product_name
     or new.quantity is distinct from old.quantity
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'ITEM_IMMUTABLE: لا يمكن تعديل اسم الصنف أو كميته'
      using errcode = 'check_violation';
  end if;

  select status into v_status from public.patient_requests where id = new.request_id;

  -- الطلب مغلق: لا شيء يتغيّر إلا الإلغاء المتتابع بيد النظام عند إلغاء الطلب نفسه
  if v_status is distinct from 'open'
     and not (v_system and v_status = 'cancelled' and new.stage = 'cancelled') then
    raise exception 'REQUEST_CLOSED: الطلب مغلق ولا يمكن تعديل أصنافه' using errcode = 'check_violation';
  end if;

  -- بند مسلَّم أو ملغى: مجمَّد
  if old.stage in ('delivered','cancelled') then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'ITEM_FINAL: البند مسلَّم أو ملغى ولا يمكن تعديله' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  new.supplier := nullif(btrim(new.supplier), '');

  -- التواقيت من الصف القديم ما لم يغيّرها الانتقال أدناه
  new.ordered_at   := old.ordered_at;
  new.arrived_at   := old.arrived_at;
  new.delivered_at := old.delivered_at;
  new.cancelled_at := old.cancelled_at;

  if new.stage = old.stage then
    if new.cancel_reason is distinct from old.cancel_reason then
      raise exception 'ITEM_IMMUTABLE: سبب الإلغاء لا يُضبط إلا عند الإلغاء' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- انتقال مرحلة
  if new.stage = 'delivered' and not v_system then
    raise exception 'DELIVERY_VIA_FUNCTION: التسليم يتم من شاشة التسليم فقط' using errcode = 'check_violation';
  end if;

  if new.stage = 'cancelled' then
    if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'ITEM_CANCEL_REASON_REQUIRED: اكتب سبب إلغاء الصنف' using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
    return new;
  end if;

  if new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'ITEM_IMMUTABLE: سبب الإلغاء لا يُضبط إلا عند الإلغاء' using errcode = 'check_violation';
  end if;

  if old.stage = 'recorded' and new.stage = 'ordered' then
    new.ordered_at := now();
  elsif old.stage = 'recorded' and new.stage = 'arrived' then
    new.arrived_at := now();
  elsif old.stage = 'ordered' and new.stage = 'arrived' then
    new.arrived_at := now();
  elsif old.stage = 'ordered' and new.stage = 'recorded' then
    new.ordered_at := null;
  elsif old.stage = 'arrived' and new.stage = 'ordered' and old.ordered_at is not null then
    new.arrived_at := null;
  elsif old.stage = 'arrived' and new.stage = 'recorded' and old.ordered_at is null then
    new.arrived_at := null;
  elsif old.stage = 'arrived' and new.stage = 'delivered' and v_system then
    new.delivered_at := now();
  else
    raise exception 'ITEM_STAGE_NOT_ALLOWED: هذا الانتقال بين المراحل غير مسموح' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_patient_request_items_b_update_guard
  before update on public.patient_request_items
  for each row execute function public.patient_request_items_update_guard();

-- ح) تسجيل أحداث البنود. إلغاء بند بسبب إلغاء الطلب يغطّيه status_change فلا يُكرَّر
create or replace function public.patient_request_items_log_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff  uuid := public.current_staff_id();
  v_status text;
begin
  if v_staff is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لتسجيل الحدث' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'INSERT' then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.request_id, 'item_added',
            jsonb_build_object('product_name', new.product_name, 'quantity', new.quantity), v_staff);
    return new;
  end if;

  if new.supplier is distinct from old.supplier then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
    values (new.pharmacy_id, new.request_id, 'item_supplier_change',
            jsonb_build_object('product_name', new.product_name, 'old', old.supplier, 'new', new.supplier), v_staff);
  end if;

  if new.stage is distinct from old.stage then
    if new.stage = 'cancelled' then
      select status into v_status from public.patient_requests where id = new.request_id;
      if v_status is distinct from 'cancelled' then
        insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
        values (new.pharmacy_id, new.request_id, 'item_cancelled',
                jsonb_build_object('product_name', new.product_name, 'quantity', new.quantity,
                                   'reason', new.cancel_reason), v_staff);
      end if;
    else
      insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
      values (new.pharmacy_id, new.request_id, 'item_stage_change',
              jsonb_build_object('product_name', new.product_name, 'from', old.stage, 'to', new.stage), v_staff);
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_patient_request_items_c_log_insert
  after insert on public.patient_request_items
  for each row execute function public.patient_request_items_log_events();

create trigger trg_patient_request_items_c_log_update
  after update on public.patient_request_items
  for each row execute function public.patient_request_items_log_events();

-- ط) اشتقاق تسليم الطلب: كل الأصناف الفعّالة (واحد على الأقل) مسلَّمة ← الطلب «delivered»
create or replace function public.patient_request_items_derive_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status  text;
  v_price   numeric;
  v_deposit numeric;
  v_paid    numeric;
begin
  select status, price, deposit into v_status, v_price, v_deposit
  from public.patient_requests where id = new.request_id;
  if v_status = 'open'
     and exists (select 1 from public.patient_request_items where request_id = new.request_id and stage <> 'cancelled')
     and not exists (select 1 from public.patient_request_items
                     where request_id = new.request_id and stage not in ('cancelled','delivered')) then
    -- لا يُغلق الطلب والمتبقي على المريض غير صفر؛ يشمل إلغاء آخر صنف مفتوح بعد تسليم جزئي
    if v_price is not null then
      select coalesce(sum(amount), 0) into v_paid from public.patient_request_payments where request_id = new.request_id;
      if v_price - coalesce(v_deposit, 0) - v_paid <> 0 then
        raise exception 'REMAINING_NOT_SETTLED: المتبقي على المريض لا يساوي صفراً. عدّل السعر الإجمالي أولاً ثم أعد المحاولة.'
          using errcode = 'check_violation';
      end if;
    end if;
    update public.patient_requests set status = 'delivered' where id = new.request_id;
  end if;
  return new;
end;
$$;

-- يلي سجل الأحداث (c_) فيسبق حدث البند حدث تغيّر حالة الطلب المشتقة
create trigger trg_patient_request_items_d_derive_insert
  after insert on public.patient_request_items
  for each row execute function public.patient_request_items_derive_request();

create trigger trg_patient_request_items_d_derive_update
  after update on public.patient_request_items
  for each row execute function public.patient_request_items_derive_request();

-- ═══════════════════════════════════════════════════════════════
-- ١٠) create_patient_request — الطلب وبنوده وملاحظته الأولى في معاملة واحدة
-- security invoker: سياسات RLS والـ triggers تسري كأي إدراج مباشر
-- ═══════════════════════════════════════════════════════════════
create or replace function public.create_patient_request(
  p_patient_id uuid,
  p_items      jsonb,
  p_price      numeric default null,
  p_deposit    numeric default null,
  p_note       text    default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'ITEMS_REQUIRED: يلزم بند واحد على الأقل وحتى 30 بنداً في الطلب'
      using errcode = 'check_violation';
  end if;

  insert into public.patient_requests (pharmacy_id, patient_id, price, deposit)
  values (public.current_pharmacy_id(), p_patient_id, p_price, p_deposit)
  returning id into v_request_id;

  insert into public.patient_request_items (request_id, product_name, quantity, supplier)
  select v_request_id,
         btrim(item->>'product_name'),
         coalesce((item->>'quantity')::int, 1),
         nullif(btrim(item->>'supplier'), '')
  from jsonb_array_elements(p_items) as item;

  if nullif(btrim(p_note), '') is not null then
    insert into public.patient_request_events (request_id, kind, body)
    values (v_request_id, 'note', btrim(p_note));
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.create_patient_request(uuid, jsonb, numeric, numeric, text) from public, anon;
grant execute on function public.create_patient_request(uuid, jsonb, numeric, numeric, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ١١) deliver_patient_request_items — المسار الوحيد للتسليم وتحصيل المبلغ
-- security definer لأن العميل لا يملك حق تسليم بند ولا كتابة دفعة. الفحوص بالترتيب، والطلب يُقفل
-- (for update) فلا يتجاوز تسليمان متزامنان المتبقي من السعر.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.deliver_patient_request_items(
  p_request_id uuid,
  p_item_ids  uuid[],
  p_amount    numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff     uuid := public.current_staff_id();
  v_status    text;
  v_price     numeric;
  v_deposit   numeric;
  v_paid      numeric;
  v_ids       uuid[];
  v_valid     int;
  v_completes boolean;
  v_names     jsonb;
begin
  if v_staff is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لتسليم الأصناف' using errcode = 'insufficient_privilege';
  end if;

  select status, price, deposit into v_status, v_price, v_deposit
  from public.patient_requests
  where id = p_request_id and pharmacy_id = public.current_pharmacy_id()
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: الطلب غير موجود' using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'open' then
    raise exception 'REQUEST_CLOSED: الطلب مغلق' using errcode = 'check_violation';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_item_ids) as x;
  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'ITEMS_NOT_ARRIVED: اختر الأصناف المراد تسليمها' using errcode = 'check_violation';
  end if;

  select count(*) into v_valid
  from public.patient_request_items
  where request_id = p_request_id and id = any(v_ids) and stage = 'arrived';
  if v_valid <> array_length(v_ids, 1) then
    raise exception 'ITEMS_NOT_ARRIVED: يمكن تسليم الأصناف التي وصلت فقط' using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'AMOUNT_REQUIRED: أدخل المبلغ المحصَّل (صفر أو أكثر)' using errcode = 'check_violation';
  end if;

  -- هل يُكمل هذا التسليم الطلب؟ لا صنف فعّال يبقى خارج «مسلَّم» بعد تسليم المختار
  select not exists (
    select 1 from public.patient_request_items
    where request_id = p_request_id and stage not in ('cancelled','delivered') and id <> all(v_ids)
  ) into v_completes;

  if v_price is not null then
    select coalesce(sum(amount), 0) into v_paid from public.patient_request_payments where request_id = p_request_id;
    if p_amount > v_price - coalesce(v_deposit, 0) - v_paid then
      raise exception 'AMOUNT_EXCEEDS_REMAINING: المبلغ أكبر من المتبقي على المريض' using errcode = 'check_violation';
    end if;
    -- آخر تسليم: يُحصَّل المتبقي كاملاً (والخصم بتعديل السعر الإجمالي قبلاً)
    if v_completes and p_amount <> v_price - coalesce(v_deposit, 0) - v_paid then
      raise exception 'AMOUNT_MUST_SETTLE: هذا آخر تسليم: يجب تحصيل المتبقي كاملاً. إن أعطيت خصماً فعدّل السعر الإجمالي أولاً.'
        using errcode = 'check_violation';
    end if;
  end if;

  select jsonb_agg(product_name order by created_at) into v_names
  from public.patient_request_items where id = any(v_ids);

  -- الدفعة وحدثها أولاً ثم تسليم الأصناف: مشتق إغلاق الطلب يرى الدفعة الجديدة عند فحص المتبقي
  insert into public.patient_request_payments (pharmacy_id, request_id, amount, staff_id)
  select pharmacy_id, id, p_amount, v_staff from public.patient_requests where id = p_request_id;

  insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
  select pharmacy_id, id, 'payment', jsonb_build_object('amount', p_amount, 'items', v_names), v_staff
  from public.patient_requests where id = p_request_id;

  -- التحديث يمر على حارس البنود بصفة النظام (مالك الدالة)، والمشتق يغلق الطلب عند اكتماله
  update public.patient_request_items set stage = 'delivered' where id = any(v_ids);
end;
$$;

revoke execute on function public.deliver_patient_request_items(uuid, uuid[], numeric) from public, anon;
grant execute on function public.deliver_patient_request_items(uuid, uuid[], numeric) to authenticated;
