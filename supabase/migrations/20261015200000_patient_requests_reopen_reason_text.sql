-- صياغة سبب إلغاء الأصناف التي لم تُختر عند إعادة تفعيل الطلب.
-- تتبع الهجرة تقاليد 20261015190000_patient_requests_reopen_reason.sql، والدالة المستبدلة نسخة حرفية من نصها
-- الحالي مع تغيير نص السبب وحده. لا تُحدَّث صفوف موجودة: النص الجديد يسري على إعادات التفعيل اللاحقة فقط.

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

  -- غير المختارة تبقى ملغاة وتصير كالملغاة فرادى بسبب يوضّح أنها لم تُختر عند إعادة التفعيل
  update public.patient_request_items
     set stage_before_cancel = null, cancel_reason = 'أُلغي مع الطلب ولم يُعَد تفعيله'
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
