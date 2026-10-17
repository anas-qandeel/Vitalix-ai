-- الأصناف كثيرة الطلب: عدّ حتمي (بلا ذكاء اصطناعي) لما يطلبه المرضى مراراً، كنصيحة مخزون للصيدلاني وحده.
-- يخدم شيئين من استدعاء واحد: (أ) اقتراح أسماء سبق طلبها أثناء الكتابة وتلميح «طُلب N مرات…»،
-- و(ب) قسم «أصناف يُنصح بتوفيرها» في شاشة الطلبات.
--
-- قرارات التصميم:
--  • التجميع في القاعدة لا في المتصفح: PostgREST يقطع الاستجابة صامتاً عند حد الصفوف (1000 افتراضياً)،
--    فالتجميع في العميل كان سيعطي أرقاماً ناقصة دون أي إشارة. دالة واحدة تُعيد حتى 300 سطراً مجمّعاً.
--  • الدالة security invoker: تعمل بصلاحيات المستدعي فتسري سياسات RLS كما لو قرأ الجداول مباشرة،
--    ونُضيف شرط الصيدلية صراحة كي يُستعمل الفهرس (pharmacy_id, created_at) ولا يعتمد الأمان على RLS وحدها.
--  • القراءة فقط (stable): لا تكتب شيئاً، فلا يحجبها قفل الاشتراك للقراءة فقط (trg_z_block_read_only
--    مربوط بأحداث الكتابة وحدها).
--  • العدّ بعدد الطلبات المختلفة لا بالكمية ولا بعدد الأسطر: صنف مكرر داخل طلب واحد يُحسب مرة.
--  • البنود الملغاة وبنود الطلبات الملغاة تُحسب: المريض طلب الصنف فعلاً، والإلغاء لا يمحو الطلب عليه.
--  • الوقت بالأيام التقويمية بتوقيت عمّان: اليوم + (p_window_days − 1) يوماً قبله، والقاعدة نفسها للسجل.
--  • العتبة (≥ 3 طلبات) لا تُكتب هنا: يطبّقها العميل، وثوابت النافذة تصل معاملات، فلا نسخة ثانية تنجرف.
--  • لا مطابقة تقريبية: «Panadol» و«Panadol 500mg» صنفان مختلفان.
--  • normalize_ar لا تُمسّ (يعتمد عليها patients.name_normalized وجدول المنع)؛ نبني فوقها دالة خاصة بالمنتجات.

-- ═══════════════════════════════════════════════════════════════
-- ١) normalize_product_name — مفتاح مطابقة اسم الصنف
-- الخطوات بهذا الترتيب بالضبط، ويجب أن تطابقها نسخة TypeScript (normalizeProductName) خطوة بخطوة:
--   1. normalize_ar(s): btrim، طيّ الهمزات (أإآٱٲٳٵ→ا و ءؤئ→ء)، ة→ه، ىی→ي، حذف التشكيل
--      (U+064B–U+065F وU+0670)، ثم lower.
--   2. حذف التطويل ـ (U+0640).
--   3. الأرقام الهندية ٠١٢٣٤٥٦٧٨٩ (U+0660–0669) والفارسية ۰۱۲۳۴۵۶۷۸۹ (U+06F0–06F9) → 0-9.
--   4. الشرطة - والنقطة . والشرطة السفلية _ → مسافة.
--   5. كل تتابع مسافات بيضاء ← مسافة واحدة، والمجموعة هي نفسها \s في JavaScript تماماً:
--      [\t\n\v\f\r ] + U+00A0 + U+1680 + U+2000–U+200A + U+2028 + U+2029 + U+202F + U+205F + U+3000 + U+FEFF.
--      المجموعة مكتوبة صراحة ولم نستعمل \s لأن معنى \s في Postgres يتبع لغة قاعدة البيانات لا Unicode.
--   6. btrim (مسافة عادية فقط، وبعد الخطوة 5 لا يبقى غيرها).
-- ملاحظة: lower في القاعدة تتبع ترميز/لغة القاعدة، وهي مطابقة لـ toLowerCase في JS لأسماء لاتينية وعربية؛
-- اختلافها محتمل في حروف لاتينية مشكّلة نادرة فقط، ويُغطّى باختبار مطابقة قبل الإطلاق.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.normalize_product_name(s text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select btrim(
    regexp_replace(
      translate(
        translate(
          replace(public.normalize_ar(s), 'ـ', ''),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        ),
        '-._',
        '   '
      ),
      '[\t\n\v\f\r \u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+',
      ' ',
      'g'
    )
  );
$$;

comment on function public.normalize_product_name(text) is
  'مفتاح مطابقة اسم صنف الطلب: normalize_ar ثم حذف التطويل وتوحيد الأرقام وتحويل - . _ إلى مسافة وطيّ المسافات. تطابقها normalizeProductName في src/lib/frequent-products.ts.';

-- ═══════════════════════════════════════════════════════════════
-- ٢) request_product_stats — إحصاءات الأصناف المطلوبة للصيدلية الحالية
-- ═══════════════════════════════════════════════════════════════
create or replace function public.request_product_stats(
  p_window_days  int,
  p_history_days int
) returns table (
  name_key             text,
  display_name         text,
  requests_in_window   int,
  patients_in_window   int,
  last_requested_at    timestamptz,
  requests_in_history  int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_today          date;
  v_window_start   timestamptz;
  v_history_start  timestamptz;
begin
  if p_window_days is null or p_history_days is null
     or p_window_days  not between 1 and 3650
     or p_history_days not between 1 and 3650
     or p_window_days > p_history_days then
    raise exception 'PARAM_INVALID: نافذة العدّ والسجل يجب أن تكونا بين 1 و3650 يوماً، ولا تتجاوز النافذة السجل'
      using errcode = 'invalid_parameter_value';
  end if;

  -- بداية اليوم بتوقيت عمّان؛ النافذة تشمل اليوم الحالي و(p_window_days − 1) يوماً قبله
  v_today         := (now() at time zone 'Asia/Amman')::date;
  v_window_start  := (v_today - (p_window_days  - 1))::timestamp at time zone 'Asia/Amman';
  v_history_start := (v_today - (p_history_days - 1))::timestamp at time zone 'Asia/Amman';

  return query
  select g.name_key, g.display_name, g.requests_in_window, g.patients_in_window,
         g.last_requested_at, g.requests_in_history
  from (
    select
      b.k as name_key,
      -- أحدث كتابة للاسم كما أدخلها الموظف؛ الاسم الخام ثانياً لحسم التعادل النادر في الوقت
      (array_agg(b.raw order by b.created_at desc, b.raw))[1] as display_name,
      (count(distinct b.request_id) filter (where b.created_at >= v_window_start))::int as requests_in_window,
      (count(distinct b.patient_id) filter (where b.created_at >= v_window_start))::int as patients_in_window,
      max(b.created_at) as last_requested_at,
      (count(distinct b.request_id))::int as requests_in_history
    from (
      select public.normalize_product_name(i.product_name) as k,
             i.product_name as raw,
             i.request_id,
             r.patient_id,
             i.created_at
      from public.patient_request_items i
      join public.patient_requests r on r.id = i.request_id
      where i.pharmacy_id = public.current_pharmacy_id()
        and i.created_at >= v_history_start
    ) b
    where b.k <> ''
    group by b.k
  ) g
  order by g.requests_in_window desc, g.last_requested_at desc
  limit 300;
end;
$$;

comment on function public.request_product_stats(int, int) is
  'عدّ الأصناف المطلوبة للصيدلية الحالية بحسب اسم مطبَّع: طلبات ومرضى مختلفون داخل النافذة، وآخر طلب، وعدد الطلبات في السجل. تشمل الملغاة. حتى 300 سطر.';

revoke execute on function public.request_product_stats(int, int) from public, anon;
grant  execute on function public.request_product_stats(int, int) to authenticated;
