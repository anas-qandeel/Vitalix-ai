'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { REQUESTS_CHANGED_EVENT } from '@/lib/request-overdue';
import {
  MIN_SAMPLE_DURATION, MIN_SAMPLE_SUPPLIER, STATS_PERIODS, fetchRequestStats, formatDuration, formatPercent,
  itemsCount, legacyNote, requestsCount, type StatsData, type StatsSummary, type SupplierStat,
} from '@/lib/request-stats';

// تبويب «الإحصائيات»: أرقام على مستوى الصيدلية فقط (لا أرقام لكل موظف)، مرئية لكل الموظفين وفي القراءة فقط.
// يُحمَّل عند أول فتح، ويُخزَّن لكل فترة، ويُحدَّث عند requests:changed ما دام ظاهراً (وإلا عند العودة إليه).
// الفشل هنا استشاري: رابط إعادة محاولة بلا إشعار حاجب.

function IconChartBar({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

const CARD = 'bg-white border border-slate-200 rounded-2xl shadow-sm';

function Tile({ label, value, tone = 'slate', note }: { label: string; value: string; tone?: 'slate' | 'rose'; note?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone === 'rose' ? 'text-rose-600' : 'text-slate-900'}`}>{value}</p>
      {note && <p className="mt-1 text-[11px] text-slate-400 tabular-nums">{note}</p>}
    </div>
  );
}

function DurationCard({ title, subtitle, n, median, avg, unit }: {
  title: string; subtitle: string; n: number; median: number | null; avg: number | null; unit: (n: number) => string;
}) {
  const enough = n >= MIN_SAMPLE_DURATION && median != null;
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
      {enough ? (
        <>
          <p className="mt-3 text-[11px] font-semibold text-slate-500">المعتاد</p>
          <p className="text-xl font-black text-slate-900 tabular-nums">{formatDuration(median)}</p>
          <p className="mt-2 text-[11px] text-slate-500 tabular-nums">
            المتوسط: {avg != null ? formatDuration(avg) : '—'} · بناءً على {unit(n)}
          </p>
        </>
      ) : (
        <p className="mt-4 text-xs font-medium text-slate-400 tabular-nums">بيانات غير كافية ({n})</p>
      )}
    </div>
  );
}

function supplierDuration(s: SupplierStat): string | null {
  return s.arrived_n >= MIN_SAMPLE_SUPPLIER && s.median_seconds != null ? formatDuration(s.median_seconds) : null;
}

function supplierShare(s: SupplierStat): string | null {
  if (s.supplier_key === '' || s.on_time_n == null || s.resolved_n == null || s.resolved_n < MIN_SAMPLE_SUPPLIER) return null;
  return formatPercent(s.on_time_n, s.resolved_n);
}

function SuppliersSection({ suppliers }: { suppliers: SupplierStat[] }) {
  if (suppliers.length === 0) {
    return <p className={`${CARD} px-5 py-6 text-center text-xs text-slate-500`}>لا موردين مسجّلين في هذه الفترة.</p>;
  }
  const NA = <span className="text-xs font-medium text-slate-400">بيانات غير كافية</span>;
  return (
    <>
      {/* من sm فما فوق: جدول */}
      <div className={`${CARD} hidden sm:block overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 border-b border-slate-100">
            <tr className="text-[11px] font-semibold text-slate-500">
              <th scope="col" className="text-right px-5 py-3">المورد</th>
              <th scope="col" className="text-right px-3 py-3">أصناف طُلبت</th>
              <th scope="col" className="text-right px-3 py-3">المعتاد من الطلب حتى الوصول</th>
              <th scope="col" className="text-right px-5 py-3">في الموعد</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map(s => {
              const dur = supplierDuration(s);
              const share = supplierShare(s);
              return (
                <tr key={s.supplier_key || 'none'} className="text-slate-900">
                  <td className="px-5 py-3 font-semibold break-words" dir="auto">{s.display_name}</td>
                  <td className="px-3 py-3 tabular-nums">{s.items_ordered}</td>
                  <td className="px-3 py-3 tabular-nums">{dur ?? NA}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {s.supplier_key === '' ? <span className="text-slate-400">—</span>
                      : share ? <>{share}<span className="text-[11px] text-slate-400"> من {s.resolved_n}</span></> : NA}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* على الجوال: بطاقات */}
      <div className="sm:hidden space-y-3">
        {suppliers.map(s => {
          const dur = supplierDuration(s);
          const share = supplierShare(s);
          return (
            <div key={s.supplier_key || 'none'} className={`${CARD} p-4`}>
              <p className="text-sm font-bold text-slate-900 break-words" dir="auto">{s.display_name}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-slate-500">أصناف طُلبت</dt>
                  <dd className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">{s.items_ordered}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">المعتاد حتى الوصول</dt>
                  <dd className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">{dur ?? NA}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">في الموعد</dt>
                  <dd className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
                    {s.supplier_key === '' ? '—' : share ?? NA}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </>
  );
}

function isEmptyPeriod(d: StatsData): boolean {
  const s = d.summary;
  return s.requests_total === 0 && d.suppliers.length === 0
    && s.reg_to_ordered_n + s.ordered_to_arrived_n + s.arrived_to_delivered_n + s.reg_to_delivered_n + s.legacy_without_ordered_at === 0;
}

function Results({ data }: { data: StatsData }) {
  const s: StatsSummary = data.summary;
  if (isEmptyPeriod(data)) {
    return (
      <div className={`${CARD} py-14 text-center px-6`}>
        <IconChartBar className="w-8 h-8 mx-auto text-slate-300" />
        <p className="text-sm font-bold text-slate-700 mt-3">لا بيانات كافية في هذه الفترة</p>
      </div>
    );
  }
  const cancelledItemsPct = s.items_total > 0 ? formatPercent(s.items_cancelled, s.items_total) : null;
  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="stats-totals">
        <h3 id="stats-totals" className="text-sm font-bold text-slate-900">طلبات سُجّلت خلال الفترة</h3>
        <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${cancelledItemsPct ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          <Tile label="الإجمالي" value={String(s.requests_total)} />
          <Tile label="سُلّم" value={String(s.requests_delivered)} />
          <Tile label="مفتوح" value={String(s.requests_open)} />
          <Tile label="أُلغي" value={String(s.requests_cancelled)} tone="rose"
            note={s.cancelled_pending_refund > 0 ? `منها عربون بانتظار الإرجاع: ${s.cancelled_pending_refund}` : undefined} />
          {cancelledItemsPct && <Tile label="الأصناف الملغاة" value={cancelledItemsPct} />}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="stats-durations">
        <div>
          <h3 id="stats-durations" className="text-sm font-bold text-slate-900">المدد المعتادة</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            المعتاد: نصف الحالات أسرع منه ونصفها أبطأ، ولا يتأثر بطلب نُسي أسابيع. المتوسط يرتفع إذا تأخرت حالة واحدة كثيراً.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DurationCard title="من التسجيل حتى الطلب من المورد" subtitle="سرعة الصيدلية" unit={itemsCount}
            n={s.reg_to_ordered_n} median={s.reg_to_ordered_median_seconds} avg={s.reg_to_ordered_avg_seconds} />
          <DurationCard title="من الطلب حتى الوصول" subtitle="سرعة المورد" unit={itemsCount}
            n={s.ordered_to_arrived_n} median={s.ordered_to_arrived_median_seconds} avg={s.ordered_to_arrived_avg_seconds} />
          <DurationCard title="من الوصول حتى استلام المريض" subtitle="سرعة استلام المريض" unit={itemsCount}
            n={s.arrived_to_delivered_n} median={s.arrived_to_delivered_median_seconds} avg={s.arrived_to_delivered_avg_seconds} />
          <DurationCard title="من التسجيل حتى التسليم" subtitle="ما يشعر به المريض" unit={requestsCount}
            n={s.reg_to_delivered_n} median={s.reg_to_delivered_median_seconds} avg={s.reg_to_delivered_avg_seconds} />
        </div>
        {s.legacy_without_ordered_at > 0 && (
          <p className="text-[11px] text-slate-400 tabular-nums">{legacyNote(s.legacy_without_ordered_at)}</p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="stats-suppliers">
        <div>
          <h3 id="stats-suppliers" className="text-sm font-bold text-slate-900">الموردون</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            أصناف طُلبت من المورد خلال الفترة. «في الموعد» تقيس الوصول بالموعد المتوقع (يوم عمل حتى 11:00 ← اليوم نفسه، بعدها ← يوم العمل التالي).
          </p>
        </div>
        <SuppliersSection suppliers={data.suppliers} />
      </section>
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
        <h2 id="request-stats-title" className="text-base font-bold text-slate-900">إحصائيات الطلبات</h2>
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
        <div className={`${CARD} py-10 text-center px-6`}>
          <p className="text-sm font-medium text-slate-600">تعذّر تحميل الإحصائيات.</p>
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
          <Results data={data} />
        </div>
      )}
    </section>
  );
}
