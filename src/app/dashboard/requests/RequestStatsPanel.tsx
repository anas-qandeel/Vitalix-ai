'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REQUESTS_CHANGED_EVENT } from '@/lib/request-overdue';
import {
  MIN_SAMPLE_DURATION, MIN_SAMPLE_SUPPLIER, STATS_PERIODS, SUPPLIER_ON_TIME_GOOD, SUPPLIER_ON_TIME_OK,
  deliveredPhrase, deliveredRequestsNeeded, fetchRequestStats, formatDuration, formatDurationAfter,
  itemsCount, itemsCountGen, itemsNeeded, requestsCountGen, timesWord,
  type StatsData, type StatsSummary, type SupplierStat,
} from '@/lib/request-stats';

// تبويب «نتائجك» (معرّفه الداخلي stats): أرقام على مستوى الصيدلية فقط (لا أرقام لكل موظف)، مرئية لكل الموظفين وفي القراءة فقط.
// يُحمَّل عند أول فتح، ويُخزَّن لكل فترة، ويُحدَّث عند requests:changed ما دام ظاهراً (وإلا عند العودة إليه).
// الفشل هنا استشاري: رابط إعادة محاولة بلا إشعار حاجب.
// التصميم يتبع قسم «نتائجك» في صفحة المزمنين (dashboard/chronic/page.tsx) بنفس الكلاسات ومسارات الأيقونات،
// منسوخةً هنا كمكوّنات صغيرة محلية بدل استيرادها لأن ذلك القسم مضمَّن في صفحته ولا مكوّن مشترك له.

// مسارات Heroicons منسوخة من chronic/page.tsx (strokeWidth 1.5)، وأيقونة الساعة بالأسلوب نفسه
const ICON_TREND = 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941';
const ICON_USERS = 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z';
const ICON_WARN = 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z';
const ICON_BULB = 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18';
const ICON_CLOCK = 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z';

function Svg({ d, className, strokeWidth = 1.5 }: { d: string; className: string; strokeWidth?: number }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

const BOX = 'bg-white border border-slate-200 rounded-xl';

// البطاقة الرئيسية: النتيجة الأهم (مثل «ملخص أداء الصيدلية»)
function Hero({ label, value, phrase, sub }: { label: string; value: number; phrase: string; sub: string }) {
  return (
    <div className="relative bg-white border-2 border-teal-500 rounded-2xl overflow-hidden">
      <div className="relative px-6 py-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-teal-600 text-xs font-bold mb-3">{label}</p>
          <div className="flex items-baseline gap-3">
            <p className="text-6xl sm:text-7xl font-black tabular-nums leading-none text-slate-900">{value}</p>
            <p className="text-slate-700 text-base font-semibold">{phrase}</p>
          </div>
          <p className="text-slate-400 text-xs mt-2">{sub}</p>
        </div>
        <div className="shrink-0 hidden sm:flex w-20 h-20 rounded-2xl bg-teal-50 items-center justify-center">
          <Svg d={ICON_TREND} className="w-10 h-10 text-teal-400" />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, warn = false }: { label: string; value: string; sub: string; icon: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className={warn ? 'text-amber-500' : 'text-slate-400'}><Svg d={icon} className="w-4 h-4" /></span>
      </div>
      <p className={`text-3xl font-black tabular-nums ${warn ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
      <p className={`text-[11px] mt-1.5 ${warn ? 'text-amber-600' : 'text-slate-400'}`}>{sub}</p>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5">
      <Svg d={ICON_BULB} className="w-3.5 h-3.5 shrink-0 text-teal-500" strokeWidth={2} />
      {children}
    </p>
  );
}

function RankBox({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'teal' }) {
  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0 tabular-nums ${tone === 'teal' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
      {children}
    </div>
  );
}

interface DurationRowData {
  n: number; median: number | null; need: string; sample: string;
  sentence: (d: string) => string;
}

function DurationRow({ index, row, tone }: { index: number; row: DurationRowData; tone: 'slate' | 'teal' }) {
  const enough = row.n >= MIN_SAMPLE_DURATION && row.median != null;
  return (
    <div className="flex items-center gap-4">
      <RankBox tone={tone}>{index}</RankBox>
      <div className="flex-1 min-w-0">
        {enough ? (
          <>
            <p className="text-sm font-semibold text-slate-900 leading-relaxed">{row.sentence(formatDurationAfter(row.median as number))}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{row.sample}</p>
          </>
        ) : (
          <p className="text-xs font-medium text-slate-400 leading-relaxed tabular-nums">{row.need}</p>
        )}
      </div>
      {enough && (
        <p className="shrink-0 max-w-[6.5rem] text-lg font-black text-slate-900 leading-tight text-right">{formatDuration(row.median as number)}</p>
      )}
    </div>
  );
}

function shareTone(pct: number): string {
  return pct >= SUPPLIER_ON_TIME_GOOD ? 'text-teal-600' : pct >= SUPPLIER_ON_TIME_OK ? 'text-amber-600' : 'text-rose-600';
}

function SupplierRow({ index, s }: { index: number; s: SupplierStat }) {
  const noSupplier = s.supplier_key === '';
  const arrivalOk = s.arrived_n >= MIN_SAMPLE_SUPPLIER && s.median_seconds != null;
  const shareOk = !noSupplier && s.on_time_n != null && s.resolved_n != null && s.resolved_n >= MIN_SAMPLE_SUPPLIER;
  const pct = shareOk ? Math.round(((s.on_time_n as number) / (s.resolved_n as number)) * 100) : null;
  return (
    <div className="flex items-center gap-4">
      <RankBox>{index}</RankBox>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate" dir="auto">{noSupplier ? 'بدون مورد محدد' : s.display_name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{`طُلب منه ${itemsCount(s.items_ordered)}`}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
          {noSupplier ? 'لم يُسجَّل اسم المورد لهذه الأصناف'
            : arrivalOk ? `عادةً يصل صنفه بعد ${formatDurationAfter(s.median_seconds as number)} من طلبه`
            : 'لم تصله أصناف كافية بعد'}
        </p>
      </div>
      {!noSupplier && (
        <div className="text-right shrink-0">
          {pct != null ? (
            <>
              <p className={`text-lg font-black tabular-nums leading-none ${shareTone(pct)}`}>{pct}%</p>
              <p className="text-[9px] text-slate-400 mt-0.5">في الموعد</p>
              <p className="text-[11px] text-slate-400 mt-1 tabular-nums">{`وصلت أصنافه في الموعد ${s.on_time_n} من ${s.resolved_n} ${timesWord(s.resolved_n as number)}`}</p>
            </>
          ) : (
            <>
              <p className="text-lg font-black text-slate-300 leading-none">—</p>
              <p className="text-[11px] text-slate-400 mt-1">لا تكفي البيانات بعد</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function isEmptyPeriod(d: StatsData): boolean {
  const s = d.summary;
  return s.requests_total === 0 && d.suppliers.length === 0
    && s.reg_to_ordered_n + s.ordered_to_arrived_n + s.arrived_to_delivered_n + s.reg_to_delivered_n + s.legacy_without_ordered_at === 0;
}

function Results({ data, periodLabel }: { data: StatsData; periodLabel: string }) {
  const s: StatsSummary = data.summary;
  if (isEmptyPeriod(data)) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 px-5 py-4">
        <p className="text-sm font-semibold text-slate-700 text-center">سجّل طلباً وتابعه حتى التسليم وسترى نتائجك هنا.</p>
      </div>
    );
  }
  const deliveredPct = s.requests_total > 0 ? `${Math.round((s.requests_delivered / s.requests_total) * 100)}%` : '—';
  const need = (what: string) => `لا تكفي البيانات بعد — نحتاج ${what} على الأقل`;
  const needItems = (n: number) => `${need(itemsNeeded(MIN_SAMPLE_DURATION))} (لديك ${n})`;
  const rows: DurationRowData[] = [
    { n: s.reg_to_ordered_n, median: s.reg_to_ordered_median_seconds, need: needItems(s.reg_to_ordered_n), sample: `محسوب من ${itemsCountGen(s.reg_to_ordered_n)}`,
      sentence: d => `عادةً يُطلب الصنف من المورد خلال ${d} من تسجيله` },
    { n: s.ordered_to_arrived_n, median: s.ordered_to_arrived_median_seconds, need: needItems(s.ordered_to_arrived_n), sample: `محسوب من ${itemsCountGen(s.ordered_to_arrived_n)}`,
      sentence: d => `عادةً يصل الصنف من المورد بعد ${d} من طلبه` },
    { n: s.arrived_to_delivered_n, median: s.arrived_to_delivered_median_seconds, need: needItems(s.arrived_to_delivered_n), sample: `محسوب من ${itemsCountGen(s.arrived_to_delivered_n)}`,
      sentence: d => `عادةً يستلم المريض صنفه بعد ${d} من وصوله إلى الصيدلية` },
    { n: s.reg_to_delivered_n, median: s.reg_to_delivered_median_seconds, need: `${need(deliveredRequestsNeeded(MIN_SAMPLE_DURATION))} (لديك ${s.reg_to_delivered_n})`, sample: `محسوب من ${requestsCountGen(s.reg_to_delivered_n)}`,
      sentence: d => `عادةً ينتظر المريض ${d} من تسجيل طلبه حتى يستلمه` },
  ];
  // الصف بلا مورد محدد يأتي أخيراً؛ الترتيب النسبي لبقية الصفوف كما أعادته القاعدة
  const suppliers = [...data.suppliers.filter(x => x.supplier_key !== ''), ...data.suppliers.filter(x => x.supplier_key === '')];
  return (
    <div className="space-y-4">
      <Hero label="ملخص طلبات المرضى" value={s.requests_delivered}
        phrase={s.requests_delivered === 0 ? 'لم يُسلَّم أي طلب بعد من طلبات هذه الفترة' : deliveredPhrase(s.requests_delivered)}
        sub={`من الطلبات التي سجّلتها خلال ${periodLabel}`} />

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="طلبات مسجّلة" value={String(s.requests_total)} sub={`سجّلتها خلال ${periodLabel}`} icon={ICON_USERS} />
        <Kpi label="ما زالت مفتوحة" value={String(s.requests_open)} sub="بانتظار المتابعة حتى التسليم" icon={ICON_CLOCK} />
        <Kpi label="أُلغيت" value={String(s.requests_cancelled)} icon={ICON_WARN} warn={s.cancelled_pending_refund > 0}
          sub={s.cancelled_pending_refund > 0 ? `منها ${s.cancelled_pending_refund} عربونه لم يُعَد بعد` : s.requests_cancelled === 0 ? 'لم تُلغَ طلبات' : 'أُلغيت قبل التسليم'} />
        <Kpi label="نسبة التسليم" value={deliveredPct} sub="من الطلبات المسجّلة سُلّمت" icon={ICON_TREND} />
      </div>

      <div className={`${BOX} p-5`}>
        <p className="text-sm font-bold text-slate-800 mb-4">كم تستغرق طلباتك عادةً؟</p>
        <div className="space-y-4">
          {rows.map((r, i) => <DurationRow key={i} index={i + 1} row={r} tone={i === 3 ? 'teal' : 'slate'} />)}
        </div>
        <Tip>الرقم الأخير هو ما يشعر به مريضك، وأسرع طريق لتقليله أن تطلب الصنف من المورد فور تسجيله.</Tip>
      </div>

      <div className={`${BOX} p-5`}>
        <p className="text-sm font-bold text-slate-800 mb-4">موردوك</p>
        {suppliers.length === 0 ? (
          <p className="text-xs font-medium text-slate-500">لم تطلب أي صنف من مورد خلال هذه الفترة.</p>
        ) : (
          <div className="space-y-4">
            {suppliers.map((sp, i) => <SupplierRow key={sp.supplier_key || 'none'} index={i + 1} s={sp} />)}
          </div>
        )}
        <Tip>الموعد المتوقع: نفس اليوم إن طُلب الصنف قبل 11 صباحاً، وإلا يوم العمل التالي. الجمعة عطلة.</Tip>
      </div>
    </div>
  );
}

export default function RequestStatsPanel({ visible }: { visible: boolean }) {
  const [period, setPeriod] = useState<number>(STATS_PERIODS[0]);
  const [cache, setCache] = useState<Record<number, StatsData>>({});
  const [failedFor, setFailedFor] = useState<number | null>(null);
  const inflight = useRef(new Set<number>());
  const again = useRef(new Set<number>());
  const stale = useRef(false);

  // جلب واحد لكل فترة في آن؛ طلب يصل أثناء الجلب يعيده مرة واحدة بعد انتهائه (قد يسبق الحفظ)
  const load = useCallback(async (days: number) => {
    if (inflight.current.has(days)) { again.current.add(days); return; }
    inflight.current.add(days);
    try {
      do {
        again.current.delete(days);
        try {
          const data = await fetchRequestStats(days);
          setCache(prev => ({ ...prev, [days]: data }));
          setFailedFor(prev => (prev === days ? null : prev));
        } catch {
          setFailedFor(days);
        }
      } while (again.current.has(days));
    } finally {
      inflight.current.delete(days);
    }
  }, []);

  // عند الظهور: جلب الفترة غير المخزّنة، أو إعادة جلب إن وصل حدث تغيير أثناء الغياب
  useEffect(() => {
    if (!visible) return;
    if (stale.current) { stale.current = false; void load(period); return; }
    if (!cache[period] && failedFor !== period) void load(period);
  }, [visible, period, cache, failedFor, load]);

  // requests:changed: ظاهر ← تحديث فوري (مع إسقاط الفترة الأخرى فتُجلب عند اختيارها)؛ غائب ← علامة لما بعد العودة
  useEffect(() => {
    const onChanged = () => {
      if (!visible) { stale.current = true; setCache({}); return; }
      setCache(prev => (prev[period] ? { [period]: prev[period] } : {}));
      void load(period);
    };
    window.addEventListener(REQUESTS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(REQUESTS_CHANGED_EVENT, onChanged);
  }, [visible, period, load]);

  const data = cache[period];
  const failed = failedFor === period;

  return (
    <section className="space-y-5 saas-slide-up" aria-labelledby="request-stats-title">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 id="request-stats-title" className="text-base font-bold text-slate-900">نتائج الطلبات</h2>
        <div className="inline-flex self-start bg-slate-100 rounded-xl p-1 gap-1" role="group" aria-label="الفترة">
          {STATS_PERIODS.map(d => (
            <button key={d} type="button" aria-pressed={period === d} onClick={() => { setFailedFor(null); setPeriod(d); }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${period === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
              آخر <span className="tabular-nums">{d}</span> يوماً
            </button>
          ))}
        </div>
      </div>

      {failed && !data ? (
        <div className={`${BOX} py-10 text-center px-6`}>
          <p className="text-sm font-medium text-slate-600">تعذّر تحميل النتائج.</p>
          <button type="button" onClick={() => { setFailedFor(null); void load(period); }}
            className="mt-3 text-xs font-bold text-teal-700 hover:text-teal-800 underline underline-offset-2 cursor-pointer">
            إعادة المحاولة
          </button>
        </div>
      ) : !data ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">جاري التحميل...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {failed && (
            <p className="text-[11px] text-slate-500">
              تعذّر تحديث الأرقام، والمعروض آخر نسخة محمّلة.{' '}
              <button type="button" onClick={() => { setFailedFor(null); void load(period); }} className="font-bold text-teal-700 underline underline-offset-2 cursor-pointer">إعادة المحاولة</button>
            </p>
          )}
          <Results data={data} periodLabel={`آخر ${period} يوماً`} />
        </div>
      )}
    </section>
  );
}
