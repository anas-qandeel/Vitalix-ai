-- إحصائيات طلبات المرضى على مستوى الصيدلية (لا أرقام لكل موظف): إجماليات، ومدد، وجدول موردين.
-- تخدم تبويب «الإحصائيات» في شاشة الطلبات بدالتين للقراءة فقط.
--
-- قرارات التصميم:
--  • الحساب في القاعدة لا في المتصفح: PostgREST يقطع الاستجابة صامتاً عند حد الصفوف (1000 افتراضياً)،
--    فالتجميع في العميل كان سيعطي أرقاماً ناقصة دون أي إشارة. الدالتان تُعيدان صفاً واحداً وحتى 50 صفاً.
--  • الدوال security invoker و stable: تعمل بصلاحيات المستدعي فتسري سياسات RLS، ونُضيف شرط الصيدلية
--    صراحة (pharmacy_id = current_pharmacy_id()) كي لا يعتمد الأمان على RLS وحدها. لا تكتب شيئاً،
--    فلا يحجبها قفل الاشتراك للقراءة فقط (trg_z_block_read_only مربوط بأحداث الكتابة وحدها).
--  • الفترة بالأيام التقويمية بتوقيت عمّان: اليوم + (p_days − 1) يوماً قبله، وتنتهي عند بداية الغد.
--  • الإجماليات «فوج» (cohort): الطلبات التي أُنشئت في الفترة بحالتها الحالية، فمجموع المفتوح والمسلَّم
--    والملغى يساوي الإجمالي. الملغى بعربون لم يُرجَع (cancelled_pending_refund) جزء من الملغى لا من المفتوح.
--  • المدد تُنسب إلى فترة حدثها النهائي: الصنف الذي وصل في الفترة يدخل «طُلب ← وصل» ولو طُلب قبلها.
--    أزمنة الأحداث المحفوظة هي ordered_at/arrived_at/delivered_at لا stage_changed_at (الأخيرة تتحرك مع
--    التراجع والاستعادة فتصلح لحساب التأخر لا للإحصاء). المدة سالبة بسبب فرق الساعات تُقصّ إلى صفر.
--  • المدد بالثواني الفعلية المنقضية (وسيط ومتوسط): الوسيط هو «المعتاد» ولا يتأثر بطلب نُسي أسابيع.
--  • الأصناف الملغاة تُحسب بدقة: الملغى فرادى (stage = 'cancelled' و stage_before_cancel فارغ) وحده في البسط
--    والمقام؛ الملغى بإلغاء الطلب كله يُستبعد منهما لأنه ظاهر أصلاً في الطلبات الملغاة.
--  • جدول الموردين فوجه الأصناف التي طُلبت من المورد داخل الفترة (ordered_at). نسبة الالتزام بالموعد تعتمد
--    قاعدة الوصول المتوقع نفسها في request-overdue.ts (أيام العمل: الجمعة ليست يوم عمل) ويقاس عليها الصنف
--    الواصل بيوم وصوله بتوقيت عمّان (الوصول المبكر في الموعد). الصنف المتأخر = وصل بعد اليوم المتوقع، أو ما زال
--    «طُلب» وقد مضى اليوم المتوقع. يُستبعد الملغى بلا وصول ومن لم يحن موعده بعد.
--  • ثوابت القاعدة (11:00 ويوم عطلة المستودع) تصل معاملات من request-overdue.ts، فلا نسخة ثانية تنجرف؛
--    والخوارزمية المكررة (نحو ست أسطر) يغطيها scripts/dev-seed/expected-arrival-parity.sql.
--  • المورد نص حر: يُجمَّع بـ normalize_product_name (فروق الإملاء فقط، بلا مطابقة تقريبية)، والعرض بأحدث
--    كتابة للاسم؛ بلا مورد صف واحد «بدون مورد محدد» يأتي آخراً بلا نسبة التزام.

-- ═══════════════════════════════════════════════════════════════
-- ١) request_expected_arrival_day — يوم الوصول المتوقع لصنف «طُلب»
-- يطابق getExpectedArrival في src/lib/request-overdue.ts خطوة بخطوة:
--   1. وقت الطلب بتوقيت عمّان: اليوم والدقائق منذ منتصف الليل (الثواني تُهمَل).
--   2. إن كان اليوم هو يوم العطلة (p_weekend_dow بترقيم extract(dow): الأحد 0 ... الجمعة 5) ← أول يوم عمل بعده.
--   3. وإلا إن كانت الدقائق <= p_same_day_until (660 = 11:00 شاملةً) ← اليوم نفسه.
--   4. وإلا ← أول يوم عمل بعده.
--   أول يوم عمل بعد يوم d: d + 1، فإن صادف d + 1 يوم العطلة فـ d + 2.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.request_expected_arrival_day(
  p_ordered_at     timestamptz,
  p_same_day_until int,
  p_weekend_dow    int
) returns date
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
           when extract(dow from x.d)::int = p_weekend_dow then x.next_day
           when (extract(hour from x.l)::int * 60 + extract(minute from x.l)::int) <= p_same_day_until then x.d
           else x.next_day
         end
  from (
    select y.l,
           y.l::date as d,
           y.l::date + 1 + (case when extract(dow from y.l::date + 1)::int = p_weekend_dow then 1 else 0 end) as next_day
    from (select p_ordered_at at time zone 'Asia/Amman' as l) y
  ) x;
$$;

comment on function public.request_expected_arrival_day(timestamptz, int, int) is
  'يوم الوصول المتوقع (تاريخ عمّان) لصنف طُلب من المورد في اللحظة المعطاة. تطابق getExpectedArrival في src/lib/request-overdue.ts.';

-- ═══════════════════════════════════════════════════════════════
-- ٢) request_stats_summary — إجماليات ومدد الفترة
-- ═══════════════════════════════════════════════════════════════
create or replace function public.request_stats_summary(p_days int)
returns table (
  requests_total                  int,
  requests_delivered              int,
  requests_open                   int,
  requests_cancelled              int,
  cancelled_pending_refund        int,
  items_total                     int,
  items_cancelled                 int,
  reg_to_ordered_n                int,
  reg_to_ordered_median_seconds   double precision,
  reg_to_ordered_avg_seconds      double precision,
  ordered_to_arrived_n                int,
  ordered_to_arrived_median_seconds   double precision,
  ordered_to_arrived_avg_seconds      double precision,
  arrived_to_delivered_n              int,
  arrived_to_delivered_median_seconds double precision,
  arrived_to_delivered_avg_seconds    double precision,
  reg_to_delivered_n                  int,
  reg_to_delivered_median_seconds     double precision,
  reg_to_delivered_avg_seconds        double precision,
  legacy_without_ordered_at           int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ph    uuid := public.current_pharmacy_id();
  v_start timestamptz;
  v_end   timestamptz;
  v_today date;
begin
  if p_days is null or p_days not between 1 and 365 then
    raise exception 'PARAM_INVALID: فترة الإحصائيات يجب أن تكون بين 1 و365 يوماً'
      using errcode = 'invalid_parameter_value';
  end if;

  v_today := (now() at time zone 'Asia/Amman')::date;
  v_start := (v_today - (p_days - 1))::timestamp at time zone 'Asia/Amman';
  v_end   := (v_today + 1)::timestamp at time zone 'Asia/Amman';

  return query
  with req as (
    -- فوج الإجماليات: طلبات أُنشئت في الفترة
    select r.id, r.status, r.deposit, r.deposit_returned
    from public.patient_requests r
    where r.pharmacy_id = v_ph
      and r.created_at >= v_start and r.created_at < v_end
  ),
  t_req as (
    select count(*)::int                                              as requests_total,
           (count(*) filter (where q.status = 'delivered'))::int      as requests_delivered,
           (count(*) filter (where q.status = 'open'))::int           as requests_open,
           (count(*) filter (where q.status = 'cancelled'))::int      as requests_cancelled,
           (count(*) filter (where q.status = 'cancelled'
                               and coalesce(q.deposit, 0) > 0
                               and q.deposit_returned = false))::int  as cancelled_pending_refund
    from req q
  ),
  t_items as (
    -- أصناف الفوج: الملغى بإلغاء الطلب كله خارج البسط والمقام
    select (count(*) filter (where not (i.stage = 'cancelled' and i.stage_before_cancel is not null)))::int as items_total,
           (count(*) filter (where i.stage = 'cancelled' and i.stage_before_cancel is null))::int           as items_cancelled
    from public.patient_request_items i
    join req q on q.id = i.request_id
    where i.pharmacy_id = v_ph
  ),
  it as (
    -- أصناف لها حدث ضمن الفترة؛ كل مدة تُنسب لفترة حدثها النهائي
    select i.created_at, i.ordered_at, i.arrived_at, i.delivered_at
    from public.patient_request_items i
    where i.pharmacy_id = v_ph
      and ((i.ordered_at   >= v_start and i.ordered_at   < v_end)
        or (i.arrived_at   >= v_start and i.arrived_at   < v_end)
        or (i.delivered_at >= v_start and i.delivered_at < v_end))
  ),
  d as (
    select
      case when x.ordered_at >= v_start and x.ordered_at < v_end
           then greatest(0, extract(epoch from (x.ordered_at - x.created_at)))::double precision end as d1,
      case when x.arrived_at >= v_start and x.arrived_at < v_end and x.ordered_at is not null
           then greatest(0, extract(epoch from (x.arrived_at - x.ordered_at)))::double precision end as d2,
      case when x.delivered_at >= v_start and x.delivered_at < v_end and x.arrived_at is not null
           then greatest(0, extract(epoch from (x.delivered_at - x.arrived_at)))::double precision end as d3,
      (x.arrived_at >= v_start and x.arrived_at < v_end and x.ordered_at is null) as legacy
    from it x
  ),
  t_dur as (
    select
      (count(d1))::int as n1, percentile_cont(0.5) within group (order by d1) as m1, avg(d1) as a1,
      (count(d2))::int as n2, percentile_cont(0.5) within group (order by d2) as m2, avg(d2) as a2,
      (count(d3))::int as n3, percentile_cont(0.5) within group (order by d3) as m3, avg(d3) as a3,
      (count(*) filter (where legacy))::int as legacy_n
    from d
  ),
  t_deliv as (
    -- «سُجّل ← سُلّم» على مستوى الطلب: طلبات سُلّمت في الفترة (تُحسب عند تسليم آخر صنف)
    select (count(z.s))::int as n4, percentile_cont(0.5) within group (order by z.s) as m4, avg(z.s) as a4
    from (
      select greatest(0, extract(epoch from (r.delivered_at - r.created_at)))::double precision as s
      from public.patient_requests r
      where r.pharmacy_id = v_ph
        and r.status = 'delivered'
        and r.delivered_at >= v_start and r.delivered_at < v_end
    ) z
  )
  select t_req.requests_total, t_req.requests_delivered, t_req.requests_open, t_req.requests_cancelled,
         t_req.cancelled_pending_refund,
         t_items.items_total, t_items.items_cancelled,
         t_dur.n1, t_dur.m1, t_dur.a1,
         t_dur.n2, t_dur.m2, t_dur.a2,
         t_dur.n3, t_dur.m3, t_dur.a3,
         t_deliv.n4, t_deliv.m4, t_deliv.a4,
         t_dur.legacy_n
  from t_req, t_items, t_dur, t_deliv;
end;
$$;

comment on function public.request_stats_summary(int) is
  'إحصائيات طلبات الصيدلية الحالية للأيام الأخيرة (بتوقيت عمّان): إجماليات الفوج، والمدد بالثواني (وسيط ومتوسط وعدد) منسوبة لفترة حدثها النهائي.';

-- ═══════════════════════════════════════════════════════════════
-- ٣) request_stats_suppliers — جدول الموردين
-- ═══════════════════════════════════════════════════════════════
create or replace function public.request_stats_suppliers(
  p_days           int,
  p_same_day_until int,
  p_weekend_dow    int
) returns table (
  supplier_key   text,
  display_name   text,
  items_ordered  int,
  arrived_n      int,
  median_seconds double precision,
  avg_seconds    double precision,
  on_time_n      int,
  resolved_n     int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ph    uuid := public.current_pharmacy_id();
  v_start timestamptz;
  v_end   timestamptz;
  v_today date;
begin
  if p_days is null or p_days not between 1 and 365
     or p_same_day_until is null or p_same_day_until not between 0 and 1439
     or p_weekend_dow is null or p_weekend_dow not between 0 and 6 then
    raise exception 'PARAM_INVALID: معاملات إحصائيات الموردين غير صالحة'
      using errcode = 'invalid_parameter_value';
  end if;

  v_today := (now() at time zone 'Asia/Amman')::date;
  v_start := (v_today - (p_days - 1))::timestamp at time zone 'Asia/Amman';
  v_end   := (v_today + 1)::timestamp at time zone 'Asia/Amman';

  return query
  with base as (
    -- فوج الموردين: أصناف طُلبت من المورد في الفترة
    select public.normalize_product_name(coalesce(i.supplier, '')) as k,
           coalesce(i.supplier, '') as raw,
           i.ordered_at,
           i.arrived_at,
           i.stage,
           public.request_expected_arrival_day(i.ordered_at, p_same_day_until, p_weekend_dow) as expected_day
    from public.patient_request_items i
    where i.pharmacy_id = v_ph
      and i.ordered_at >= v_start and i.ordered_at < v_end
  ),
  graded as (
    select b.*,
           -- مدة الوصول للأصناف الواصلة فقط
           case when b.arrived_at is not null
                then greatest(0, extract(epoch from (b.arrived_at - b.ordered_at)))::double precision end as secs,
           -- الالتزام: true في الموعد، false متأخر، null غير محسوم (لم يحن موعده أو ملغى بلا وصول)
           case
             when b.arrived_at is not null
               then ((b.arrived_at at time zone 'Asia/Amman')::date <= b.expected_day)
             when b.stage = 'ordered' and v_today > b.expected_day then false
             else null
           end as on_time
    from base b
  ),
  agg as (
    select g.k as supplier_key,
           case when g.k = '' then 'بدون مورد محدد'
                else (array_agg(g.raw order by g.ordered_at desc, g.raw))[1] end as display_name,
           (count(*))::int as items_ordered,
           (count(g.secs))::int as arrived_n,
           percentile_cont(0.5) within group (order by g.secs) as median_seconds,
           avg(g.secs) as avg_seconds,
           (count(*) filter (where g.on_time is true))::int as on_time_n,
           (count(*) filter (where g.on_time is not null))::int as resolved_n
    from graded g
    group by g.k
  ),
  ranked as (
    select a.*,
           row_number() over (partition by (a.supplier_key = '') order by a.items_ordered desc, a.display_name) as rn,
           (count(*) filter (where a.supplier_key = '') over ())::int as has_nosupplier
    from agg a
  )
  select r.supplier_key, r.display_name, r.items_ordered, r.arrived_n, r.median_seconds, r.avg_seconds,
         -- بلا مورد: لا نسبة التزام
         case when r.supplier_key = '' then null else r.on_time_n end,
         case when r.supplier_key = '' then null else r.resolved_n end
  from ranked r
  where r.supplier_key = '' or r.rn <= 50 - r.has_nosupplier
  order by (r.supplier_key = ''), r.items_ordered desc, r.display_name
  limit 50;
end;
$$;

comment on function public.request_stats_suppliers(int, int, int) is
  'جدول موردين الصيدلية الحالية للأصناف المطلوبة من المورد خلال الأيام الأخيرة: العدد، ومدة الوصول، والالتزام بالموعد المتوقع. حتى 50 صفاً، وصف «بدون مورد محدد» آخراً.';

revoke execute on function public.request_stats_summary(int) from public, anon;
grant  execute on function public.request_stats_summary(int) to authenticated;
revoke execute on function public.request_stats_suppliers(int, int, int) from public, anon;
grant  execute on function public.request_stats_suppliers(int, int, int) to authenticated;
