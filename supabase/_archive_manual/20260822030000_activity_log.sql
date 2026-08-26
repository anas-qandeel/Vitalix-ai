-- سجل نشاط الصيدلية — يراه المالك وحده
--
-- الغرض: توثيق من فعل ماذا داخل الصيدلية (أدوية، مرضى، زيارات).
-- منفصل عن admin_audit_log المخصّص لعمليات مشرف المنصة.
--
-- قرار: لا سياسة INSERT إطلاقاً. الكتابة عبر التريغر وحده
-- (SECURITY DEFINER يتجاوز RLS)، فلا يستطيع موظف تلفيق سجل
-- ولا حذفه.
--
-- قرار: حين تتعذّر هوية الموظف (كتابة عبر supabaseAdmin أو مسار
-- خادم) لا نسجّل شيئاً بدل «مجهول» — سجل ناقص وواضح أفضل من
-- سجل يوهم بالاكتمال.
--
-- المالك يُسجَّل مثل الموظفين: له صف في pharmacy_staff، والتريغر
-- يبحث بـuser_id لا بالدور.

-- ═══════════════════════════════════════════════════════════════
-- ١) هوية الموظف الحالي
-- ═══════════════════════════════════════════════════════════════

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ps.id
  from public.pharmacy_staff ps
  where ps.user_id = auth.uid()
    and ps.is_active = true
    and ps.pharmacy_id = nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid
  limit 1;
$$;

revoke all on function public.current_staff_id() from public;
grant execute on function public.current_staff_id() to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٢) الجدول
-- ═══════════════════════════════════════════════════════════════

create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  staff_id    uuid references public.pharmacy_staff(id) on delete set null,
  staff_name  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  entity_label text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index activity_log_pharmacy_created_idx
  on public.activity_log (pharmacy_id, created_at desc);

alter table public.activity_log enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- ٣) القراءة للمالك وحده — ولا سياسة كتابة إطلاقاً
-- ═══════════════════════════════════════════════════════════════

create policy "owner reads own pharmacy activity"
on public.activity_log
for select
to authenticated
using (
  pharmacy_id = public.current_pharmacy_id()
  and public.current_role_name() = 'owner'
);

-- ═══════════════════════════════════════════════════════════════
-- ٤) تريغر الأدوية
-- ═══════════════════════════════════════════════════════════════

create or replace function public.log_medication_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_patient    text;
  v_action     text;
  v_med        text;
  v_entity     uuid;
begin
  v_staff_id := public.current_staff_id();

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  -- بلا هوية موظف لا نسجّل: الكتابة أتت من supabaseAdmin أو من مسار خادم،
  -- وسجل يقول «مجهول» يعطي ثقة كاذبة
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'medication_added';
    v_med    := new.medication_name;
    v_entity := new.id;
  elsif TG_OP = 'UPDATE' then
    -- الحذف عندك تعطيل لا محو: status ينتقل إلى deleted
    if old.status is distinct from new.status and new.status = 'deleted' then
      v_action := 'medication_deleted';
    else
      v_action := 'medication_updated';
    end if;
    v_med    := new.medication_name;
    v_entity := new.id;
  else
    v_action := 'medication_deleted';
    v_med    := old.medication_name;
    v_entity := old.id;
  end if;

  select p.name into v_patient
  from public.patients p
  where p.id = coalesce(new.patient_id, old.patient_id);

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, 'medication', v_entity, v_med,
     jsonb_build_object('patient_name', v_patient,
                        'patient_id', coalesce(new.patient_id, old.patient_id)));

  return coalesce(new, old);
end;
$$;

create trigger trg_log_medication_activity
after insert or update or delete on public.chronic_medications
for each row execute function public.log_medication_activity();

-- ═══════════════════════════════════════════════════════════════
-- ٥) تريغر المرضى
-- ═══════════════════════════════════════════════════════════════

create or replace function public.log_patient_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_action     text;
begin
  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  if TG_OP = 'INSERT' then
    v_action := 'patient_added';
  elsif TG_OP = 'UPDATE' then
    v_action := 'patient_updated';
  else
    v_action := 'patient_deleted';
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, 'patient',
     coalesce(new.id, old.id), coalesce(new.name, old.name));

  return coalesce(new, old);
end;
$$;

create trigger trg_log_patient_activity
after insert or update or delete on public.patients
for each row execute function public.log_patient_activity();

-- ═══════════════════════════════════════════════════════════════
-- ٦) تريغر الكتالوج والمكملات — جدولان بدالة واحدة
-- ═══════════════════════════════════════════════════════════════

create or replace function public.log_catalog_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_action     text;
  v_label      text;
  v_kind       text;
  v_category   text;
begin
  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  -- الجدولان متوازيان ويختلفان في اسم عمود الصنف فقط
  if TG_TABLE_NAME = 'pharmacy_catalog' then
    v_kind  := 'catalog';
    v_label := coalesce(new.brand_name, old.brand_name);
  else
    v_kind  := 'recommendation';
    v_label := coalesce(new.product_name, old.product_name);
  end if;

  v_category := coalesce(new.category, old.category);

  if TG_OP = 'INSERT' then
    v_action := v_kind || '_added';
  elsif TG_OP = 'UPDATE' then
    -- الإخفاء عبر is_active يُسجَّل حذفاً لا تعديلاً
    if old.is_active is distinct from new.is_active and new.is_active = false then
      v_action := v_kind || '_deactivated';
    else
      v_action := v_kind || '_updated';
    end if;
  else
    v_action := v_kind || '_deleted';
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, v_kind,
     coalesce(new.id, old.id), v_label,
     jsonb_build_object('category', v_category));

  return coalesce(new, old);
end;
$$;

create trigger trg_log_catalog_activity
after insert or update or delete on public.pharmacy_catalog
for each row execute function public.log_catalog_activity();

create trigger trg_log_recommendation_activity
after insert or update or delete on public.pharmacy_recommendations
for each row execute function public.log_catalog_activity();

-- ═══════════════════════════════════════════════════════════════
-- ٧) تريغر تذكير التجديد
--
-- يُسجَّل عند انتقال pipeline_stage إلى messaged، وهو ما يحدث حين
-- يؤكّد الصيدلاني الإرسال بنفسه — فالسجل يوثّق إقراره لا ضغطة زر.
-- أما فتح الرسالة وإنكار الإرسال فلا يمسّان القاعدة، ويُسجَّلان
-- عبر /api/activity/log
-- ═══════════════════════════════════════════════════════════════

create or replace function public.log_reminder_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_patient    text;
begin
  -- التذكير وحده يُسجَّل، وعند الانتقال الفعلي إلى messaged لا في كل تحديث
  if new.pipeline_stage is distinct from 'messaged' then
    return new;
  end if;
  if TG_OP = 'UPDATE' and old.pipeline_stage = 'messaged' then
    return new;
  end if;

  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return new;
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  select p.name into v_patient
  from public.patients p where p.id = new.patient_id;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label)
  values
    (coalesce(v_pharmacy, new.pharmacy_id), v_staff_id, v_staff_name,
     'reminder_sent', 'reminder', new.patient_id, v_patient);

  return new;
end;
$$;

create trigger trg_log_reminder_activity
after insert or update on public.refill_tracking_pipeline
for each row execute function public.log_reminder_activity();