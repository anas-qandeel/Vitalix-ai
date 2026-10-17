'use client';

import { useMemo } from 'react';
import {
  FREQUENT_MIN_REQUESTS, FREQUENT_WINDOW_DAYS, formatRequestDate, isFrequent, patientsLabel, timesLabel, windowPhrase,
  type ProductStat,
} from '@/lib/frequent-products';

// قسم «أصناف يُنصح بتوفيرها»: نصيحة مخزون للصيدلاني من عدّ الطلبات المختلفة، مرئي لكل الموظفين
// وحتى في الاشتراك للقراءة فقط لأنه قراءة بحتة. الفشل هنا استشاري: رابط إعادة محاولة بلا إشعار حاجب.

function IconArchiveBox({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

export default function FrequentProductsPanel({ stats, failed, onRetry }: {
  stats: ProductStat[] | null; // null = لم يكتمل التحميل بعد
  failed: boolean;
  onRetry: () => void;
}) {
  const frequent = useMemo(() => {
    if (!stats) return [];
    return stats.filter(isFrequent).sort((a, b) =>
      b.requests_in_window - a.requests_in_window
      || new Date(b.last_requested_at).getTime() - new Date(a.last_requested_at).getTime());
  }, [stats]);

  return (
    <section className="space-y-3 saas-slide-up" aria-labelledby="frequent-products-title">
      <div>
        <h2 id="frequent-products-title" className="text-base font-bold text-slate-900">أصناف يُنصح بتوفيرها</h2>
        <p className="text-xs text-slate-500 mt-1">
          أصناف طُلبت في <span className="tabular-nums">{FREQUENT_MIN_REQUESTS}</span> طلبات مختلفة أو أكثر خلال {windowPhrase()}.
        </p>
      </div>

      {failed && !stats ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-10 text-center shadow-sm px-6">
          <p className="text-sm font-medium text-slate-600">تعذّر تحميل الأصناف المطلوبة بكثرة.</p>
          <button type="button" onClick={onRetry}
            className="mt-3 text-xs font-bold text-teal-700 hover:text-teal-800 underline underline-offset-2 cursor-pointer">
            إعادة المحاولة
          </button>
        </div>
      ) : !stats ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">جاري التحميل...</p>
        </div>
      ) : frequent.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-14 text-center shadow-sm px-6">
          <IconArchiveBox className="w-8 h-8 mx-auto text-slate-300" />
          <p className="text-sm font-bold text-slate-700 mt-3">
            لا أصناف متكررة خلال آخر <span className="tabular-nums">{FREQUENT_WINDOW_DAYS}</span> يوماً
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {failed && (
            <p className="text-[11px] text-slate-500">
              تعذّر تحديث القائمة، والمعروض آخر نسخة محمّلة.{' '}
              <button type="button" onClick={onRetry} className="font-bold text-teal-700 underline underline-offset-2 cursor-pointer">إعادة المحاولة</button>
            </p>
          )}
          {frequent.map(p => (
            <div key={p.name_key} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
              <p className="text-sm font-bold text-slate-900 break-words" dir="auto">{p.display_name}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-md border text-teal-700 bg-teal-50 border-teal-100 tabular-nums">
                  طُلب {timesLabel(p.requests_in_window)}
                </span>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md border text-slate-700 bg-slate-50 border-slate-200 tabular-nums">
                  {patientsLabel(p.patients_in_window)}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">آخر طلب {formatRequestDate(p.last_requested_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
