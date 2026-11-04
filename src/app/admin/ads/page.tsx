'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, FileXls, Warning } from '@phosphor-icons/react';
import Toast, { useNotice } from '@/components/Toast';
import { adminFetch } from '@/lib/admin-fetch';
import {
  type FunnelRow, SECTION_NAMES, BUTTON_ORDER, BUTTON_LABEL, TABLE_SRCS,
  fmtMedian, fmtSecs, waText, verdict, reached, biggestDrop, mobileShare,
} from '@/lib/welcome-stats';

// الإعلانات — نتائج عدّاد /welcome. للمالك فقط: القيد في ROUTE_ROLES (admin-context) وفي /api/admin/welcome-stats.

type Period = 'today' | 'last_7_days' | 'all_time';

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

interface Visit {
  ref: string;
  created_at: string;
  updated_at: string;
  src: string;
  device: string | null;
  active_seconds: number;
  max_section: number;
  wa_clicks: string[];
}
interface VisitsPage { total: number; page: number; page_size: number; visits: Visit[] }

const SRC_FILTERS = ['all', 'fb-a', 'fb-b', 'ig', 'web'];
const fmtNum = (n: number) => n.toLocaleString('en-US');
const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);
// وقت الدخول: اليوم والتاريخ والساعة بتوقيت عمّان
const fmtEntry = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric', numberingSystem: 'latn', timeZone: 'Asia/Amman' });
  const time = d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, numberingSystem: 'latn', timeZone: 'Asia/Amman' });
  return { date, time };
};
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true, numberingSystem: 'latn', timeZone: 'Asia/Amman' });

function filterBtn(active: boolean): string {
  return `h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`;
}

const EMPTY = 'لا زيارات في هذه الفترة بعد';
const Empty = () => <p className="text-xs text-slate-400 py-6 text-center">{EMPTY}</p>;

const DEVICE_LABEL: Record<string, string> = { mobile: 'جوال', desktop: 'حاسوب' };

// أعمق قسم وصل إليه الزائر: رقمه واسمه مع شريط من 10 خانات
function DepthCell({ n }: { n: number }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-900">{n > 0 ? <><span className="tabular-nums"><bdi>{n}</bdi></span> · {SECTION_NAMES[n - 1]}</> : <span className="text-slate-400">لم يصل إلى أي قسم</span>}</p>
      <div className="flex gap-0.5 mt-1 w-28" dir="ltr" aria-hidden="true">
        {SECTION_NAMES.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < n ? 'bg-teal-600' : 'bg-slate-200'}`} />)}
      </div>
    </div>
  );
}

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
  const { notice, setNotice } = useNotice();
  const [exporting, setExporting] = useState(false);

  // تنزيل Excel للفترة المختارة: نقرأ الاسم من ترويسة الرد ثم نُنزّل الملف عبر رابط مؤقت
  const downloadExcel = async () => {
    setExporting(true);
    try {
      const res = await adminFetch(`/api/admin/welcome-export?period=${period}`);
      if (!res.ok) throw new Error();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'vitalix-ads.xlsx';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ kind: 'err', text: 'تعذّر تنزيل ملف Excel' });
    } finally {
      setExporting(false);
    }
  };

  const [srcFilter, setSrcFilter] = useState('all');
  const [pageNo, setPageNo] = useState(1);
  const [visits, setVisits] = useState<VisitsPage | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(true);
  const [visitsError, setVisitsError] = useState('');
  const visitsReq = useRef(0);

  const loadVisits = async (p: Period, src: string, page: number) => {
    const id = ++visitsReq.current;
    try {
      const res = await adminFetch(`/api/admin/welcome-visits?period=${p}&src=${encodeURIComponent(src)}&page=${page}`);
      if (id !== visitsReq.current) return;
      if (!res.ok) throw new Error();
      setVisits(await res.json());
      setVisitsError('');
    } catch {
      if (id === visitsReq.current) setVisitsError('تعذّر تحميل الزيارات');
    } finally {
      if (id === visitsReq.current) setVisitsLoading(false);
    }
  };

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVisits(period, srcFilter, pageNo);
  }, [period, srcFilter, pageNo]);

  const row = (src: string) => data?.funnel.find(f => f.src === src);
  const a = row('fb-a'), b = row('fb-b');
  const v = verdict(a, b);
  const dropA = biggestDrop(a), dropB = biggestDrop(b);

  const mobilePct = (src: string) => fmtPct(mobileShare(data?.devices[src]));

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

  // إعلان بلا زيارات في الفترة: «—» بلا شريط (0.0% توحي بأن الزوار غادروا وهم لم يأتوا أصلاً)
  const bar = (r: FunnelRow | undefined, n: number, color: string) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden" dir="ltr">
        {r && <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, reached(r, n)))}%` }} />}
      </div>
      <span className="w-12 text-[11px] text-slate-600 tabular-nums text-end"><bdi>{r ? fmtPct(reached(r, n)) : '—'}</bdi></span>
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
        <div className="flex gap-1.5 shrink-0">
          <button type="button" onClick={downloadExcel} disabled={exporting}
            className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">
            <FileXls size={14} weight="bold" aria-hidden="true" />
            {exporting ? 'جارٍ التوليد…' : 'تنزيل Excel'}
          </button>
        <button type="button" onClick={() => { setRefreshing(true); load(period); loadVisits(period, srcFilter, pageNo); }} disabled={refreshing}
          className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 ">
          <ArrowClockwise size={14} weight="bold" aria-hidden="true" />
          تحديث
        </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {PERIODS.map(p => (
          <button key={p.v} type="button" onClick={() => { if (p.v !== period) { setLoading(true); setVisitsLoading(true); setPageNo(1); setPeriod(p.v); } }} className={filterBtn(period === p.v)}>{p.label}</button>
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
                          {bar(a, n, 'bg-teal-600')}
                          {bar(b, n, 'bg-slate-400')}
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

      <Card title="كل الزيارات">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {SRC_FILTERS.map(f => (
            <button key={f} type="button"
              onClick={() => { if (f !== srcFilter) { setVisitsLoading(true); setPageNo(1); setSrcFilter(f); } }}
              className={filterBtn(srcFilter === f)}>
              {f === 'all' ? 'الكل' : <span dir="ltr">{f}</span>}
            </button>
          ))}
        </div>
        {visitsError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs mb-3 flex items-center gap-2">
            <Warning size={16} weight="bold" aria-hidden="true" />{visitsError}
          </div>
        )}
        {visitsLoading && !visits ? (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" role="status" aria-label="جارٍ التحميل" />
          </div>
        ) : visits && (
          <div className={visitsLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <p className="text-xs text-slate-600 mb-3">عدد الزيارات: <b className="text-slate-900 tabular-nums"><bdi>{fmtNum(visits.total)}</bdi></b></p>
            {visits.visits.length === 0 ? <Empty /> : (
              <>
                <div className="hidden md:block">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        {['وقت الدخول', 'المصدر', 'الجهاز', 'الوقت الفعلي', 'مدة الفتح', 'أعمق قسم', 'واتساب'].map(h => <th key={h} className="py-2 pe-3 font-bold text-start">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {visits.visits.map(v => {
                        const e = fmtEntry(v.created_at);
                        const wa = v.wa_clicks.length > 0;
                        return (
                          <tr key={v.ref + v.created_at} className={`border-t ${wa ? 'bg-teal-50 border-teal-100' : 'border-slate-100'}`}>
                            <td className="py-2 pe-3 align-top"><div className="text-slate-900">{e.date}</div><div className="text-slate-500 tabular-nums"><bdi>{e.time}</bdi></div><div className="text-[10px] text-slate-400 tabular-nums" dir="ltr">{v.ref}</div></td>
                            <td className="py-2 pe-6 align-top"><span dir="ltr" className="inline-block rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 font-bold text-slate-900">{v.src}</span></td>
                            <td className="py-2 pe-3 align-top text-slate-700">{DEVICE_LABEL[v.device || ''] || '—'}</td>
                            <td className="py-2 pe-3 align-top tabular-nums text-slate-900"><bdi>{fmtSecs(v.active_seconds)}</bdi></td>
                            <td className="py-2 pe-3 align-top tabular-nums text-slate-900"><bdi>{fmtSecs((new Date(v.updated_at).getTime() - new Date(v.created_at).getTime()) / 1000)}</bdi></td>
                            <td className="py-2 pe-3 align-top"><DepthCell n={v.max_section} /></td>
                            <td className={`py-2 align-top ${wa ? 'font-bold text-teal-700' : 'text-slate-400'}`}>{waText(v.wa_clicks)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden space-y-2">
                  {visits.visits.map(v => {
                    const e = fmtEntry(v.created_at);
                    const wa = v.wa_clicks.length > 0;
                    return (
                      <div key={v.ref + v.created_at} className={`rounded-xl border p-3 text-xs ${wa ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div><div className="font-bold text-slate-900">{e.date}</div><div className="text-slate-500 tabular-nums"><bdi>{e.time}</bdi></div></div>
                          <div className="text-end"><div className="font-bold text-slate-900" dir="ltr">{v.src}</div><div className="text-slate-500">{DEVICE_LABEL[v.device || ''] || '—'}</div></div>
                        </div>
                        <dl className="space-y-1.5">
                          <div className="flex justify-between gap-2"><dt className="text-slate-500">الوقت الفعلي</dt><dd className="font-bold text-slate-900 tabular-nums"><bdi>{fmtSecs(v.active_seconds)}</bdi></dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-slate-500">مدة فتح الصفحة</dt><dd className="font-bold text-slate-900 tabular-nums"><bdi>{fmtSecs((new Date(v.updated_at).getTime() - new Date(v.created_at).getTime()) / 1000)}</bdi></dd></div>
                          <div><dt className="text-slate-500 mb-1">أعمق قسم</dt><dd><DepthCell n={v.max_section} /></dd></div>
                          <div className="flex justify-between gap-2"><dt className="text-slate-500">واتساب</dt><dd className={wa ? 'font-bold text-teal-700' : 'text-slate-400'}>{waText(v.wa_clicks)}</dd></div>
                        </dl>
                        <p className="text-[10px] text-slate-400 mt-2 tabular-nums" dir="ltr">{v.ref}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 mt-4">
                  <button type="button" disabled={pageNo <= 1 || visitsLoading} onClick={() => { setVisitsLoading(true); setPageNo(pageNo - 1); }}
                    className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">السابق</button>
                  <span className="text-xs text-slate-600">صفحة <b className="tabular-nums"><bdi>{pageNo}</bdi></b> من <b className="tabular-nums"><bdi>{Math.max(1, Math.ceil(visits.total / visits.page_size))}</bdi></b></span>
                  <button type="button" disabled={pageNo >= Math.ceil(visits.total / visits.page_size) || visitsLoading} onClick={() => { setVisitsLoading(true); setPageNo(pageNo + 1); }}
                    className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed">التالي</button>
                </div>
              </>
            )}
          </div>
        )}
      </Card>
      <Toast notice={notice} />
    </div>
  );
}
