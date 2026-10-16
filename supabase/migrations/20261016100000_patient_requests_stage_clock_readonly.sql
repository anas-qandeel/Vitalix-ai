-- ساعة المرحلة على البنود (stage_changed_at) وقفل القراءة فقط لجداول الطلبات.
-- تتبع الهجرة تقاليد آخر هجرات الطلبات، والدالتان المستبدلتان نسختان حرفيتان من آخر نص لهما
-- (الإدراج من 20261015170000، والتعديل من 20261015190000) مع الإضافات المذكورة فقط.
--
-- قرارات التصميم:
--  • stage_changed_at تحمل لحظة دخول البند مرحلته الحالية، وعليها يُحسب تأخر الطلبات. تضبطها القاعدة
--    وحدها: الإدراج والتقدم والإلغاء (من العميل أو المتتابع) والتسليم والاستعادة عند إعادة التفعيل
--    تضبطها على now()، فتبدأ ساعة البند المستعاد من جديد.
--  • التراجع خطوة واحدة تصحيح لضغطة خاطئة لا بداية جديدة: «طُلب ← مسجّل» تعيد وقت إنشاء البند،
--    و«وصل ← طُلب» تعيد وقت الطلب من المورد (ordered_at، وإلا now()).
--  • العميل لا يعدّل الحقل (ITEM_IMMUTABLE)؛ مساران التثبيت والتجميد محميان أصلاً بمقارنة الصف كله.
--  • قفل القراءة فقط (trg_block_read_only الموجود) يُوصَل بجداول الطلبات الأربعة بلا استثناءات: الإرجاع
--    والملاحظات وسجل الرسائل تُحجَب أيضاً، ومعها الصيدليات الموقوفة والمؤرشفة. الاسم trg_z_block_read_only
--    يُرتَّب بعد كل trigger يضبط pharmacy_id (الإدراج في البنود والأحداث لا يرسل pharmacy_id من العميل).
--  • الجزء الأول كله يسبق الثاني: التعبئة بتحديث مباشر ستفشل على صيدلية منتهية لو كان القفل موصولاً.

-- ═══════════════════════════════════════════════════════════════
-- الجزء ١) ساعة المرحلة
-- ═══════════════════════════════════════════════════════════════
alter table public.patient_request_items add column if not exists stage_changed_at timestamptz;

-- triggers المستخدم تُعطَّل لحظة التعبئة: الحارس يرفض تعديل البنود النهائية والطلبات المغلقة،
-- ومسجّل الأحداث يشترط موظفاً. التعبئة تصحيح بيانات لا حدث تشغيلي. تُعاد فور الانتهاء
alter table public.patient_request_items disable trigger user;
update public.patient_request_items
   set stage_changed_at = case stage
         when 'recorded'  then created_at
         when 'ordered'   then coalesce(ordered_at, created_at)
         when 'arrived'   then coalesce(arrived_at, ordered_at, created_at)
         when 'delivered' then coalesce(delivered_at, arrived_at, created_at)
         else coalesce(cancelled_at, created_at) end
 where stage_changed_at is null;
alter table public.patient_request_items enable trigger user;

alter table public.patient_request_items
  alter column stage_changed_at set default clock_timestamp(),
  alter column stage_changed_at set not null;

comment on column public.patient_request_items.stage_changed_at is
  'لحظة دخول البند مرحلته الحالية؛ تضبطها القاعدة وحدها، وعليها يُحسب تأخر الطلبات';

-- ═══════════════════════════════════════════════════════════════
-- حارس إدراج البنود: الساعة تبدأ عند الإنشاء
-- ═══════════════════════════════════════════════════════════════
create or replace function public.patient_request_items_insert_guard()
returns trigger
language plpgsql
security invoker
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
  if v_status <> 'open' then
    raise exception 'REQUEST_CLOSED: الطلب مغلق ولا يمكن إضافة أصناف إليه' using errcode = 'check_violation';
  end if;

  new.pharmacy_id   := v_pharmacy;
  new.stage         := 'recorded';
  new.ordered_at    := null;
  new.arrived_at    := null;
  new.delivered_at  := null;
  new.cancelled_at  := null;
  new.cancel_reason := null;
  new.stage_before_cancel := null;
  new.stage_changed_at := now();   -- ساعة المرحلة تبدأ لحظة الإنشاء (قيمة العميل تُهمَل)
  new.supplier      := nullif(btrim(new.supplier), '');
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- حارس تعديل البنود: حماية الحقل وضبطه عند كل انتقال
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

  -- stage_changed_at (ساعة المرحلة) تضبطها المنصة وحدها
  if not v_system and new.stage_changed_at is distinct from old.stage_changed_at then
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
    new.stage_changed_at := now();   -- إعادة التفعيل تُعيد تشغيل ساعة البند المستعاد
    return new;
  end if;

  -- تثبيت إلغاء بند ألغاه إلغاء الطلب (بيد النظام عند إعادة التفعيل لبند لم يُختر): يبقى ملغى
  -- ويصير كالملغى فرادى بمسح stage_before_cancel وتبديل سبب الإلغاء بسبب غير فارغ، بلا أي تغيير آخر في الصف
  if old.stage = 'cancelled' and v_system and new.stage = 'cancelled'
     and old.stage_before_cancel is not null and new.stage_before_cancel is null
     and char_length(btrim(coalesce(new.cancel_reason, ''))) > 0
     and (to_jsonb(new) - 'stage_before_cancel' - 'cancel_reason') = (to_jsonb(old) - 'stage_before_cancel' - 'cancel_reason') then
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
  new.stage_changed_at := old.stage_changed_at;

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
    new.stage_changed_at := now();
    return new;
  end if;

  if new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'ITEM_IMMUTABLE: سبب الإلغاء لا يُضبط إلا عند الإلغاء' using errcode = 'check_violation';
  end if;

  if old.stage = 'recorded' and new.stage = 'ordered' then
    new.ordered_at := now();
    new.stage_changed_at := now();
  elsif old.stage = 'ordered' and new.stage = 'arrived' then
    new.arrived_at := now();
    new.stage_changed_at := now();
  elsif old.stage = 'ordered' and new.stage = 'recorded' then
    new.ordered_at := null;
    new.stage_changed_at := old.created_at;   -- تراجع = تصحيح ضغطة خاطئة: لا تبدأ الساعة من جديد
  elsif old.stage = 'arrived' and new.stage = 'ordered' then
    new.arrived_at := null;
    new.stage_changed_at := coalesce(old.ordered_at, now());   -- يعود إلى وقت مرحلة «طُلب»
  elsif old.stage = 'arrived' and new.stage = 'delivered' and v_system then
    new.delivered_at := now();
    new.stage_changed_at := now();
  else
    raise exception 'ITEM_STAGE_NOT_ALLOWED: هذا الانتقال بين المراحل غير مسموح' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- الجزء ٢) قفل القراءة فقط (يُنشأ أخيراً)
-- ═══════════════════════════════════════════════════════════════
drop trigger if exists trg_z_block_read_only on public.patient_requests;
create trigger trg_z_block_read_only
  before insert or update or delete on public.patient_requests
  for each row execute function public.block_write_when_not_writable();

drop trigger if exists trg_z_block_read_only on public.patient_request_items;
create trigger trg_z_block_read_only
  before insert or update or delete on public.patient_request_items
  for each row execute function public.block_write_when_not_writable();

drop trigger if exists trg_z_block_read_only on public.patient_request_payments;
create trigger trg_z_block_read_only
  before insert or update or delete on public.patient_request_payments
  for each row execute function public.block_write_when_not_writable();

drop trigger if exists trg_z_block_read_only on public.patient_request_events;
create trigger trg_z_block_read_only
  before insert or update or delete on public.patient_request_events
  for each row execute function public.block_write_when_not_writable();
