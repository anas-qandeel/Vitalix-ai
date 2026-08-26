-- توسيع تسجيل حركات المراحل في activity_log
-- كانت الدالة تسجّل الانتقال إلى messaged وحده باسم reminder_sent
-- صارت تسجّل كل انتقال ذي معنى (messaged / no_response / renewed / archived)
-- باسم stage_changed، مع from و to و actor في حقل details
--
-- الدخول إلى due لا يُسجَّل: نتيجة حسابية من تاريخ الدواء لا قرار بشري
--
-- تمييز النظام من الموظف: القاعدة لا ترى نيّة الكود، والنقل التلقائي يجري
-- في متصفح الموظف بتوكنه، فـ current_staff_id() تُرجع موظفاً في الحالتين.
-- لذا يُستنتج المصدر من طبيعة الانتقال: messaged و renewed و archived
-- لا تحدث إلا بضغطة موظف؛ و no_response وحده غامض، فيُحسم بالمدة —
-- تجاوُز العتبة يعني أن الصفحة نقلته تلقائياً.
--
-- تنبيه: v_expiry مثبّت على 5 ليطابق NEXT_PUBLIC_MSG_EXPIRY_DAYS.
-- القاعدة لا تقرأ متغيّرات البيئة — أي تغيير هناك يستوجب تغييره هنا.

create or replace function public.log_reminder_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_patient    text;
  v_old        text;
  v_actor      text;
  v_expiry     int := 5;
begin
  v_old := case when TG_OP = 'UPDATE' then old.pipeline_stage else null end;

  if new.pipeline_stage is not distinct from v_old then
    return new;
  end if;
  if new.pipeline_stage not in ('messaged','no_response','renewed','archived') then
    return new;
  end if;

  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return new;
  end if;

  if new.pipeline_stage = 'no_response'
     and new.reminded_at is not null
     and (now()::date - new.reminded_at::date) >= v_expiry then
    v_actor := 'system';
  else
    v_actor := 'staff';
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  select p.name into v_patient
  from public.patients p where p.id = new.patient_id;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, new.pharmacy_id), v_staff_id, v_staff_name,
     'stage_changed', 'reminder', new.patient_id, v_patient,
     jsonb_build_object('from', v_old, 'to', new.pipeline_stage, 'actor', v_actor));

  return new;
end;
$function$;