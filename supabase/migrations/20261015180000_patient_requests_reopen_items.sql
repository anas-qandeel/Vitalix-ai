-- إعادة تفعيل الطلب الملغى باختيار الأصناف التي تعود.
-- تتبع هذه الهجرة تقاليد 20261015170000_patient_requests_reopen.sql، والدالة المستبدلة نسخة حرفية من نصها
-- الحالي مع التغيير المذكور فقط.
--
-- قرارات التصميم:
--  • الموظف يختار الأصناف التي تعود إلى مرحلتها قبل الإلغاء (stage_before_cancel)؛ البقية التي ألغاها
--    إلغاء الطلب تبقى ملغاة وتصير كالملغاة فرادى: يُمسح stage_before_cancel وحده ويبقى سببها «أُلغي الطلب».
--  • مسح stage_before_cancel لبند يبقى ملغى مسار نظام مغلق في حارس البنود (لا يغيّر شيئاً آخر في الصف)،
--    فلا يملكه العميل ولا يصل إليه إلا من reopen_patient_request().
--  • الحدث الوحيد في الخط الزمني يحمل أسماء الأصناف المعادة.

-- ═══════════════════════════════════════════════════════════════
-- ١) حارس تعديل البنود: مسار تثبيت الإلغاء للنظام
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

  -- تثبيت إلغاء بند ألغاه إلغاء الطلب (بيد النظام عند إعادة التفعيل لبند لم يُختر): يبقى ملغى
  -- ويصير كالملغى فرادى بمسح stage_before_cancel وحده، بلا أي تغيير آخر في الصف
  if old.stage = 'cancelled' and v_system and new.stage = 'cancelled'
     and old.stage_before_cancel is not null and new.stage_before_cancel is null
     and (to_jsonb(new) - 'stage_before_cancel') = (to_jsonb(old) - 'stage_before_cancel') then
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
-- ٢) reopen_patient_request بتوقيع جديد (يختار الأصناف)
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.reopen_patient_request(uuid, text);

create or replace function public.reopen_patient_request(
  p_request_id uuid,
  p_reason     text,
  p_item_ids   uuid[]
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
  v_ids      uuid[];
  v_valid    int;
  v_names    jsonb;
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

  -- الأصناف المختارة للعودة: بلا تكرار وبلا فراغات، وكلها من هذا الطلب وألغاها إلغاء الطلب
  select array_agg(distinct x) into v_ids from unnest(p_item_ids) as x where x is not null;
  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'REOPEN_ITEMS_REQUIRED: اختر صنفاً واحداً على الأقل لإعادته.' using errcode = 'check_violation';
  end if;

  select count(*) into v_valid
  from public.patient_request_items
  where request_id = p_request_id and id = any(v_ids)
    and stage = 'cancelled' and stage_before_cancel is not null;
  if v_valid <> array_length(v_ids, 1) then
    raise exception 'REOPEN_ITEMS_INVALID: بعض الأصناف المختارة لا يمكن إعادتها.' using errcode = 'check_violation';
  end if;

  select jsonb_agg(product_name order by created_at) into v_names
  from public.patient_request_items where id = any(v_ids);

  update public.patient_requests
     set status = 'open', cancel_reason = null, deposit_returned = null
   where id = p_request_id;

  -- المختارة فقط تعود إلى مرحلتها السابقة
  update public.patient_request_items
     set stage = stage_before_cancel
   where id = any(v_ids);

  -- غير المختارة تبقى ملغاة وتصير كالملغاة فرادى (سببها «أُلغي الطلب» يبقى كما هو)
  update public.patient_request_items
     set stage_before_cancel = null
   where request_id = p_request_id and stage = 'cancelled' and stage_before_cancel is not null;

  insert into public.patient_request_events (pharmacy_id, request_id, kind, details, staff_id)
  select pharmacy_id, id, 'status_change',
         jsonb_build_object('from', 'cancelled', 'to', 'open', 'reason', v_reason,
                            'items', coalesce(v_names, '[]'::jsonb)), v_staff
  from public.patient_requests where id = p_request_id;
end;
$$;

revoke execute on function public.reopen_patient_request(uuid, text, uuid[]) from public, anon;
grant execute on function public.reopen_patient_request(uuid, text, uuid[]) to authenticated;
