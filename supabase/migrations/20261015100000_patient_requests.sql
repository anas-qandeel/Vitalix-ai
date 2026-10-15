-- طلبات المرضى: منتجات لا تتوفر في الصيدلية يطلبها المريض، تُتابَع من التسجيل إلى التسليم.
-- جدولان: patient_requests (الحالة الراهنة) و patient_request_events (خط المتابعة الزمني).
--
-- قرارات التصميم:
--  • الحالة والتواريخ تُحكَم بـ triggers في القاعدة لا بالواجهة، فلا يستطيع عميل معدَّل
--    القفز بالمراحل أو تزوير توقيتها.
--  • الأحداث إضافة فقط: لا تعديل ولا حذف (سياسات + revoke صريح، كما في
--    20260927130000_feedback_browser_insert_only.sql). العميل يكتب نوعين فقط (note, message_sent)؛
--    الأنواع الأخرى يكتبها trigger مرفق بالجدول الأصل، فلا تُنسب لموظف زوراً ولا تُحذف.
--    تُسجَّل هناك أيضاً تغييرات السعر والعربون وحالة إرجاع العربون (deposit_returned).
--  • اسم المنتج نص حر وليس مرتبطاً بالكتالوج، ولا يخضع لـ trg_products_reject_medicine
--    (ذلك الـ trigger على pharmacy_products وحدها).

-- ═══════════════════════════════════════════════════════════════
-- ١) patient_requests
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.patient_requests (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies(id) on delete cascade,
  -- cascade كبقية جداول المريض (chronic_medications, visitations, birthday_greetings…)
  patient_id       uuid not null references public.patients(id) on delete cascade,
  product_name     text not null check (char_length(btrim(product_name)) between 1 and 200),
  quantity         integer not null default 1 check (quantity > 0),
  price            numeric(10,3) check (price >= 0),
  deposit          numeric(10,3) check (deposit >= 0),
  supplier         text,
  status           text not null default 'recorded'
                   check (status in ('recorded','ordered','arrived','delivered','cancelled')),
  cancel_reason    text,
  deposit_returned boolean,
  -- بلا on delete set null (على خلاف birthday_greetings) لأن العمود not null؛ الموظف يُعطَّل ولا يُحذف
  created_by       uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  created_at       timestamptz not null default now(),
  ordered_at       timestamptz,
  arrived_at       timestamptz,
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  updated_at       timestamptz not null default now(),
  constraint patient_requests_deposit_le_price
    check (price is null or deposit is null or deposit <= price),
  constraint patient_requests_cancel_needs_reason
    check (status <> 'cancelled' or char_length(btrim(coalesce(cancel_reason, ''))) > 0),
  constraint patient_requests_cancel_deposit_answer
    check (status <> 'cancelled' or coalesce(deposit, 0) = 0 or deposit_returned is not null)
);

create index if not exists idx_patient_requests_ph_status  on public.patient_requests (pharmacy_id, status);
create index if not exists idx_patient_requests_ph_created on public.patient_requests (pharmacy_id, created_at desc);
create index if not exists idx_patient_requests_patient on public.patient_requests (patient_id);

alter table public.patient_requests enable row level security;

drop policy if exists "patient_requests_select" on public.patient_requests;
create policy "patient_requests_select" on public.patient_requests
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

-- الصيدلية من الدالة لا من الطلب، والموظف يسجّل باسمه هو (نمط birthday_greetings)
drop policy if exists "patient_requests_insert" on public.patient_requests;
create policy "patient_requests_insert" on public.patient_requests
  for insert to authenticated
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and created_by = public.current_staff_id()
  );

drop policy if exists "patient_requests_update" on public.patient_requests;
create policy "patient_requests_update" on public.patient_requests
  for update to authenticated
  using (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- لا سياسة حذف؛ الإلغاء حالة لا محو. truncate أيضاً لأنه يتجاوز RLS
revoke delete, truncate on public.patient_requests from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٢) patient_request_events
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.patient_request_events (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  request_id  uuid not null references public.patient_requests(id) on delete cascade,
  kind        text not null
              check (kind in ('created','note','stage_change','price_change','deposit_change','deposit_return_change','message_sent')),
  body        text,
  -- حالة الطلب لحظة الحدث؛ يضبطها trigger من الطلب الأصل
  stage       text not null
              check (stage in ('recorded','ordered','arrived','delivered','cancelled')),
  details     jsonb,
  staff_id    uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  created_at  timestamptz not null default now(),
  constraint patient_request_events_note_body
    check (kind <> 'note' or (body is not null and char_length(btrim(body)) between 1 and 1000)),
  -- message_sent يكتبه العميل، فيُتحقق من شكل details هنا لا في الواجهة
  constraint patient_request_events_message_details
    check (kind <> 'message_sent' or (
      details->>'message' in ('confirmation','arrival')
      and jsonb_typeof(details->'amounts_included') = 'boolean'
    ))
);

create index if not exists idx_patient_request_events_req on public.patient_request_events (request_id, created_at);

alter table public.patient_request_events enable row level security;

drop policy if exists "patient_request_events_select" on public.patient_request_events;
create policy "patient_request_events_select" on public.patient_request_events
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

-- العميل يكتب الملاحظات وسجل الرسائل فقط؛ أنواع النظام يكتبها trigger بصلاحية الدالة
drop policy if exists "patient_request_events_insert" on public.patient_request_events;
create policy "patient_request_events_insert" on public.patient_request_events
  for insert to authenticated
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and kind in ('note','message_sent')
    and staff_id = public.current_staff_id()
  );

-- لا سياسات تعديل/حذف: الملاحظة لا تُعدَّل ولا تُحذف بعد حفظها
revoke update, delete, truncate on public.patient_request_events from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٣) Triggers
-- أسماء trigger الـ BEFORE تُنفَّذ أبجدياً: a_guard ثم b_status ثم updated_at
-- ═══════════════════════════════════════════════════════════════

-- ١) حارس العزل والحقول الثابتة
-- security definer: يجب أن يرى المريض أياً كانت RLS على patients؛ رسالة الخطأ واحدة
-- للمريض غير الموجود وللمريض التابع لصيدلية أخرى حتى لا يُكشف وجوده
create or replace function public.patient_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_pharmacy uuid;
begin
  select pharmacy_id into v_patient_pharmacy from public.patients where id = new.patient_id;
  if v_patient_pharmacy is null or v_patient_pharmacy <> new.pharmacy_id then
    raise exception 'PATIENT_MISMATCH: المريض غير تابع لهذه الصيدلية' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.pharmacy_id is distinct from old.pharmacy_id
       or new.patient_id is distinct from old.patient_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'IMMUTABLE_FIELD: لا يمكن تغيير الصيدلية أو المريض أو المنشئ أو وقت الإنشاء'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patient_requests_a_guard on public.patient_requests;
create trigger trg_patient_requests_a_guard
  before insert or update on public.patient_requests
  for each row execute function public.patient_requests_guard();

-- ٢) قواعد الحالة: أمامي فقط (recorded → ordered → arrived → delivered) مع جواز القفز،
-- والإلغاء من أي حالة غير نهائية، و delivered/cancelled نهائيتان.
-- أعمدة *_at لا يضبطها إلا هذا الـ trigger فلا يزوّرها عميل
create or replace function public.patient_requests_status_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_rank int;
  v_new_rank int;
begin
  if tg_op = 'INSERT' then
    -- الطلب الجديد يبدأ دائماً من «مسجّل» بلا أي توقيت مرحلة
    if new.status <> 'recorded' then
      raise exception 'INVALID_STATUS: الطلب الجديد يبدأ بحالة مسجّل' using errcode = 'check_violation';
    end if;
    new.ordered_at := null;
    new.arrived_at := null;
    new.delivered_at := null;
    new.cancelled_at := null;
    return new;
  end if;

  -- تحديث: التواقيت من الصف القديم ما لم تُغيَّر الحالة
  new.ordered_at   := old.ordered_at;
  new.arrived_at   := old.arrived_at;
  new.delivered_at := old.delivered_at;
  new.cancelled_at := old.cancelled_at;

  if new.status is distinct from old.status then
    if old.status in ('delivered','cancelled') then
      raise exception 'FINAL_STATUS: الطلب في حالة نهائية ولا يمكن تغيير حالته' using errcode = 'check_violation';
    end if;

    if new.status <> 'cancelled' then
      v_old_rank := case old.status when 'recorded' then 1 when 'ordered' then 2 when 'arrived' then 3 end;
      v_new_rank := case new.status when 'recorded' then 1 when 'ordered' then 2 when 'arrived' then 3 when 'delivered' then 4 end;
      if v_new_rank <= v_old_rank then
        raise exception 'BACKWARD_STATUS: لا يمكن الرجوع إلى مرحلة سابقة' using errcode = 'check_violation';
      end if;
    end if;

    case new.status
      when 'ordered'   then new.ordered_at   := now();
      when 'arrived'   then new.arrived_at   := now();
      when 'delivered' then new.delivered_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patient_requests_b_status on public.patient_requests;
create trigger trg_patient_requests_b_status
  before insert or update on public.patient_requests
  for each row execute function public.patient_requests_status_rules();

drop trigger if exists trg_patient_requests_updated_at on public.patient_requests;
create trigger trg_patient_requests_updated_at
  before update on public.patient_requests
  for each row execute function public.set_updated_at();

-- ٣) كتابة أحداث النظام في الخط الزمني
-- security definer ببحث مسار ثابت: سياسة الإدراج تحجب أنواع النظام عن العميل،
-- فيكتبها هذا الـ trigger بصلاحية مالك الدالة. الفاعل دائماً current_staff_id()
-- من جلسة المستدعي. بلا هوية موظف (مثل service_role) نرفض بدل تسجيل حدث بلا فاعل
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
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, staff_id)
    values (new.pharmacy_id, new.id, 'created', new.status, v_staff);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.id, 'stage_change', new.status,
            jsonb_build_object('from', old.status, 'to', new.status), v_staff);
  end if;

  if new.price is distinct from old.price then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.id, 'price_change', new.status,
            jsonb_build_object('old', old.price, 'new', new.price), v_staff);
  end if;

  if new.deposit is distinct from old.deposit then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.id, 'deposit_change', new.status,
            jsonb_build_object('old', old.deposit, 'new', new.deposit), v_staff);
  end if;

  if new.deposit_returned is distinct from old.deposit_returned then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.id, 'deposit_return_change', new.status,
            jsonb_build_object('old', old.deposit_returned, 'new', new.deposit_returned), v_staff);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_patient_requests_log_insert on public.patient_requests;
create trigger trg_patient_requests_log_insert
  after insert on public.patient_requests
  for each row execute function public.patient_requests_log_events();

drop trigger if exists trg_patient_requests_log_update on public.patient_requests;
create trigger trg_patient_requests_log_update
  after update on public.patient_requests
  for each row execute function public.patient_requests_log_events();

-- ٤) الأحداث: الصيدلية والمرحلة من الطلب الأصل لا من العميل
-- security definer ليجد الطلب أياً كانت RLS؛ طلب غير موجود يُرفض، وطلب صيدلية أخرى
-- يأخذ pharmacy_id صاحبه فتسقط سياسة الإدراج
create or replace function public.patient_request_events_set_parent()
returns trigger
language plpgsql
security definer
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

  new.pharmacy_id := v_pharmacy;
  new.stage := v_status;
  return new;
end;
$$;

drop trigger if exists trg_patient_request_events_set_parent on public.patient_request_events;
create trigger trg_patient_request_events_set_parent
  before insert on public.patient_request_events
  for each row execute function public.patient_request_events_set_parent();
