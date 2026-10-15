-- المورد ووصول الصنف ينتقلان إلى مستوى البند.
-- الطلب يحتفظ بمرحلة واحدة (مسجّل ← طُلب ← وصل ← سُلّم / ملغى)، أما المورد فقد يختلف من صنف لآخر،
-- والأصناف قد تصل متفرقة؛ لذلك لكل بند مورده وعلامة وصوله، وتتبع هجرة 20261015120000 تقاليدها.
--
-- قرارات التصميم:
--  • تغيير المورد وعلامة الوصول يُسجَّلان في الخط الزمني (item_supplier_change / item_arrival_change)
--    بـ triggers القاعدة؛ العميل لا يضبط arrived_at ولا cancelled_at أبداً، تضبطهما القاعدة.
--  • عند انتقال الطلب إلى «وصل» تُعلَّم كل بنوده غير الملغاة وغير الواصلة بأنها وصلت، عبر تحديثات
--    عادية تمر على حارس البنود وتكتب أحداثها بنفسها.
--  • البند الملغى مجمَّد تماماً كما كان. وبعد وصول الطلب لا يُسحب وصول أي بند (ITEM_ARRIVAL_LOCKED).
--  • الترتيب داخل الملف مقصود: نقل البيانات قبل حذف عمود المورد وقبل استبدال الدوال.

-- ═══════════════════════════════════════════════════════════════
-- ١) أعمدة جديدة في patient_request_items
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_items
  add column if not exists supplier   text check (supplier is null or char_length(btrim(supplier)) between 1 and 100),
  add column if not exists arrived    boolean not null default false,
  add column if not exists arrived_at timestamptz;

-- ═══════════════════════════════════════════════════════════════
-- ٢) نقل المورد من الطلب إلى كل بنوده
-- triggers التحديث على البنود تمنع هذا التحديث (حارس التعديل، ومسجّل الأحداث يرفض بلا موظف)،
-- فتُعطَّل لحظة التحديث وحده وتُعاد فوراً. محروس بوجود العمود القديم فلا ينكسر إن أُعيد التشغيل
-- ═══════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patient_requests' and column_name = 'supplier'
  ) then
    alter table public.patient_request_items disable trigger trg_patient_request_items_b_update_guard;
    alter table public.patient_request_items disable trigger trg_patient_request_items_log_update;

    -- قيد البند 1–100 حرفاً بعد القص؛ عمود الطلب القديم كان بلا حد في القاعدة (الواجهة 120)
    update public.patient_request_items i
       set supplier = left(btrim(r.supplier), 100)
      from public.patient_requests r
     where r.id = i.request_id
       and nullif(btrim(r.supplier), '') is not null;

    alter table public.patient_request_items enable trigger trg_patient_request_items_b_update_guard;
    alter table public.patient_request_items enable trigger trg_patient_request_items_log_update;
  end if;
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٣) إزالة المورد من الطلب
-- لا دالة ولا trigger متبقٍ يشير إليه سوى create_patient_request التي تُستبدل في الخطوة ٩
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_requests drop column if exists supplier;

-- ═══════════════════════════════════════════════════════════════
-- ٤) أنواع الأحداث: item_supplier_change و item_arrival_change
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_events drop constraint if exists patient_request_events_kind_check;
alter table public.patient_request_events add constraint patient_request_events_kind_check
  check (kind in ('created','note','stage_change','price_change','deposit_change','deposit_return_change',
                  'message_sent','item_added','item_cancelled','item_supplier_change','item_arrival_change'));

-- تحقّق: لو بقي قيد قديم باسم مختلف لحجب النوعين الجديدين، فنفشل هنا بدل صمت لاحق
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_constraint
  where conrelid = 'public.patient_request_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%''created''%';
  if v_count <> 1 then
    raise exception 'KIND_CHECK_DUPLICATE: وُجد % قيد على kind بدل واحد — راجع اسم القيد القديم', v_count;
  end if;
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٥) حارس الإدراج (يُستبدل)
-- كما كان، مع ضبط الوصول والمورد: البند الجديد لم يصل بعد، والمورد يُقصّ ويصير null إن كان فارغاً
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_request_items_insert_guard()
returns trigger
language plpgsql
security definer
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

  if v_status not in ('recorded','ordered') then
    raise exception 'ITEM_ADD_NOT_ALLOWED: لا يمكن إضافة بند بعد وصول الطلب أو إغلاقه'
      using errcode = 'check_violation';
  end if;

  new.pharmacy_id   := v_pharmacy;
  new.cancelled     := false;
  new.cancel_reason := null;
  new.cancelled_at  := null;
  new.arrived       := false;
  new.arrived_at    := null;
  new.supplier      := nullif(btrim(new.supplier), '');
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٦) حارس التعديل (يُستبدل): ثلاثة تغييرات مسموحة فقط — الإلغاء، المورد، الوصول
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_request_items_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if new.id is distinct from old.id
     or new.pharmacy_id is distinct from old.pharmacy_id
     or new.request_id is distinct from old.request_id
     or new.product_name is distinct from old.product_name
     or new.quantity is distinct from old.quantity
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'ITEM_IMMUTABLE: لا يمكن تعديل اسم الصنف أو كميته، المسموح الإلغاء أو المورد أو الوصول فقط'
      using errcode = 'check_violation';
  end if;

  -- البند الملغى مجمَّد تماماً: لا رجوع عن الإلغاء ولا تغيير مورد أو وصول
  if old.cancelled then
    if new.cancelled is distinct from old.cancelled
       or new.cancel_reason is distinct from old.cancel_reason
       or new.cancelled_at is distinct from old.cancelled_at
       or new.supplier is distinct from old.supplier
       or new.arrived is distinct from old.arrived
       or new.arrived_at is distinct from old.arrived_at then
      raise exception 'ITEM_IMMUTABLE: البند ملغى ولا يمكن تعديله أو التراجع عن إلغائه'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  new.supplier := nullif(btrim(new.supplier), '');

  -- arrived_at لا يُغيَّر إلا بتغيير arrived نفسه، وتضبطه القاعدة
  if new.arrived = old.arrived and new.arrived_at is distinct from old.arrived_at then
    raise exception 'ITEM_IMMUTABLE: وقت الوصول تضبطه المنصة ولا يُعدَّل مباشرة'
      using errcode = 'check_violation';
  end if;

  -- cancel_reason و cancelled_at لا يُضبطان إلا عند الإلغاء نفسه
  if not new.cancelled and (new.cancel_reason is not null or new.cancelled_at is not null) then
    raise exception 'ITEM_IMMUTABLE: سبب الإلغاء ووقته لا يُضبطان إلا عند الإلغاء'
      using errcode = 'check_violation';
  end if;

  -- لا تغيير فعلي في الحقول الثلاثة المسموحة
  if new.cancelled = old.cancelled
     and new.supplier is not distinct from old.supplier
     and new.arrived = old.arrived then
    return new;
  end if;

  select status into v_status from public.patient_requests where id = new.request_id;

  -- (أ) إلغاء
  if new.cancelled then
    -- الإلغاء وحده: لا يقترن بتغيير مورد أو وصول في التحديث نفسه
    if new.supplier is distinct from old.supplier or new.arrived is distinct from old.arrived then
      raise exception 'ITEM_IMMUTABLE: الإلغاء لا يقترن بتغيير المورد أو الوصول'
        using errcode = 'check_violation';
    end if;
    if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
      raise exception 'ITEM_CANCEL_REASON_REQUIRED: اكتب سبب إلغاء البند' using errcode = 'check_violation';
    end if;
    if v_status in ('delivered','cancelled') then
      raise exception 'ITEM_CANCEL_NOT_ALLOWED: لا يمكن إلغاء بند من طلب مسلَّم أو ملغى'
        using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
    return new;
  end if;

  -- (ب) و(ج) مورد أو وصول: لا يجوز على طلب مسلَّم أو ملغى
  if v_status in ('delivered','cancelled') then
    raise exception 'ITEM_CHANGE_NOT_ALLOWED: لا يمكن تعديل المورد أو الوصول بعد تسليم الطلب أو إلغائه'
      using errcode = 'check_violation';
  end if;

  -- (ج) وصول
  if new.arrived is distinct from old.arrived then
    if new.arrived then
      new.arrived_at := now();
    else
      if v_status = 'arrived' then
        raise exception 'ITEM_ARRIVAL_LOCKED: وصل الطلب فلا يمكن سحب وصول صنف منه'
          using errcode = 'check_violation';
      end if;
      new.arrived_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٧) مسجّل أحداث البنود (يُستبدل)
-- item_added و item_cancelled كما كانا، ويُضاف حدث لكل تغيير في المورد أو الوصول؛
-- التحديث الواحد الذي يغيّر أكثر من شيء يكتب حدثاً لكل تغيير.
-- الصيدلية والمرحلة تضبطهما trigger patient_request_events_set_parent من الطلب الأصل
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_request_items_log_events()
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
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.request_id, 'item_added', 'recorded',
            jsonb_build_object('product_name', new.product_name, 'quantity', new.quantity), v_staff);
    return new;
  end if;

  if new.cancelled and not old.cancelled then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.request_id, 'item_cancelled', 'recorded',
            jsonb_build_object('product_name', new.product_name, 'quantity', new.quantity,
                               'reason', new.cancel_reason), v_staff);
  end if;

  if new.supplier is distinct from old.supplier then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.request_id, 'item_supplier_change', 'recorded',
            jsonb_build_object('product_name', new.product_name, 'old', old.supplier, 'new', new.supplier), v_staff);
  end if;

  if new.arrived is distinct from old.arrived then
    insert into public.patient_request_events (pharmacy_id, request_id, kind, stage, details, staff_id)
    values (new.pharmacy_id, new.request_id, 'item_arrival_change', 'recorded',
            jsonb_build_object('product_name', new.product_name, 'arrived', new.arrived), v_staff);
  end if;

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٨) وصول الطلب يُعلّم بنوده
-- عند انتقال الحالة إلى «وصل» تُعلَّم كل البنود غير الملغاة وغير الواصلة بجملة تحديث واحدة. تمر على
-- حارس البنود ومسجّل أحداثها العاديين فيكتب كل بند حدث وصوله بنفسه.
-- الاسم يبدأ بـ z_ ليُنفَّذ بعد trg_patient_requests_log_update فيسبق حدث تغيّر المرحلة أحداث الوصول
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_requests_mark_items_arrived()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'arrived' and old.status is distinct from 'arrived' then
    update public.patient_request_items
       set arrived = true
     where request_id = new.id
       and not cancelled
       and not arrived;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patient_requests_z_mark_items_arrived on public.patient_requests;
create trigger trg_patient_requests_z_mark_items_arrived
  after update on public.patient_requests
  for each row execute function public.patient_requests_mark_items_arrived();

-- ═══════════════════════════════════════════════════════════════
-- ٩) create_patient_request (تُستبدل)
-- بلا p_supplier: المورد صار في البنود، ويحمل كل عنصر في p_items مفتاح "supplier" اختيارياً.
-- security invoker كما كانت: سياسات RLS والـ triggers تسري كأي إدراج مباشر
-- ═══════════════════════════════════════════════════════════════
drop function if exists public.create_patient_request(uuid, jsonb, numeric, numeric, text, text);

create or replace function public.create_patient_request(
  p_patient_id uuid,
  p_items      jsonb,
  p_price      numeric default null,
  p_deposit    numeric default null,
  p_note       text    default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception 'ITEMS_REQUIRED: يلزم بند واحد على الأقل وحتى 30 بنداً في الطلب'
      using errcode = 'check_violation';
  end if;

  insert into public.patient_requests (pharmacy_id, patient_id, price, deposit)
  values (public.current_pharmacy_id(), p_patient_id, p_price, p_deposit)
  returning id into v_request_id;

  insert into public.patient_request_items (request_id, product_name, quantity, supplier)
  select v_request_id,
         btrim(item->>'product_name'),
         coalesce((item->>'quantity')::int, 1),
         nullif(btrim(item->>'supplier'), '')
  from jsonb_array_elements(p_items) as item;

  if nullif(btrim(p_note), '') is not null then
    insert into public.patient_request_events (request_id, kind, body)
    values (v_request_id, 'note', btrim(p_note));
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.create_patient_request(uuid, jsonb, numeric, numeric, text) from public, anon;
grant execute on function public.create_patient_request(uuid, jsonb, numeric, numeric, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ١٠) ترتيب الأحداث والبنود داخل المعاملة الواحدة
-- now() ثابتة طوال المعاملة، فحدث created وأحداث item_added والملاحظة الأولى وأحداث المرحلة والوصول التي
-- تُكتب معاً تتساوى في created_at وتُعرض بترتيب عشوائي. clock_timestamp() يعطي كل صف لحظته الفعلية
-- فيستقيم الترتيب الزمني في الخط الزمني.
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_events alter column created_at set default clock_timestamp();
alter table public.patient_request_items  alter column created_at set default clock_timestamp();
