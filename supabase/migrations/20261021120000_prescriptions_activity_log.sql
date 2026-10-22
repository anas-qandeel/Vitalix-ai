-- سجل نشاط الوصفات الطبية: يُكتب في activity_log الحالي بنمط log_medication_activity / log_patient_note_activity.
--
-- قرارات التصميم:
--  • triggers على prescriptions وحدها، لا الواجهة ولا الـ RPC: الوصفة تُنشأ وتُعدَّل بـ RPC، وتُحدَّث أعمدة ملفها
--    وتُحذف مباشرة من الجدول، وأي تسجيل خارج القاعدة يفوّت مساراً.
--  • ترتيب update_prescription (راجعته في 20261021100000_prescriptions.sql): يُحدّث رأس الوصفة أولاً (update على
--    prescriptions) ثم يحذف البنود ويعيد إدخالها. لذلك BEFORE UPDATE على الرأس يرى البنود القديمة سليمة فيلتقط
--    لقطة «قبل» كاملة بلا تعديل على الدالة. ولأن الدالة تعيد كتابة الرأس بقيمه نفسها حتى لو تغيّرت الأدوية وحدها،
--    يُسجَّل كل تحديث للرأس (ما عدا فك الربط الآلي بحذف المريض)، و details.changed تذكر الحقول التي تغيّرت فعلاً؛
--    قائمة فارغة = لم يتغيّر الرأس (تعديل الأدوية، أو حفظ بلا تغيير).
--  • الفاعل current_staff_id() ولا تسجيل إن كان فارغاً (service role أو أرشفة صيدلية): نفس قاعدة بقية دوال السجل،
--    «سجل يقول مجهول يعطي ثقة كاذبة».
--  • الإضافة تُسجَّل AFTER INSERT (الصف نهائي بعد trigger الحارس)؛ أما التعديل والحذف فـ BEFORE لأخذ لقطة البنود
--    قبل أن تغيّرها الـ RPC أو تحذفها الـ cascade. إن رُفضت العملية بعدها يتراجع السجل معها (معاملة واحدة).
--  • لا أسماء أدوية في حدث الإضافة (هي في جدول الوصفات نفسه). تظهر في «قبل» و«لقطة الحذف» فقط لأنها المكان الوحيد
--    الذي تبقى فيه بعد التعديل أو الحذف.
--  • لا RLS جديدة: السياسة الحالية (المالك فقط يقرأ سجل صيدليته، ولا كتابة من العميل) تكفي.
--  • لا trigger على prescription_items: تعديل أو حذف بند مباشر بلا المرور بـ update_prescription لا يُسجَّل.

-- ═══ ١) إضافة وصفة ═══
create or replace function public.log_prescription_insert_activity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_staff_id   uuid := public.current_staff_id();
  v_staff_name text;
begin
  if v_staff_id is null then
    return new;
  end if;

  select ps.name into v_staff_name from public.pharmacy_staff ps where ps.id = v_staff_id;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (new.pharmacy_id, v_staff_id, v_staff_name, 'prescription_added', 'prescription', new.id, new.doctor_name,
     jsonb_strip_nulls(jsonb_build_object(
       'patient_name', new.patient_name,
       'patient_id',   new.patient_id,
       'entry_date',   new.entry_date,
       -- تاريخ الوصفة خلاف يوم التسجيل بتوقيت عمّان (رجوع بالتاريخ)
       'backdated',    new.entry_date <> (new.created_at at time zone 'Asia/Amman')::date
     )));

  return new;
end $$;

drop trigger if exists trg_prescriptions_log_insert on public.prescriptions;
create trigger trg_prescriptions_log_insert
  after insert on public.prescriptions
  for each row execute function public.log_prescription_insert_activity();

-- ═══ ٢) تعديل وصفة ═══
create or replace function public.log_prescription_update_activity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_staff_id   uuid := public.current_staff_id();
  v_staff_name text;
  v_recorder   text;
  v_changed    text[] := '{}';
  v_drugs      jsonb;
begin
  if v_staff_id is null then
    return new;
  end if;

  if new.doctor_name     is distinct from old.doctor_name     then v_changed := array_append(v_changed, 'doctor_name'); end if;
  if new.patient_name    is distinct from old.patient_name    then v_changed := array_append(v_changed, 'patient_name'); end if;
  if new.pharmacist_name is distinct from old.pharmacist_name then v_changed := array_append(v_changed, 'pharmacist_name'); end if;
  if new.entry_date      is distinct from old.entry_date      then v_changed := array_append(v_changed, 'entry_date'); end if;
  if new.patient_id      is distinct from old.patient_id      then v_changed := array_append(v_changed, 'patient_id'); end if;
  if new.file_path is distinct from old.file_path
     or new.file_name is distinct from old.file_name
     or new.file_size is distinct from old.file_size
     or new.file_mime is distinct from old.file_mime then
    v_changed := array_append(v_changed, 'file');
  end if;

  -- فك الربط الآلي (on delete set null) بعد حذف ملف المريض نفسه ليس تعديلاً بشرياً؛
  -- أما فكّه بيد الصيدلاني فالمريض موجود ويُسجَّل
  if v_changed = array['patient_id']::text[] and new.patient_id is null
     and not exists (select 1 from public.patients p where p.id = old.patient_id) then
    return new;
  end if;

  -- البنود القديمة سليمة هنا: update_prescription يحدّث الرأس قبل أن يحذفها ويعيد إدخالها
  select coalesce(jsonb_agg(i.drug_name order by i.position, i.id), '[]'::jsonb)
    into v_drugs
    from public.prescription_items i where i.prescription_id = old.id;

  select ps.name into v_staff_name from public.pharmacy_staff ps where ps.id = v_staff_id;
  -- المسجِّل الأصلي يُذكر فقط إن اختلف عن المعدِّل (مثلاً المالك يعدّل وصفة موظف)
  if old.recorded_by is distinct from v_staff_id then
    select ps.name into v_recorder from public.pharmacy_staff ps where ps.id = old.recorded_by;
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (new.pharmacy_id, v_staff_id, v_staff_name, 'prescription_updated', 'prescription', new.id, new.doctor_name,
     jsonb_strip_nulls(jsonb_build_object(
       'patient_name',     new.patient_name,
       'changed',          to_jsonb(v_changed),
       'recorded_by_name', v_recorder,
       'before', jsonb_build_object(
         'doctor_name',     old.doctor_name,
         'patient_name',    old.patient_name,
         'pharmacist_name', old.pharmacist_name,
         'entry_date',      old.entry_date,
         'patient_id',      old.patient_id,
         'drugs',           v_drugs,
         'file_name',       old.file_name
       )
     )));

  return new;
end $$;

-- اسم z_ ليُنفَّذ بعد trg_prescriptions_b_guard و c_updated_at (لا يعدّل NEW، والترتيب للوضوح فقط)
drop trigger if exists trg_prescriptions_z_log_update on public.prescriptions;
create trigger trg_prescriptions_z_log_update
  before update on public.prescriptions
  for each row execute function public.log_prescription_update_activity();

-- ═══ ٣) حذف وصفة ═══
create or replace function public.log_prescription_delete_activity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_staff_id   uuid := public.current_staff_id();
  v_staff_name text;
  v_recorder   text;
  v_drugs      jsonb;
begin
  if v_staff_id is null then
    return old;
  end if;

  -- BEFORE DELETE: البنود ما زالت موجودة، وستحذفها الـ cascade بعد هذا الـ trigger
  select coalesce(jsonb_agg(i.drug_name order by i.position, i.id), '[]'::jsonb)
    into v_drugs
    from public.prescription_items i where i.prescription_id = old.id;

  select ps.name into v_staff_name from public.pharmacy_staff ps where ps.id = v_staff_id;
  if old.recorded_by is distinct from v_staff_id then
    select ps.name into v_recorder from public.pharmacy_staff ps where ps.id = old.recorded_by;
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (old.pharmacy_id, v_staff_id, v_staff_name, 'prescription_deleted', 'prescription', old.id, old.doctor_name,
     jsonb_strip_nulls(jsonb_build_object(
       'patient_name', old.patient_name,
       'snapshot', jsonb_build_object(
         'doctor_name',      old.doctor_name,
         'patient_name',     old.patient_name,
         'pharmacist_name',  old.pharmacist_name,
         'entry_date',       old.entry_date,
         'created_at',       old.created_at,
         'drugs',            v_drugs,
         'file_name',        old.file_name,
         'file_path',        old.file_path,
         'patient_id',       old.patient_id,
         'recorded_by_name', v_recorder
       )
     )));

  return old;
end $$;

drop trigger if exists trg_prescriptions_log_delete on public.prescriptions;
create trigger trg_prescriptions_log_delete
  before delete on public.prescriptions
  for each row execute function public.log_prescription_delete_activity();
