-- ترقيم الطلبات بحسب السنة (بتوقيت عمّان) ويُعرض «N/YYYY»، ولا يصل صنف قبل أن يُطلب من المورد.
-- تتبع هذه الهجرة تقاليد 20261015150000_patient_requests_v2.sql، وكل دالة مستبدلة نسخة حرفية من نصها
-- الحالي هناك مع التغيير المذكور فقط.
--
-- قرارات التصميم:
--  • الرقم يبدأ من 1 في كل سنة لكل صيدلية، والسنة تُحسب من now() بتوقيت Asia/Amman لا UTC حتى لا يتأخر
--    طلب ليلة رأس السنة إلى السنة الخطأ. الفرادة صارت على (pharmacy_id, request_year, request_number).
--  • request_year وrequest_number تضبطهما القاعدة دائماً (قيمة العميل تُستبدل) وتُجمَّدان بعد الإنشاء.
--  • الوصول لا يكون إلا بعد الطلب من المورد: انتقال «مسجّل ← وصل» مرفوض، والتراجع عن «وصل» يعود
--    دائماً إلى «طُلب من المورد».

-- ═══════════════════════════════════════════════════════════════
-- ١) request_year على patient_requests
-- triggers المستخدم تُعطَّل لحظة التعبئة: الحارس يرفض تعديل الطلبات النهائية ومسجّل الأحداث يشترط موظفاً،
-- والتعبئة تصحيح بيانات لا حدث تشغيلي. تُعاد فور الانتهاء
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_requests add column if not exists request_year integer;

alter table public.patient_requests disable trigger user;
update public.patient_requests
   set request_year = extract(year from created_at at time zone 'Asia/Amman')::int
 where request_year is null;
alter table public.patient_requests enable trigger user;

alter table public.patient_requests alter column request_year set not null;

-- ═══════════════════════════════════════════════════════════════
-- ٢) الفرادة تشمل السنة
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_requests drop constraint if exists patient_requests_number_uniq;
alter table public.patient_requests add constraint patient_requests_number_uniq
  unique (pharmacy_id, request_year, request_number);

-- ═══════════════════════════════════════════════════════════════
-- ٣) العدّاد بحسب السنة (يُعاد بناؤه ويُزرع من أكبر رقم موجود لكل صيدلية وسنة)
-- ═══════════════════════════════════════════════════════════════
drop table if exists public.patient_request_counters;

create table public.patient_request_counters (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  year        integer not null,
  last_number integer not null default 0,
  primary key (pharmacy_id, year)
);

-- RLS مفعّلة بلا أي سياسة: لا يصل إليه أحد إلا trigger الترقيم (security definer)
alter table public.patient_request_counters enable row level security;
revoke all on public.patient_request_counters from anon, authenticated;

insert into public.patient_request_counters (pharmacy_id, year, last_number)
select pharmacy_id, request_year, max(request_number)
from public.patient_requests
group by pharmacy_id, request_year;

-- ═══════════════════════════════════════════════════════════════
-- ٤) الترقيم: يحسب السنة بتوقيت عمّان ويأخذ التالي من عدّاد السنة
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_requests_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year integer := extract(year from now() at time zone 'Asia/Amman')::int;
begin
  new.request_year := v_year;   -- قيمة العميل تُستبدل دائماً
  insert into public.patient_request_counters as c (pharmacy_id, year, last_number)
  values (new.pharmacy_id, v_year, 1)
  on conflict (pharmacy_id, year) do update set last_number = c.last_number + 1
  returning c.last_number into new.request_number;
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٥) حارس الطلبات: request_year ضمن الحقول الثابتة
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
-- ٦) سجل الطلبات: حدث created يحمل السنة أيضاً
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
-- ٧) حارس تعديل البنود: لا وصول قبل الطلب من المورد
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
