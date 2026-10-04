'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowClockwise } from '@phosphor-icons/react';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';

// مراقبة الذكاء — أعطال الذكاء الاصطناعي والرسائل الاحتياطية في كل الصيدليات.
// للمالك والدعم فقط: القيد في ROUTE_ROLES (الـlayout) وفي المسار /api/admin/ai-monitor.

type Period = '24h' | '7d' | '30d';
type FeatureFilter = 'all' | 'vitals_report' | 'weight_plan' | 'catalog_profile';
type OutcomeFilter = 'all' | 'failed' | 'fallback';

interface AiEvent {
  id: string;
  created_at: string;
  pharmacy_id: string;
  pharmacy_name: string;
  feature: string;
  step: string;
  model: string;
  outcome: 'failed' | 'fallback';
  error_status: number | null;
  error_message: string | null;
}

interface MonitorData {
  counts: { used: number; discarded: number; failed: number; fallback: number };
  events: AiEvent[];
}

const PERIODS: Array<{ v: Period; label: string }> = [
  { v: '24h', label: '24 ساعة' },
  { v: '7d', label: '7 أيام' },
  { v: '30d', label: '30 يوماً' },
];
const FEATURES: Array<{ v: FeatureFilter; label: string }> = [
  { v: 'all', label: 'الكل' },
  { v: 'vitals_report', label: 'الملخّص الذكي' },
  { v: 'weight_plan', label: 'خطة الوزن' },
  { v: 'catalog_profile', label: 'بطاقة الأمان' },
];
const OUTCOMES: Array<{ v: OutcomeFilter; label: string }> = [
  { v: 'all', label: 'الكل' },
  { v: 'failed', label: 'فشل' },
  { v: 'fallback', label: 'نص احتياطي' },
];
const FEATURE_LABEL: Record<string, string> = {
  vitals_report: 'الملخّص الذكي',
  weight_plan: 'خطة الوزن',
  catalog_profile: 'بطاقة الأمان',
};
const STEP_LABEL: Record<string, string> = {
  raw: 'الرسالة',
  compress: 'المحرر',
  summary: 'ملخّص الصيدلاني',
  plan: 'الخطة',
  profile: 'البطاقة',
  final: 'النص الاحتياطي',
};

// الوقت بتوقيت عمّان صراحة — ليرى الدعم الوقت نفسه أينما كان
function fmtAmman(x: string): string {
  return new Date(x).toLocaleString('en-GB', {
    timeZone: 'Asia/Amman', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}

function filterBtn(active: boolean): string {
  return `h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`;
}

export default function AiMonitorPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [feature, setFeature] = useState<FeatureFilter>('all');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { notice, setNotice } = useNotice();
  const reqId = useRef(0);

  const load = async () => {
    const id = ++reqId.current;
    setRefreshing(true);
    const params = new URLSearchParams({ period });
    if (feature !== 'all') params.set('feature', feature);
    if (outcome !== 'all') params.set('outcome', outcome);
    try {
      const res = await adminFetch(`/api/admin/ai-monitor?${params.toString()}`);
      if (id !== reqId.current) return;
      if (!res.ok) {
        setNotice({ kind: 'err', text: 'تعذّر جلب بيانات المراقبة' });
      } else {
        const json = await res.json();
        if (id !== reqId.current) return;
        setData(json);
      }
    } catch {
      if (id === reqId.current) setNotice({ kind: 'err', text: 'تعذّر جلب بيانات المراقبة' });
    }
    if (id === reqId.current) {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, feature, outcome]);

  const c = data?.counts;
  const calls = c ? c.used + c.discarded + c.failed : 0;
  const rate = c && calls > 0 ? `${((c.used / calls) * 100).toFixed(1)}%` : '—';

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">مراقبة الذكاء</h1>
          <p className="text-xs text-slate-500 mt-1">أعطال الذكاء الاصطناعي والرسائل الاحتياطية في كل الصيدليات.</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={refreshing}
          className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 shrink-0"
        >
          <ArrowClockwise size={14} weight="bold" aria-hidden="true" />
          تحديث
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map(p => (
            <button key={p.v} type="button" onClick={() => setPeriod(p.v)} className={filterBtn(period === p.v)}>{p.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FEATURES.map(f => (
            <button key={f.v} type="button" onClick={() => setFeature(f.v)} className={filterBtn(feature === f.v)}>{f.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map(o => (
            <button key={o.v} type="button" onClick={() => setOutcome(o.v)} className={filterBtn(outcome === o.v)}>{o.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">جارٍ التحميل…</p>
      ) : (
        <>
          {c && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="font-bold text-lg text-slate-900">{c.used}</p>
                <p className="text-[10px] text-slate-500">استدعاءات ناجحة</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className={`font-bold text-lg ${c.failed > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{c.failed}</p>
                <p className="text-[10px] text-slate-500">استدعاءات فاشلة</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className={`font-bold text-lg ${c.fallback > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{c.fallback}</p>
                <p className="text-[10px] text-slate-500">رسائل احتياطية</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="font-bold text-lg text-slate-900"><bdi>{rate}</bdi></p>
                <p className="text-[10px] text-slate-500">نسبة النجاح</p>
              </div>
            </div>
          )}

          {!data || data.events.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-16 flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-slate-400">لا أعطال في هذه الفترة.</p>
            </div>
          ) : (
            data.events.map(ev => (
              <div key={ev.id} className="bg-white border border-slate-200 rounded-xl p-4 mb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/pharmacies/${ev.pharmacy_id}`} className="text-sm font-bold text-slate-900 hover:text-teal-700">
                      {ev.pharmacy_name}
                    </Link>
                    <p className="text-xs text-slate-600 mt-0.5">{FEATURE_LABEL[ev.feature] ?? ev.feature}</p>
                    <p className="text-[11px] text-slate-400">{STEP_LABEL[ev.step] ?? ev.step}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] rounded-md px-1.5 py-0.5 border ${ev.outcome === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {ev.outcome === 'failed' ? 'فشل' : 'نص احتياطي'}
                    </span>
                    <span className="text-[11px] text-slate-400"><bdi>{fmtAmman(ev.created_at)}</bdi></span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 space-y-0.5">
                  <p>
                    <span dir="ltr">{ev.model}</span>
                    {' · '}
                    {ev.error_status ? <>رمز <bdi>{ev.error_status}</bdi></> : 'بلا رمز'}
                  </p>
                  {ev.error_message && (
                    <p dir="ltr" className="font-mono text-slate-400 truncate" title={ev.error_message}>{ev.error_message}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </>
      )}

      <Toast notice={notice} />
    </div>
  );
}
