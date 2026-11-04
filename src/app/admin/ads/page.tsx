'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, Warning } from '@phosphor-icons/react';
import { adminFetch } from '@/lib/admin-fetch';

// الإعلانات — نتائج عدّاد /welcome. للمالك فقط: القيد في ROUTE_ROLES (admin-context) وفي /api/admin/welcome-stats.

type Period = 'today' | 'last_7_days' | 'all_time';

interface FunnelRow {
  period: string;
  src: string;
  visits: number;
  median_active_seconds: number | null;
  wa_visits: number;
  wa_pct: number | null;
  [k: string]: string | number | null;
}
interface Stats {
  generated_at: string;
  funnel: FunnelRow[];
  devices: Record<string, { mobile: number; desktop: number }>;
  buttons: Record<string, Record<string, number>>;
}

const PERIODS: { v: Period; label: string }[] = [
  { v: 'today', label: 'اليوم' },
  { v: 'last_7_days', label: 'آخر 7 أيام' },
  { v: 'all_time', label: 'منذ البداية' },
];

// أسماء الأقسام العشرة بترتيبها في /welcome (مشتقة من عناوينها الفعلية)
const SECTION_NAMES = [
  'العنوان الرئيسي', 'سبب الانتقال', 'التنبيه قبل النفاد', 'الصندوق اليومي', 'خدمات العودة',
  'سجل الوصفات', 'متابعة الموظفين', 'أسئلة الاشتراك', 'العرض والسعر', 'ابدأ اليوم',
];
const BUTTON_ORDER = ['hero', 'offer', 'start', 'float'];
const BUTTON_LABEL: Record<string, string> = { hero: 'الرئيسي', offer: 'العرض', start: 'ابدأ اليوم', float: 'العائم' };
const TABLE_SRCS = ['fb-a', 'fb-b', 'ig', 'web'];

const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);
const fmtMedian = (s: number | null | undefined) => {
  if (s == null) return '—';
  const sec = Math.round(Number(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, numberingSystem: 'latn', timeZone: 'Asia/Amman' });

function filterBtn(active: boolean): string {
  return `h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`;
}

// اختبار نسبتين: يرجع اسم الإعلان المتفوّق، أو null إن لم يثبت فرق، أو 'small' إن كانت العينة صغيرة
function verdict(a: FunnelRow | undefined, b: FunnelRow | undefined): { kind: 'small' | 'none' | 'win'; winner?: string } {
  const n1 = a?.visits ?? 0, n2 = b?.visits ?? 0, x1 = a?.wa_visits ?? 0, x2 = b?.wa_visits ?? 0;
  if (n1 < 30 || n2 < 30 || x1 + x2 < 10) return { kind: 'small' };
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { kind: 'none' };
  const z = (x1 / n1 - x2 / n2) / se;
  if (Math.abs(z) >= 1.96) return { kind: 'win', winner: z > 0 ? 'fb-a' : 'fb-b' };
  return { kind: 'none' };
}

function reached(row: FunnelRow | undefined, n: number): number {
  return row ? Number(row[`reached_${n}_pct`] ?? 0) : 0;
}
// القسم الذي ينتهي عنده أكبر هبوط بين قسمين متتاليين (فهرس 1..9)، أو null إن لم يكن هناك هبوط
function biggestDrop(row: FunnelRow | undefined): number | null {
  if (!row) return null;
  let best = 0, at: number | null = null;
  for (let n = 2; n <= 10; n++) {
    const drop = reached(row, n - 1) - reached(row, n);
    if (drop > best) { best = drop; at = n; }
  }
  return at;
}

const EMPTY = 'لا زيارات في هذه الفترة بعد';
const Empty = () => <p className="text-xs text-slate-400 py-6 text-center">{EMPTY}</p>;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
      <h2 className="text-sm font-bold text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default function AdsPage() {
  const [period, setPeriod] = useState<Period>('last_7_days');
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const reqId = useRef(0);

  const load = async (p: Period) => {
    const id = ++reqId.current;
    try {
      const res = await adminFetch(`/api/admin/welcome-stats?period=${p}`);
      if (id !== reqId.current) return;
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError('');
    } catch {
      if (id === reqId.current) setError('تعذّر تحميل الإحصاءات');
    } finally {
      if (id === reqId.current) { setLoading(false); setRefreshing(false); }
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(period);
  }, [period]);

  const row = (src: string) => data?.funnel.find(f => f.src === src);
  const a = row('fb-a'), b = row('fb-b');
  const v = verdict(a, b);
  const dropA = biggestDrop(a), dropB = biggestDrop(b);

  const mobilePct = (src: string) => {
    const d = data?.devices[src];
    const total = (d?.mobile ?? 0) + (d?.desktop ?? 0);
    return total ? fmtPct((100 * (d?.mobile ?? 0)) / total) : '—';
  };

  const tags = data
    ? [...BUTTON_ORDER, ...Object.keys(data.buttons).filter(t => !BUTTON_ORDER.includes(t)).sort()]
    : BUTTON_ORDER;

  const adColumn = (src: string, tone: string) => {
    const r = row(src);
    return (
      <div className="rounded-xl border border-slate-200 p-3 min-w-0">
        <p className={`text-xs font-bold mb-2 ${tone}`} dir="ltr">{src}</p>
        {r ? (
          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">الزيارات</dt><dd className="font-bold text-slate-900 tabular-nums"><bdi>{fmtNum(r.visits)}</bdi></dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">وسيط الوقت</dt><dd className="font-bold text-slate-900 tabular-nums"><bdi>{fmtMedian(r.median_active_seconds)}</bdi></dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">ضغطوا واتساب</dt><dd className="font-bold text-slate-900 tabular-nums"><bdi>{fmtPct(r.wa_pct)} ({fmtNum(r.wa_visits)})</bdi></dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">من الجوال</dt><dd className="font-bold text-slate-900 tabular-nums"><bdi>{mobilePct(src)}</bdi></dd></div>
          </dl>
        ) : <p className="text-xs text-slate-400">{EMPTY}</p>}
      </div>
    );
  };

  const otherLine = (src: string) => {
    const r = row(src);
    return (
      <div key={src} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs py-2 border-t border-slate-100 first:border-t-0">
        <span className="font-bold text-slate-900 w-10" dir="ltr">{src}</span>
        {r ? (
          <>
            <span className="text-slate-500">الزيارات <b className="text-slate-900 tabular-nums"><bdi>{fmtNum(r.visits)}</bdi></b></span>
            <span className="text-slate-500">الوسيط <b className="text-slate-900 tabular-nums"><bdi>{fmtMedian(r.median_active_seconds)}</bdi></b></span>
            <span className="text-slate-500">واتساب <b className="text-slate-900 tabular-nums"><bdi>{fmtPct(r.wa_pct)}</bdi></b></span>
          </>
        ) : <span className="text-slate-400">{EMPTY}</span>}
      </div>
    );
  };

  const bar = (pct: number, color: string) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden" dir="ltr">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="w-12 text-[11px] text-slate-600 tabular-nums text-end"><bdi>{fmtPct(pct)}</bdi></span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">الإعلانات</h1>
          <p className="text-xs text-slate-500 mt-1">
            نتائج زيارات صفحة /welcome حسب مصدر الإعلان.
            {data && <> آخر تحديث <span className="tabular-nums"><bdi>{fmtTime(data.generated_at)}</bdi></span></>}
          </p>
        </div>
        <button type="button" onClick={() => { setRefreshing(true); load(period); }} disabled={refreshing}
          className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 shrink-0">
          <ArrowClockwise size={14} weight="bold" aria-hidden="true" />
          تحديث
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {PERIODS.map(p => (
          <button key={p.v} type="button" onClick={() => { if (p.v !== period) { setLoading(true); setPeriod(p.v); } }} className={filterBtn(period === p.v)}>{p.label}</button>
        ))}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3 text-xs mb-4 flex items-center gap-2">
          <Warning size={16} weight="bold" aria-hidden="true" />{error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" role="status" aria-label="جارٍ التحميل" />
        </div>
      ) : data && (
        <div className={refreshing || loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Card title="مقارنة الإعلانين">
            <div className="grid grid-cols-2 gap-3">
              {adColumn('fb-a', 'text-teal-700')}
              {adColumn('fb-b', 'text-slate-600')}
            </div>
            <p className="text-xs text-slate-600 mt-3">
              {v.kind === 'small' && 'العينة ما زالت صغيرة — لا تحكم بعد.'}
              {v.kind === 'none' && 'لا فرق موثوق بعد بين الإعلانين.'}
              {v.kind === 'win' && <>الإعلان <span dir="ltr" className="font-bold">{v.winner}</span> يتفوّق بفرق موثوق.</>}
            </p>
          </Card>

          <Card title="مسار الأقسام">
            {!a && !b ? <Empty /> : (
              <>
                <div className="flex gap-4 text-[11px] text-slate-500 mb-3">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-teal-600" />fb-a</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-full bg-slate-400" />fb-b</span>
                </div>
                <div className="space-y-3">
                  {SECTION_NAMES.map((name, i) => {
                    const n = i + 1;
                    return (
                      <div key={name}>
                        <p className="text-xs font-bold text-slate-900 mb-1 flex flex-wrap items-center gap-x-2">
                          <span className="text-slate-400 tabular-nums"><bdi>{n}</bdi></span>{name}
                          {dropA === n && <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2">fb-a: أكبر خسارة هنا</span>}
                          {dropB === n && <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2">fb-b: أكبر خسارة هنا</span>}
                        </p>
                        <div className="space-y-1">
                          {bar(reached(a, n), 'bg-teal-600')}
                          {bar(reached(b, n), 'bg-slate-400')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          <Card title="أزرار واتساب">
            {data.funnel.length === 0 ? <Empty /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 text-start">
                      <th className="py-2 pe-3 font-bold text-start">الزر</th>
                      {TABLE_SRCS.map(s => <th key={s} className="py-2 pe-3 font-bold text-start" dir="ltr">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tags.map(t => (
                      <tr key={t} className="border-t border-slate-100">
                        <td className="py-2 pe-3 text-slate-700">{BUTTON_LABEL[t] || t}</td>
                        {TABLE_SRCS.map(s => (
                          <td key={s} className="py-2 pe-3 tabular-nums text-slate-900"><bdi>{fmtNum(data.buttons[t]?.[s] ?? 0)}</bdi></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="مصادر أخرى">
            {otherLine('ig')}
            {otherLine('web')}
          </Card>
        </div>
      )}
    </div>
  );
}
