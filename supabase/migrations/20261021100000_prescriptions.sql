-- supabase/migrations/20261021100000_prescriptions.sql
--
-- سجل الوصفات الطبية: سجل يومي للصيدلية (الطبيب، المريض، الأدوية، الصيدلاني).
-- الوصفة الواحدة قد تحوي عدة أدوية (prescription_items). المريض اختياري، والملف اختياري.
--
-- قرارات التصميم (نمط patient_requests / patient_notes):
--  • الصيدلية والمسجِّل ووقت التسجيل تُضبط بـ triggers من جلسة المستدعي، فلا يزوّرها عميل معدَّل.
--  • entry_date (تاريخ الوصفة كما يكتبه الصيدلاني) منفصل عن created_at (وقت التسجيل الفعلي).
--    نافذة entry_date تُفرض في سياسات RLS لا بـ CHECK لأن now() ليست immutable.
--  • التعديل والحذف ضمن يوم created_at بتوقيت عمّان فقط، للمسجِّل أو المالك.
--  • علامة «سُجّلت متأخرة» لا تُخزَّن: تُحسب في الواجهة من entry_date مقابل (created_at بتوقيت عمّان)::date.
--  • دالتا create_prescription / update_prescription بصلاحيات المستدعي (security invoker)،
--    فتبقى RLS والـ triggers هي المرجع الفعلي؛ الدالتان تضيفان الذرّية ورسائل خطأ عربية فقط.

-- ═══ ١) الجداول ═══
create table if not exists public.prescriptions (
  id              uuid primary key default gen_random_uuid(),
  pharmacy_id     uuid not null references public.pharmacies(id) on delete cascade,
  entry_date      date not null default (now() at time zone 'Asia/Amman')::date,
  doctor_name     text not null check (char_length(btrim(doctor_name))     between 1 and 120),
  patient_name    text not null check (char_length(btrim(patient_name))    between 1 and 120),
  -- اختياري؛ set null كي لا يُفقد السجل اليومي بحذف ملف المريض (patient_name لقطة نصية)
  patient_id      uuid references public.patients(id) on delete set null,
  pharmacist_name text not null check (char_length(btrim(pharmacist_name)) between 1 and 120),
  -- بلا on delete set null لأن العمود not null؛ الموظف يُعطَّل ولا يُحذف (كما patient_requests.created_by)
  recorded_by     uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  file_path       text,
  file_name       text check (file_name is null or char_length(file_name) <= 255),
  file_size       integer,
  file_mime       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- مفتاح مركّب يتيح للبنود ربط (الوصفة، الصيدلية) معاً فيستحيل اختلافهما
  constraint prescriptions_id_pharmacy_uk unique (id, pharmacy_id),
  constraint prescriptions_file_all_or_none check (
    (file_path is null) = (file_name is null)
    and (file_path is null) = (file_size is null)
    and (file_path is null) = (file_mime is null)
  ),
  constraint prescriptions_file_size_max check (file_size is null or file_size between 1 and 2097152),
  constraint prescriptions_file_mime_allowed check (
    file_mime is null or file_mime in ('image/jpeg','image/png','image/webp','application/pdf')
  ),
  -- المسار الوحيد المقبول {pharmacy_id}/{prescription_id}.{ext}، فلا يشير سجل إلى ملف غريب
  constraint prescriptions_file_path_shape check (
    file_path is null or file_path like pharmacy_id::text || '/' || id::text || '.%'
  )
);

create table if not exists public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null,
  pharmacy_id     uuid not null,
  drug_name       text not null check (char_length(btrim(drug_name)) between 1 and 150),
  position        integer not null default 0 check (position >= 0),
  -- (الوصفة، الصيدلية) معاً: تطابق pharmacy_id مع وصفته مضمون بالقيد لا بالواجهة
  constraint prescription_items_prescription_fk
    foreign key (prescription_id, pharmacy_id)
    references public.prescriptions (id, pharmacy_id) on delete cascade
);

create index if not exists idx_prescriptions_ph_entry_date
  on public.prescriptions (pharmacy_id, entry_date desc);
create index if not exists idx_prescriptions_patient
  on public.prescriptions (patient_id) where patient_id is not null;
create index if not exists idx_prescription_items_prescription
  on public.prescription_items (prescription_id);
-- سياسة حذف التخزين تبحث بـ file_path
create index if not exists idx_prescriptions_file_path
  on public.prescriptions (file_path) where file_path is not null;

-- ═══ ٢) قاعدة «قابلة للتعديل» في مكان واحد ═══
-- اليوم بتوقيت عمّان ليوم created_at (لا entry_date) + المسجِّل نفسه أو المالك.
-- تُستعمل في سياسات update/delete للوصفة، وفي سياسات البنود، وفي سياسة حذف الملف،
-- فلا تتباعد القواعد الثلاث.
create or replace function public.prescription_is_editable(
  p_pharmacy_id uuid, p_recorded_by uuid, p_created_at timestamptz
) returns boolean language sql stable as $$
  select p_pharmacy_id = public.current_pharmacy_id()
     and (p_created_at at time zone 'Asia/Amman')::date = (now() at time zone 'Asia/Amman')::date
     and (p_recorded_by = public.current_staff_id() or public.current_role_name() = 'owner');
$$;

-- ═══ ٣) Triggers ═══
-- (أ) حارس الوصفة: الصيدلية والمسجِّل ووقت التسجيل من الجلسة، وعدم تغييرها لاحقاً
create or replace function public.prescriptions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ph uuid := public.current_pharmacy_id(); v_staff uuid := public.current_staff_id();
begin
  if tg_op = 'INSERT' then
    if v_ph is null or v_staff is null then
      raise exception 'STAFF_REQUIRED: يلزم موظف نشط لتسجيل الوصفة' using errcode = 'insufficient_privilege';
    end if;
    new.pharmacy_id := v_ph;
    new.recorded_by := v_staff;
    new.created_at  := now();
    new.updated_at  := now();
  else
    if new.id is distinct from old.id
       or new.pharmacy_id is distinct from old.pharmacy_id
       or new.recorded_by is distinct from old.recorded_by
       or new.created_at  is distinct from old.created_at then
      raise exception 'IMMUTABLE_FIELD: لا يمكن تعديل الصيدلية أو المسجِّل أو وقت التسجيل' using errcode = 'check_violation';
    end if;
  end if;
  -- FK وحده لا يفحص الصيدلية؛ رسالة واحدة للمريض غير الموجود والتابع لصيدلية أخرى
  if new.patient_id is not null
     and (tg_op = 'INSERT' or new.patient_id is distinct from old.patient_id)
     and not exists (select 1 from public.patients where id = new.patient_id and pharmacy_id = new.pharmacy_id) then
    raise exception 'PATIENT_NOT_FOUND: المريض غير موجود' using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_prescriptions_b_guard on public.prescriptions;
create trigger trg_prescriptions_b_guard
  before insert or update on public.prescriptions
  for each row execute function public.prescriptions_guard();

drop trigger if exists trg_prescriptions_c_updated_at on public.prescriptions;
create trigger trg_prescriptions_c_updated_at
  before update on public.prescriptions
  for each row execute function public.set_updated_at();

-- (ب) حارس البند: الصيدلية تُؤخذ من الوصفة الأم، والوصفة لا تتغير
create or replace function public.prescription_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ph uuid;
begin
  if tg_op = 'INSERT' then
    select pharmacy_id into v_ph from public.prescriptions where id = new.prescription_id;
    if v_ph is null then
      raise exception 'PRESCRIPTION_NOT_FOUND: الوصفة غير موجودة' using errcode = 'foreign_key_violation';
    end if;
    new.pharmacy_id := v_ph;
  elsif new.id is distinct from old.id
     or new.prescription_id is distinct from old.prescription_id
     or new.pharmacy_id is distinct from old.pharmacy_id then
    raise exception 'IMMUTABLE_FIELD: لا يمكن نقل البند إلى وصفة أخرى' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_prescription_items_b_guard on public.prescription_items;
create trigger trg_prescription_items_b_guard
  before insert or update on public.prescription_items
  for each row execute function public.prescription_items_guard();

-- ═══ ٤) RLS: prescriptions ═══
alter table public.prescriptions enable row level security;

drop policy if exists "prescriptions_select" on public.prescriptions;
create policy "prescriptions_select" on public.prescriptions
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

-- نافذة entry_date: من (اليوم − 7) إلى اليوم بتوقيت عمّان، تُقيَّم عند الإدخال والتحديث
drop policy if exists "prescriptions_insert" on public.prescriptions;
create policy "prescriptions_insert" on public.prescriptions
  for insert to authenticated
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and recorded_by = public.current_staff_id()
    and entry_date <= (now() at time zone 'Asia/Amman')::date
    and entry_date >= (now() at time zone 'Asia/Amman')::date - 7
  );

drop policy if exists "prescriptions_update" on public.prescriptions;
create policy "prescriptions_update" on public.prescriptions
  for update to authenticated
  using (public.prescription_is_editable(pharmacy_id, recorded_by, created_at))
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and entry_date <= (now() at time zone 'Asia/Amman')::date
    and entry_date >= (now() at time zone 'Asia/Amman')::date - 7
  );

drop policy if exists "prescriptions_delete" on public.prescriptions;
create policy "prescriptions_delete" on public.prescriptions
  for delete to authenticated
  using (public.prescription_is_editable(pharmacy_id, recorded_by, created_at));

revoke truncate on public.prescriptions from anon, authenticated;

-- ═══ ٥) RLS: prescription_items (تتبع قابلية تعديل الوصفة الأم) ═══
alter table public.prescription_items enable row level security;

drop policy if exists "prescription_items_select" on public.prescription_items;
create policy "prescription_items_select" on public.prescription_items
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

drop policy if exists "prescription_items_insert" on public.prescription_items;
create policy "prescription_items_insert" on public.prescription_items
  for insert to authenticated
  with check (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and public.prescription_is_editable(p.pharmacy_id, p.recorded_by, p.created_at)
  ));

drop policy if exists "prescription_items_update" on public.prescription_items;
create policy "prescription_items_update" on public.prescription_items
  for update to authenticated
  using (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and public.prescription_is_editable(p.pharmacy_id, p.recorded_by, p.created_at)
  ))
  with check (pharmacy_id = public.current_pharmacy_id());

drop policy if exists "prescription_items_delete" on public.prescription_items;
create policy "prescription_items_delete" on public.prescription_items
  for delete to authenticated
  using (exists (
    select 1 from public.prescriptions p
    where p.id = prescription_id
      and public.prescription_is_editable(p.pharmacy_id, p.recorded_by, p.created_at)
  ));

revoke truncate on public.prescription_items from anon, authenticated;

-- ═══ ٦) Storage: bucket خاص ═══
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'prescriptions', 'prescriptions', false, 2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- المسار {pharmacy_id}/{prescription_id}.{ext}: أول مجلد = معرّف صيدلية المستخدم
drop policy if exists "prescriptions_files_select_own_pharmacy" on storage.objects;
create policy "prescriptions_files_select_own_pharmacy" on storage.objects
  for select to authenticated
  using (bucket_id = 'prescriptions'
         and (storage.foldername(name))[1] = public.current_pharmacy_id()::text);

drop policy if exists "prescriptions_files_insert_own_pharmacy" on storage.objects;
create policy "prescriptions_files_insert_own_pharmacy" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'prescriptions'
              and (storage.foldername(name))[1] = public.current_pharmacy_id()::text);

-- لا سياسة update على storage.objects عمداً: استبدال الملف = حذف ثم رفع (لا upsert)،
-- فلا يستطيع أحد الكتابة فوق ملف وصفة قائمة.

-- الحذف: داخل مجلد صيدلية المستخدم، وفي إحدى حالتين:
--  (أ) للكائن صف وصفة (file_path = اسم الكائن الكامل) وكانت الوصفة قابلة للتعديل
--      (يوم تسجيلها، للمسجِّل أو المالك).
--  (ب) لا صف وصفة يشير إليه: كائن يتيم لم يُربط بوصفة (فشل الإنشاء بعد الرفع) أو بقي بعد حذف صفها.
-- المحظور الوحيد: كائن له صف وصفة غير قابل للتعديل، فلا يحذف موظف صورة وصفة قديمة.
-- ترتيب الحذف المعتمد يبقى الملف أولاً ثم الصف، كي لا يبقى صف يشير إلى ملف محذوف
-- إن فشل حذف الصف؛ لكن عكس الترتيب لم يعد يترك ملفاً بلا طريق لحذفه (الحالة ب).
drop policy if exists "prescriptions_files_delete_own_pharmacy" on storage.objects;
create policy "prescriptions_files_delete_own_pharmacy" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = public.current_pharmacy_id()::text
    and (
      exists (
        select 1 from public.prescriptions p
        where p.file_path = storage.objects.name
          and public.prescription_is_editable(p.pharmacy_id, p.recorded_by, p.created_at)
      )
      or not exists (
        select 1 from public.prescriptions p
        where p.file_path = storage.objects.name
      )
    )
  );

-- ═══ ٧) الدوال: security invoker (RLS والـ triggers تبقى مطبّقة) ═══

-- مساعد: تنظيف اسم نصي والتحقق منه
create or replace function public.prescription_clean_name(p_val text, p_label text, p_max integer)
returns text language plpgsql security invoker set search_path = public as $$
declare v text := btrim(coalesce(p_val, ''));
begin
  if v = '' then
    raise exception 'NAME_REQUIRED: يلزم إدخال %', p_label using errcode = 'check_violation';
  end if;
  if char_length(v) > p_max then
    raise exception 'NAME_TOO_LONG: % يتجاوز % حرفاً', p_label, p_max using errcode = 'check_violation';
  end if;
  return v;
end $$;

-- مساعد: تنظيف قائمة الأدوية (قص، حذف الفارغ، حفظ الترتيب) والتحقق من العدد والطول
create or replace function public.prescription_clean_drugs(p_drugs text[])
returns text[] language plpgsql security invoker set search_path = public as $$
declare v text[];
begin
  select coalesce(array_agg(btrim(t.d) order by t.ord), '{}')
    into v
    from unnest(p_drugs) with ordinality as t(d, ord)
   where btrim(coalesce(t.d, '')) <> '';
  if cardinality(v) = 0 then
    raise exception 'DRUGS_REQUIRED: يلزم إدخال دواء واحد على الأقل' using errcode = 'check_violation';
  end if;
  if cardinality(v) > 30 then
    raise exception 'TOO_MANY_DRUGS: الحد الأقصى 30 دواءً في الوصفة الواحدة' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(v) d where char_length(d) > 150) then
    raise exception 'DRUG_TOO_LONG: اسم الدواء يتجاوز 150 حرفاً' using errcode = 'check_violation';
  end if;
  return v;
end $$;

-- إنشاء وصفة وبنودها في معاملة واحدة
create or replace function public.create_prescription(
  p_id          uuid,
  p_entry_date  date,
  p_doctor      text,
  p_patient     text,
  p_patient_id  uuid,
  p_pharmacist  text,
  p_drugs       text[],
  p_file_path   text    default null,
  p_file_name   text    default null,
  p_file_size   integer default null,
  p_file_mime   text    default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id     uuid := coalesce(p_id, gen_random_uuid());
  v_today  date := (now() at time zone 'Asia/Amman')::date;
  v_ph     uuid := public.current_pharmacy_id();
  v_doctor text;
  v_patient text;
  v_pharmacist text;
  v_drugs  text[];
begin
  if v_ph is null or public.current_staff_id() is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لتسجيل الوصفة' using errcode = 'insufficient_privilege';
  end if;

  v_doctor     := public.prescription_clean_name(p_doctor,     'اسم الطبيب',    120);
  v_patient    := public.prescription_clean_name(p_patient,    'اسم المريض',    120);
  v_pharmacist := public.prescription_clean_name(p_pharmacist, 'اسم الصيدلاني', 120);
  v_drugs      := public.prescription_clean_drugs(p_drugs);

  if p_entry_date is not null and (p_entry_date > v_today or p_entry_date < v_today - 7) then
    raise exception 'INVALID_ENTRY_DATE: تاريخ الوصفة يجب ألا يكون مستقبلياً ولا أقدم من 7 أيام' using errcode = 'check_violation';
  end if;

  if p_file_path is not null then
    if p_file_name is null or p_file_size is null or p_file_mime is null then
      raise exception 'FILE_INCOMPLETE: بيانات الملف ناقصة' using errcode = 'check_violation';
    end if;
    if p_file_path not like v_ph::text || '/' || v_id::text || '.%' then
      raise exception 'INVALID_FILE_PATH: مسار الملف غير صالح' using errcode = 'check_violation';
    end if;
    if p_file_size > 2097152 then
      raise exception 'FILE_TOO_LARGE: حجم الملف يتجاوز 2 ميغابايت' using errcode = 'check_violation';
    end if;
  elsif p_file_name is not null or p_file_size is not null or p_file_mime is not null then
    raise exception 'FILE_INCOMPLETE: بيانات الملف ناقصة' using errcode = 'check_violation';
  end if;

  begin
    insert into public.prescriptions
      (id, entry_date, doctor_name, patient_name, patient_id, pharmacist_name,
       file_path, file_name, file_size, file_mime)
    values
      (v_id, coalesce(p_entry_date, v_today), v_doctor, v_patient, p_patient_id, v_pharmacist,
       p_file_path, btrim(p_file_name), p_file_size, p_file_mime);
  exception when unique_violation then
    raise exception 'DUPLICATE_ID: الوصفة مسجّلة مسبقاً' using errcode = 'unique_violation';
  end;

  insert into public.prescription_items (prescription_id, drug_name, position)
  select v_id, t.d, (t.ord - 1)::int
    from unnest(v_drugs) with ordinality as t(d, ord);

  return v_id;
end $$;

-- تعديل وصفة واستبدال بنودها كلها في معاملة واحدة؛ لا تلمس أعمدة الملف
create or replace function public.update_prescription(
  p_id          uuid,
  p_entry_date  date,
  p_doctor      text,
  p_patient     text,
  p_patient_id  uuid,
  p_pharmacist  text,
  p_drugs       text[]
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_today  date := (now() at time zone 'Asia/Amman')::date;
  v_row    public.prescriptions%rowtype;
  v_doctor text;
  v_patient text;
  v_pharmacist text;
  v_drugs  text[];
  v_count  integer;
begin
  if public.current_staff_id() is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لتعديل الوصفة' using errcode = 'insufficient_privilege';
  end if;

  -- بلا FOR UPDATE عمداً: مع RLS يُخفي الصف الذي تفشل فيه using الخاصة بـ update بصمت،
  -- فنخسر التفريق بين «غير موجودة» و«غير قابلة للتعديل»
  select * into v_row from public.prescriptions where id = p_id;
  if not found then
    raise exception 'PRESCRIPTION_NOT_FOUND: الوصفة غير موجودة' using errcode = 'no_data_found';
  end if;
  if not public.prescription_is_editable(v_row.pharmacy_id, v_row.recorded_by, v_row.created_at) then
    raise exception 'NOT_EDITABLE: لا يمكن تعديل الوصفة بعد انتهاء يوم تسجيلها، أو لأنها مسجّلة بواسطة موظف آخر'
      using errcode = 'insufficient_privilege';
  end if;

  v_doctor     := public.prescription_clean_name(p_doctor,     'اسم الطبيب',    120);
  v_patient    := public.prescription_clean_name(p_patient,    'اسم المريض',    120);
  v_pharmacist := public.prescription_clean_name(p_pharmacist, 'اسم الصيدلاني', 120);
  v_drugs      := public.prescription_clean_drugs(p_drugs);

  if p_entry_date is not null and (p_entry_date > v_today or p_entry_date < v_today - 7) then
    raise exception 'INVALID_ENTRY_DATE: تاريخ الوصفة يجب ألا يكون مستقبلياً ولا أقدم من 7 أيام' using errcode = 'check_violation';
  end if;

  update public.prescriptions
     set entry_date      = coalesce(p_entry_date, entry_date),  -- null = إبقاء التاريخ الحالي
         doctor_name     = v_doctor,
         patient_name    = v_patient,
         patient_id      = p_patient_id,                          -- null = فكّ الربط بملف مريض
         pharmacist_name = v_pharmacist
   where id = p_id;
  get diagnostics v_count = row_count;
  -- حارس أخير: لو منعت RLS التحديث (سباق مع منتصف الليل مثلاً) لا نمضي بحذف البنود
  if v_count = 0 then
    raise exception 'NOT_EDITABLE: لا يمكن تعديل الوصفة بعد انتهاء يوم تسجيلها، أو لأنها مسجّلة بواسطة موظف آخر'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.prescription_items where prescription_id = p_id;
  insert into public.prescription_items (prescription_id, drug_name, position)
  select p_id, t.d, (t.ord - 1)::int
    from unnest(v_drugs) with ordinality as t(d, ord);
end $$;

-- الصلاحيات: المستدعون المسجّلون فقط (Supabase يمنح anon تنفيذاً افتراضياً فيُسحب صراحةً)
revoke execute on function public.prescription_clean_name(text, text, integer) from public, anon;
revoke execute on function public.prescription_clean_drugs(text[]) from public, anon;
revoke execute on function public.create_prescription(uuid, date, text, text, uuid, text, text[], text, text, integer, text) from public, anon;
revoke execute on function public.update_prescription(uuid, date, text, text, uuid, text, text[]) from public, anon;

grant execute on function public.prescription_clean_name(text, text, integer) to authenticated;
grant execute on function public.prescription_clean_drugs(text[]) to authenticated;
grant execute on function public.create_prescription(uuid, date, text, text, uuid, text, text[], text, text, integer, text) to authenticated;
grant execute on function public.update_prescription(uuid, date, text, text, uuid, text, text[]) to authenticated;

-- ═══ ملاحظات للواجهة (ترتيب العمليات) ═══
-- إنشاء وصفة بملف:
--   ١) id = crypto.randomUUID() في المتصفح.
--   ٢) رفع الملف إلى bucket «prescriptions» بالمسار {pharmacy_id}/{id}.{ext}
--      (ضغط الصور قبل الرفع؛ الحد 2MB؛ PDF لا يُضغط).
--   ٣) rpc('create_prescription', { p_id: id, ..., p_file_path, p_file_name, p_file_size, p_file_mime }).
--      الرفع قبل الاستدعاء لأن file_path يجب أن يطابق المسار، ولا سياسة تشترط وجود الصف عند الرفع.
--   ٤) إن فشل الاستدعاء بعد نجاح الرفع، تحذف الواجهة الكائن اليتيم بنفسها (storage.remove على المسار نفسه):
--      تسمح سياسة الحذف بذلك لأنه لا صف وصفة يشير إليه (الحالة ب).
-- تعديل وصفة: rpc('update_prescription', …) لحقولها وبنودها. الملف يُعدَّل مباشرة من الواجهة:
--   حذف الكائن القديم ← رفع الجديد ← update على أعمدة file_* (لا upsert ولا سياسة update على التخزين).
-- حذف وصفة: حذف الملف من التخزين أولاً (الوصفة قائمة وقابلة للتعديل، الحالة أ)، ثم حذف الصف
--   (البنود تُحذف بالـ cascade). عكس الترتيب يترك كائناً يتيماً يمكن حذفه لاحقاً (الحالة ب).
-- «سُجّلت متأخرة»: entry_date < (created_at at time zone 'Asia/Amman')::date، وتُحسب في الواجهة.
