-- تهاني أعياد الميلاد
--
-- الغرض: تمييز من هُنّئ اليوم فلا يُهنَّأ مرتين من موظفين مختلفين،
-- وتوثيق من هنّأ في سجل النشاط عبر تريغر.
--
-- قرار: الكتابة من المتصفح مسموحة هنا — بخلاف activity_log —
-- لأن هذا جدول عمل لا سجل مساءلة. الشرطان في السياسة يمنعان
-- العبث: الصيدلية من current_pharmacy_id()، والموظف من
-- current_staff_id() فلا ينسب تهنئته لزميله.
--
-- قيد unique (patient_id, greeted_on) يمنع التكرار على مستوى
-- القاعدة لا الواجهة.

create table public.birthday_greetings (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  staff_id    uuid references public.pharmacy_staff(id) on delete set null,
  greeted_on  date not null default current_date,
  created_at  timestamptz not null default now(),
  unique (patient_id, greeted_on)
);

create index birthday_greetings_pharmacy_date_idx
  on public.birthday_greetings (pharmacy_id, greeted_on desc);

alter table public.birthday_greetings enable row level security;

-- كل موظفي الصيدلية يقرؤون: الغرض ألا يكرّر الموظف تهنئة زميله
create policy "staff read own pharmacy greetings"
on public.birthday_greetings
for select
to authenticated
using (pharmacy_id = public.current_pharmacy_id());

-- الكتابة من المتصفح مسموحة لكنها مقيّدة: الصيدلية من الدالة لا من
-- الطلب، والموظف يسجّل باسمه هو لا باسم غيره
create policy "staff insert own greeting"
on public.birthday_greetings
for insert
to authenticated
with check (
  pharmacy_id = public.current_pharmacy_id()
  and staff_id = public.current_staff_id()
);

-- التوثيق في سجل النشاط. لا نستدعي current_staff_id() هنا: سياسة
-- الإدراج تضمن أصلاً أن staff_id يساويها، فالحارس في السياسة
create or replace function public.log_birthday_greeting_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_name text;
  v_patient    text;
begin
  if new.staff_id is null then
    return new;
  end if;

  select ps.name into v_staff_name
  from public.pharmacy_staff ps where ps.id = new.staff_id;

  select p.name into v_patient
  from public.patients p where p.id = new.patient_id;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label)
  values
    (new.pharmacy_id, new.staff_id, v_staff_name,
     'birthday_greeting_sent', 'greeting', new.patient_id, v_patient);

  return new;
end;
$$;

create trigger trg_log_birthday_greeting_activity
after insert on public.birthday_greetings
for each row execute function public.log_birthday_greeting_activity();
