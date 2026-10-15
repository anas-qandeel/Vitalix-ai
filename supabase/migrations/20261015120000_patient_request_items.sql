-- بنود الطلب: الطلب الواحد يحمل عدة أصناف.
-- يبقى على patient_requests كل ما هو للطلب كله: السعر الإجمالي والعربون وإرجاعه والحالة والمورد
-- والخط الزمني. وتنتقل أسطر المنتجات (الاسم والكمية) إلى patient_request_items.
-- تتبع الهجرة تقاليد 20261015100000_patient_requests.sql: RLS بالصيدلية عبر current_pharmacy_id()،
-- والموظف عبر current_staff_id()، وأحداث الخط الزمني تكتبها triggers بصلاحية الدالة (security definer).
--
-- قرارات التصميم:
--  • البند لا يُحذف ولا يُعدَّل: الإلغاء هو التغيير الوحيد المسموح (مع سبب)، فيبقى أثر كل بند
--    في الخط الزمني. القيود في triggers القاعدة لا في الواجهة.
--  • إضافة بند مسموحة قبل وصول الطلب فقط (مسجّل/طُلب من المورد)؛ إلغاء بند مسموح ما دام الطلب
--    غير نهائي (غير مسلَّم وغير ملغى).
--  • الترتيب داخل الملف مقصود: نقل البيانات يجري قبل إنشاء أي trigger على الجدول الجديد حتى
--    لا تُكتب أحداث item_added للطلبات القديمة.

-- ═══════════════════════════════════════════════════════════════
-- ١) patient_request_items
-- ═══════════════════════════════════════════════════════════════
create table if not exists public.patient_request_items (
  id            uuid primary key default gen_random_uuid(),
  pharmacy_id   uuid not null references public.pharmacies(id) on delete cascade,
  request_id    uuid not null references public.patient_requests(id) on delete cascade,
  product_name  text not null check (char_length(btrim(product_name)) between 1 and 200),
  quantity      integer not null default 1 check (quantity > 0),
  cancelled     boolean not null default false,
  cancel_reason text,
  cancelled_at  timestamptz,
  -- بلا on delete set null لأن العمود not null؛ الموظف يُعطَّل ولا يُحذف (كما في patient_requests)
  created_by    uuid not null default public.current_staff_id() references public.pharmacy_staff(id),
  created_at    timestamptz not null default now(),
  constraint patient_request_items_cancel_needs_reason
    check (cancelled = false or char_length(btrim(coalesce(cancel_reason, ''))) > 0)
);

create index if not exists idx_patient_request_items_req on public.patient_request_items (request_id);
create index if not exists idx_patient_request_items_ph_created on public.patient_request_items (pharmacy_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- ٢) نقل البيانات: بند واحد لكل طلب قائم (قبل أي trigger على الجدول الجديد)
-- محروس بوجود العمود القديم فلا ينكسر إن أُعيد التشغيل بعد حذفه
-- ═══════════════════════════════════════════════════════════════
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'patient_requests' and column_name = 'product_name'
  ) then
    insert into public.patient_request_items (pharmacy_id, request_id, product_name, quantity, created_by, created_at)
    select r.pharmacy_id, r.id, r.product_name, r.quantity, r.created_by, r.created_at
    from public.patient_requests r
    where not exists (select 1 from public.patient_request_items i where i.request_id = r.id);
  end if;
end
$$;

-- ═══════════════════════════════════════════════════════════════
-- ٣) إزالة أعمدة المنتج من الطلب
-- قيود check المعرَّفة على العمود نفسه (اسم المنتج والكمية) تسقط معه تلقائياً
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_requests
  drop column if exists product_name,
  drop column if exists quantity;

comment on column public.patient_requests.price is 'السعر الإجمالي للطلب كله (مجموع كل البنود)، لا سعر بند واحد';

-- ═══════════════════════════════════════════════════════════════
-- ٤) أنواع الأحداث: إضافة item_added و item_cancelled
-- القيد معرَّف على العمود في الهجرة الأولى فاسمه الافتراضي في Postgres هو
-- <table>_<column>_check = patient_request_events_kind_check
-- سياسة إدراج العميل تبقى كما هي (note و message_sent فقط): أحداث البنود يكتبها trigger
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_events drop constraint if exists patient_request_events_kind_check;
alter table public.patient_request_events add constraint patient_request_events_kind_check
  check (kind in ('created','note','stage_change','price_change','deposit_change','deposit_return_change',
                  'message_sent','item_added','item_cancelled'));

-- تحقّق: لو كان الاسم الفعلي مختلفاً لبقي قيد قديم يحجب النوعين الجديدين، فنفشل هنا بدل صمت لاحق
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
-- ٥) RLS
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_items enable row level security;

drop policy if exists "patient_request_items_select" on public.patient_request_items;
create policy "patient_request_items_select" on public.patient_request_items
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

-- الصيدلية تُضبط من الطلب الأصل في trigger قبل فحص هذه السياسة، فطلب صيدلية أخرى يسقط هنا
drop policy if exists "patient_request_items_insert" on public.patient_request_items;
create policy "patient_request_items_insert" on public.patient_request_items
  for insert to authenticated
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and created_by = public.current_staff_id()
  );

-- التعديل المسموح فعلياً هو الإلغاء وحده، وتفرضه triggers القاعدة
drop policy if exists "patient_request_items_update" on public.patient_request_items;
create policy "patient_request_items_update" on public.patient_request_items
  for update to authenticated
  using (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- لا سياسة حذف؛ الإلغاء حالة لا محو. truncate أيضاً لأنه يتجاوز RLS
revoke delete, truncate on public.patient_request_items from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٦) Triggers
-- أسماء BEFORE: a_insert_guard للإدراج و b_update_guard للتعديل (حدثان مختلفان فلا تعارض)،
-- وأحداث الخط الزمني AFTER بعدها
-- ═══════════════════════════════════════════════════════════════

-- أ) حارس الإدراج
-- security definer: يقرأ الطلب الأصل أياً كانت RLS؛ الصيدلية منه لا من العميل
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
  return new;
end;
$$;

drop trigger if exists trg_patient_request_items_a_insert_guard on public.patient_request_items;
create trigger trg_patient_request_items_a_insert_guard
  before insert on public.patient_request_items
  for each row execute function public.patient_request_items_insert_guard();

-- ب) حارس التعديل: الإلغاء هو التغيير الوحيد المسموح
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
    raise exception 'ITEM_IMMUTABLE: لا يمكن تعديل بيانات البند، الإلغاء فقط'
      using errcode = 'check_violation';
  end if;

  -- البند الملغى نهائي: لا رجوع عن الإلغاء ولا تعديل لسببه أو وقته
  if old.cancelled then
    if new.cancelled is distinct from old.cancelled
       or new.cancel_reason is distinct from old.cancel_reason
       or new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'ITEM_IMMUTABLE: البند ملغى ولا يمكن تعديله أو التراجع عن إلغائه'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- تحديث بلا إلغاء: لا يجوز المساس بحقلي الإلغاء
  if not new.cancelled then
    if new.cancel_reason is not null or new.cancelled_at is not null then
      raise exception 'ITEM_IMMUTABLE: سبب الإلغاء ووقته لا يُضبطان إلا عند الإلغاء'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- هنا إلغاء فعلي
  if char_length(btrim(coalesce(new.cancel_reason, ''))) = 0 then
    raise exception 'ITEM_CANCEL_REASON_REQUIRED: اكتب سبب إلغاء البند' using errcode = 'check_violation';
  end if;

  select status into v_status from public.patient_requests where id = new.request_id;
  if v_status in ('delivered','cancelled') then
    raise exception 'ITEM_CANCEL_NOT_ALLOWED: لا يمكن إلغاء بند من طلب مسلَّم أو ملغى'
      using errcode = 'check_violation';
  end if;

  new.cancelled_at := now();
  return new;
end;
$$;

drop trigger if exists trg_patient_request_items_b_update_guard on public.patient_request_items;
create trigger trg_patient_request_items_b_update_guard
  before update on public.patient_request_items
  for each row execute function public.patient_request_items_update_guard();

-- ج) أحداث الخط الزمني
-- security definer ببحث مسار ثابت: سياسة إدراج الأحداث تحجب أنواع النظام عن العميل.
-- الصيدلية والمرحلة تضبطهما trigger patient_request_events_set_parent من الطلب الأصل.
-- بلا هوية موظف نرفض بدل تسجيل حدث بلا فاعل
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

  return new;
end;
$$;

drop trigger if exists trg_patient_request_items_log_insert on public.patient_request_items;
create trigger trg_patient_request_items_log_insert
  after insert on public.patient_request_items
  for each row execute function public.patient_request_items_log_events();

drop trigger if exists trg_patient_request_items_log_update on public.patient_request_items;
create trigger trg_patient_request_items_log_update
  after update on public.patient_request_items
  for each row execute function public.patient_request_items_log_events();

-- ═══════════════════════════════════════════════════════════════
-- ٧) إنشاء الطلب ذرّياً
-- ثلاث كتابات متتابعة من المتصفح (الطلب ثم البنود ثم الملاحظة) قد ينقطع الاتصال بينها فيبقى طلب بلا بنود.
-- هذه الدالة تنفّذها كلها في معاملة واحدة: إما أن يُحفظ الطلب مع بنوده وملاحظته أو لا يُحفظ شيء.
-- security invoker عمداً: تعمل بصلاحيات المستدعي، فتسري سياسات RLS والـ triggers كما لو أُدرجت الصفوف مباشرة
-- (الصيدلية والمرحلة والموظف تضبطها القاعدة، لا الدالة ولا العميل)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.create_patient_request(
  p_patient_id uuid,
  p_items      jsonb,
  p_price      numeric default null,
  p_deposit    numeric default null,
  p_supplier   text    default null,
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

  insert into public.patient_requests (pharmacy_id, patient_id, price, deposit, supplier)
  values (public.current_pharmacy_id(), p_patient_id, p_price, p_deposit, nullif(btrim(p_supplier), ''))
  returning id into v_request_id;

  insert into public.patient_request_items (request_id, product_name, quantity)
  select v_request_id,
         btrim(item->>'product_name'),
         coalesce((item->>'quantity')::int, 1)
  from jsonb_array_elements(p_items) as item;

  if nullif(btrim(p_note), '') is not null then
    insert into public.patient_request_events (request_id, kind, body)
    values (v_request_id, 'note', btrim(p_note));
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.create_patient_request(uuid, jsonb, numeric, numeric, text, text) from public, anon;
grant execute on function public.create_patient_request(uuid, jsonb, numeric, numeric, text, text) to authenticated;
