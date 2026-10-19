-- ملاحظات الكادر على المريض: سجل إضافة فقط، يُغلق ولا يُعدَّل ولا يُحذف.
--
-- قرارات التصميم (نمط patient_request_events):
--  • الصيدلية والكاتب والإغلاق تُضبط بـ triggers من جلسة المستدعي، فلا يزوّرها عميل معدَّل.
--  • الاسم يُخزَّن لقطةً نصية (author_name / closed_by_name) كي يبقى صحيحاً لو عُطِّل الموظف
--    أو غُيّر اسمه، ولأن الملاحظات المنقولة من التسجيل بلا موظف («ملاحظة التسجيل»).
--  • لا تعديل لنص الملاحظة ولا حذف: الإغلاق وحده مسموح، ومرة واحدة (لا إعادة فتح).

-- ═══ ١) الجدول ═══
create table if not exists public.patient_notes (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies(id) on delete cascade,
  patient_id       uuid not null references public.patients(id) on delete cascade,
  body             text not null check (char_length(btrim(body)) between 1 and 1000),
  author_staff_id  uuid references public.pharmacy_staff(id),   -- null للملاحظات المنقولة
  author_name      text not null,
  created_at       timestamptz not null default now(),
  closed_at        timestamptz,
  closed_staff_id  uuid references public.pharmacy_staff(id),
  closed_by_name   text,
  constraint patient_notes_closed_consistent
    check ((closed_at is null and closed_by_name is null and closed_staff_id is null)
        or (closed_at is not null and closed_by_name is not null))
);

create index if not exists idx_patient_notes_ph_patient
  on public.patient_notes (pharmacy_id, patient_id);
-- المفتوحة فقط هي الأكثر قراءةً (اللافتة)
create index if not exists idx_patient_notes_open
  on public.patient_notes (pharmacy_id, patient_id) where closed_at is null;

-- ═══ ٢) نقل ملاحظات التسجيل القديمة ═══
-- قبل إنشاء الـ triggers عمداً: الـ trigger يشترط موظفاً نشطاً والـ migration بلا جلسة موظف.
-- المصدر refill_tracking_pipeline.insurance_status (لا عمود في patients). الصفوف المتكررة
-- لنفس المريض والنص تُدمج. التاريخ = created_at للمريض. النص يُقص عند 1000 احترازاً.
insert into public.patient_notes (pharmacy_id, patient_id, body, author_name, created_at)
select distinct on (r.patient_id, btrim(r.insurance_status))
       p.pharmacy_id, p.id, left(btrim(r.insurance_status), 1000),
       'ملاحظة التسجيل', coalesce(p.created_at, now())
from public.refill_tracking_pipeline r
join public.patients p on p.id = r.patient_id and p.pharmacy_id = r.pharmacy_id
where r.insurance_status is not null and btrim(r.insurance_status) <> ''
  and not exists (select 1 from public.patient_notes);  -- يمنع التكرار عند إعادة التشغيل

-- ═══ ٣) RLS ═══
alter table public.patient_notes enable row level security;

drop policy if exists "patient_notes_select" on public.patient_notes;
create policy "patient_notes_select" on public.patient_notes
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

drop policy if exists "patient_notes_insert" on public.patient_notes;
create policy "patient_notes_insert" on public.patient_notes
  for insert to authenticated
  with check (pharmacy_id = public.current_pharmacy_id()
              and author_staff_id = public.current_staff_id());

-- الإغلاق = update وحيد؛ ما يُسمح بتغييره يضبطه الـ trigger أدناه
drop policy if exists "patient_notes_update" on public.patient_notes;
create policy "patient_notes_update" on public.patient_notes
  for update to authenticated
  using (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

revoke delete, truncate on public.patient_notes from anon, authenticated;

-- ═══ ٤) Triggers ═══
-- (أ) عند الإدراج: الصيدلية من المريض، والكاتب من الجلسة، ولا إدراج مغلقاً
create or replace function public.patient_notes_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pharmacy uuid; v_staff uuid := public.current_staff_id(); v_name text;
begin
  select pharmacy_id into v_pharmacy from public.patients where id = new.patient_id;
  -- رسالة واحدة للمريض غير الموجود والتابع لصيدلية أخرى
  if v_pharmacy is null then
    raise exception 'PATIENT_NOT_FOUND: المريض غير موجود' using errcode = 'foreign_key_violation';
  end if;
  if v_staff is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لكتابة الملاحظة' using errcode = 'insufficient_privilege';
  end if;
  select name into v_name from public.pharmacy_staff where id = v_staff;
  new.pharmacy_id     := v_pharmacy;
  new.author_staff_id := v_staff;
  new.author_name     := coalesce(v_name, 'موظف');
  new.created_at      := now();
  new.closed_at := null; new.closed_staff_id := null; new.closed_by_name := null;
  return new;
end $$;

drop trigger if exists trg_patient_notes_a_insert on public.patient_notes;
create trigger trg_patient_notes_a_insert
  before insert on public.patient_notes
  for each row execute function public.patient_notes_before_insert();

-- (ب) عند التحديث: الإغلاق فقط، مرة واحدة، والغلاف الثابت لا يتغيّر
create or replace function public.patient_notes_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_staff uuid := public.current_staff_id(); v_name text;
begin
  if new.pharmacy_id is distinct from old.pharmacy_id
     or new.patient_id is distinct from old.patient_id
     or new.body is distinct from old.body
     or new.author_staff_id is distinct from old.author_staff_id
     or new.author_name is distinct from old.author_name
     or new.created_at is distinct from old.created_at then
    raise exception 'IMMUTABLE_FIELD: لا يمكن تعديل الملاحظة' using errcode = 'check_violation';
  end if;
  if old.closed_at is not null then
    raise exception 'ALREADY_CLOSED: الملاحظة مغلقة ولا تُعاد فتحها' using errcode = 'check_violation';
  end if;
  if v_staff is null then
    raise exception 'STAFF_REQUIRED: يلزم موظف نشط لإغلاق الملاحظة' using errcode = 'insufficient_privilege';
  end if;
  select name into v_name from public.pharmacy_staff where id = v_staff;
  new.closed_at       := now();
  new.closed_staff_id := v_staff;
  new.closed_by_name  := coalesce(v_name, 'موظف');
  return new;
end $$;

drop trigger if exists trg_patient_notes_b_update on public.patient_notes;
create trigger trg_patient_notes_b_update
  before update on public.patient_notes
  for each row execute function public.patient_notes_before_update();

-- (ج) activity_log: إضافة وإغلاق (نص الملاحظة لا يُسجَّل — بيانات صحية)
create or replace function public.log_patient_note_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_patient text; v_action text; v_staff uuid; v_name text;
begin
  select name into v_patient from public.patients where id = new.patient_id;
  if tg_op = 'INSERT' then
    v_action := 'patient_note_added';  v_staff := new.author_staff_id; v_name := new.author_name;
  else
    v_action := 'patient_note_closed'; v_staff := new.closed_staff_id; v_name := new.closed_by_name;
  end if;
  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values (new.pharmacy_id, v_staff, v_name, v_action, 'patient_note', new.patient_id, v_patient,
          jsonb_build_object('note_id', new.id));
  return new;
end $$;

drop trigger if exists trg_patient_notes_log_insert on public.patient_notes;
create trigger trg_patient_notes_log_insert after insert on public.patient_notes
  for each row execute function public.log_patient_note_activity();
drop trigger if exists trg_patient_notes_log_update on public.patient_notes;
create trigger trg_patient_notes_log_update after update on public.patient_notes
  for each row execute function public.log_patient_note_activity();
