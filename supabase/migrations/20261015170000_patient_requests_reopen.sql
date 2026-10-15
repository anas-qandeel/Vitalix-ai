-- إعادة تفعيل الطلب الملغى ما دام عربونه لم يُرجَع.
-- تتبع هذه الهجرة تقاليد 20261015150000 و20261015160000، وكل دالة مستبدلة نسخة حرفية من آخر نص لها
-- مع التغيير المذكور فقط.
--
-- قرارات التصميم:
--  • الأصناف التي ألغاها إلغاء الطلب نفسه تحفظ مرحلتها السابقة في stage_before_cancel وتعود إليها عند
--    إعادة التفعيل؛ أما الأصناف التي أُلغيت فرادى قبله فتبقى ملغاة (لا مرحلة سابقة لها).
--  • stage_before_cancel وإعادة التفعيل من النظام وحده: العميل لا يعدّل الحقل ولا يعيد تفعيل الطلب مباشرة،
--    بل عبر reopen_patient_request() (security definer) التي تكتب حدثاً واحداً بالسبب.
--  • إن أُرجع العربون فلا إعادة تفعيل (يُسجَّل طلب جديد)، لأن الإرجاع نهائي.

-- ═══════════════════════════════════════════════════════════════
-- ١) stage_before_cancel على البنود
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_items
  add column if not exists stage_before_cancel text
  check (stage_before_cancel is null or stage_before_cancel in ('recorded','ordered','arrived'));

-- ═══════════════════════════════════════════════════════════════
-- ٢) الإلغاء المتتابع يحفظ المرحلة السابقة
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_requests_cascade_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.patient_request_items
       set stage = 'cancelled', cancel_reason = 'أُلغي الطلب', stage_before_cancel = stage
     where request_id = new.id
       and stage in ('recorded','ordered','arrived');
  end if;
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٣) حارس إدراج البنود: stage_before_cancel يبدأ فارغاً
-- ═══════════════════════════════════════════════════════════════
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
  new.stage_before_cancel := null;
  new.supplier      := nullif(btrim(new.supplier), '');
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٤) حارس تعديل البنود: حقل محمي من العميل + مسار الاستعادة للنظام
-- ═══════════════════════════════════════════════════════════════
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

  -- stage_before_cancel يضبطه النظام وحده (الإلغاء المتتابع ثم الاستعادة)
  if not v_system and new.stage_before_cancel is distinct from old.stage_before_cancel then
    raise exception 'ITEM_IMMUTABLE: هذا الحقل تضبطه المنصة ولا يُعدَّل مباشرة'
      using errcode = 'check_violation';
  end if;

  -- استعادة بند أُلغي بإلغاء الطلب (بيد النظام عند إعادة تفعيل الطلب): تسبق فحص إغلاق الطلب وتجميد البند
  if old.stage = 'cancelled' and v_system
     and old.stage_before_cancel is not null and new.stage = old.stage_before_cancel then
    new.cancelled_at := null;
    new.cancel_reason := null;
    new.stage_before_cancel := null;
    new.ordered_at := old.ordered_at;
    new.arrived_at := old.arrived_at;
    return new;
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
  elsif old.stage = 'ordered' and new.stage = 'arrived' then
    new.arrived_at := now();
  elsif old.stage = 'ordered' and new.stage = 'recorded' then
    new.ordered_at := null;
  elsif old.stage = 'arrived' and new.stage = 'ordered' then
    new.arrived_at := null;
  elsif old.stage = 'arrived' and new.stage = 'delivered' and v_system then
    new.delivered_at := now();
  else
    raise exception 'ITEM_STAGE_NOT_ALLOWED: هذا الانتقال بين المراحل غير مسموح' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٥) مسجّل أحداث البنود: لا حدث لاستعادة بند
-- ═══════════════════════════════════════════════════════════════
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

  -- استعادة بند بإعادة تفعيل الطلب: حدث إعادة التفعيل يغطيها فلا يُكتب شيء
  if old.stage = 'cancelled' and new.stage <> 'cancelled' then
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

-- ═══════════════════════════════════════════════════════════════
-- ٦) حارس الطلبات: النظام وحده يعيد تفعيل طلب ملغى
-- ═══════════════════════════════════════════════════════════════
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
     or new.request_year is distinct from old.request_year
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'IMMUTABLE_FIELD: لا يمكن تغيير الصيدلية أو المريض أو رقم الطلب أو المنشئ أو وقت الإنشاء'
      using errcode = 'check_violation';
  end if;

  -- طلب نهائي: التغيير الوحيد المسموح إجابة إرجاع العربون على طلب ملغى
  if old.status <> 'open' then
    -- إعادة تفعيل طلب ملغى: للنظام وحده (دالة reopen_patient_request)، وهي تمسح السبب والعربون
    if v_system and old.status = 'cancelled' and new.status = 'open' then
      new.cancelled_at := null;
      return new;
    end if;
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

-- ═══════════════════════════════════════════════════════════════
-- ٧) مسجّل أحداث الطلبات: لا أحداث لتحديث إعادة التفعيل
-- ═══════════════════════════════════════════════════════════════
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
    values (new.pharmacy_id, new.id, 'created', jsonb_build_object('request_number', new.request_number, 'request_year', new.request_year), v_staff);
    return new;
  end if;

  -- إعادة التفعيل يكتب لها reopen_patient_request حدثاً واحداً بالسبب، فلا أحداث هنا
  if old.status = 'cancelled' and new.status = 'open' then
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

-- ═══════════════════════════════════════════════════════════════
-- ٨) reopen_patient_request — المسار الوحيد لإعادة التفعيل
-- security definer لأن العميل لا يملك حق إعادة فتح طلب ولا استعادة بنوده. الطلب يُقفل (for update).
-- ═══════════════════════════════════════════════════════════════
create or replace function public.reopen_patient_request(
  p_request_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff    uuid := public.current_staff_id();
  v_status   text;
  v_returned boolean;
  v_reason   text := btrim(coalesce(p_reason, ''));
begin
  if v_staff is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لإعادة تفعيل الطلب' using errcode = 'insufficient_privilege';
  end if;

  select status, deposit_returned into v_status, v_returned
  from public.patient_requests
  where id = p_request_id and pharmacy_id = public.current_pharmacy_id()
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND: الطلب غير موجود' using errcode = 'foreign_key_violation';
  end if;
  if v_status <> 'cancelled' then
    raise exception 'REQUEST_NOT_CANCELLED: الطلب ليس ملغى.' using errcode = 'check_violation';
  end if;
  if v_returned = true then
    raise exception 'DEPOSIT_ALREADY_RETURNED: أُرجع العربون للمريض، فلا يمكن إعادة تفعيل الطلب. سجّل طلباً جديداً.'
      using errcode = 'check_violation';
  end if;
  if char_length(v_reason) = 0 then
    raise exception 'REOPEN_REASON_REQUIRED: اكتب سبب إعادة التفعيل.' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'REOPEN_REASON_REQUIRED: سبب إعادة التفعيل لا يتجاوز 300 حرف.' using errcode = 'check_violation';
  end if;

  update public.patient_requests
     set status = 'open', cancel_reason = null, deposit_returned = null
   where id = p_request_id;

  update public.patient_request_items
     set stage = stage_before_cancel
   where request_id = p_request_id and stage = 'cancelled' and stage_before_cancel is not null;

  insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
  select pharmacy_id, id, 'status_change',
         jsonb_build_object('from', 'cancelled', 'to', 'open', 'reason', v_reason), v_staff
  from public.patient_requests where id = p_request_id;
end;
$$;

revoke execute on function public.reopen_patient_request(uuid, text) from public, anon;
grant execute on function public.reopen_patient_request(uuid, text) to authenticated;
