'use client';

import { useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';

// لافتة تعريفية بتغيير كتابة التواريخ إلى يوم/شهر/سنة: تظهر لكل مستخدم في أول دخولين منفصلين.
// يُحصى الضغط على «فهمت» لا مرات الظهور، ولا تعود داخل الدخول نفسه (يُميَّز بـlast_sign_in_at).
// التخزين في المتصفح (لكل مستخدم وجهاز) فلا هجرة.
const MAX_ACKS = 2;
const storageKey = (userId: string) => `vx_date_notice_v1:${userId}`;

type Stored = { count: number; lastLogin: string };
const EMPTY: Stored = { count: 0, lastLogin: '' };

function readStored(userId: string): Stored {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    return {
      count: typeof p?.count === 'number' && p.count >= 0 ? p.count : 0,
      lastLogin: typeof p?.lastLogin === 'string' ? p.lastLogin : '',
    };
  } catch {
    return EMPTY;
  }
}

export default function DateFormatNotice({ userId, loginStamp }: { userId: string; loginStamp: string }) {
  // يُركَّب بعد تحميل الصفحة على المتصفح فقط، فقراءة التخزين المحلي في القيمة الابتدائية آمنة
  const [stored, setStored] = useState<Stored>(() => readStored(userId));
  const [dismissed, setDismissed] = useState(false);

  const ackedThisLogin = !!loginStamp && stored.lastLogin === loginStamp;
  if (dismissed || stored.count >= MAX_ACKS || ackedThisLogin) return null;

  const isReminder = stored.count >= 1;

  const acknowledge = () => {
    const next: Stored = { count: stored.count + 1, lastLogin: loginStamp };
    try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch { }
    setStored(next);
    setDismissed(true);
  };

  return (
    <div dir="rtl" role="dialog" aria-modal="true" aria-labelledby="date-notice-title"
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9990] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
            <CalendarBlank size={20} weight="bold" className="text-teal-700" aria-hidden="true" />
          </div>
          <h3 id="date-notice-title" className="text-base font-bold text-slate-900">
            {isReminder ? 'تذكير: تغيير في كتابة التواريخ' : 'تغيير في كتابة التواريخ'}
          </h3>
        </div>
        <div className="space-y-2.5 text-sm text-slate-700 leading-relaxed">
          <p>صارت التواريخ في كل الحقول تُكتب <b>يوم / شهر / سنة</b>، مثل <bdi dir="ltr" className="font-bold">05/10/2026</bdi> أي الخامس من أكتوبر.</p>
          <p>كان بعضها يظهر عندك شهراً ثم يوماً، فانتبه إلى الترتيب الجديد عند إدخال تاريخ ميلاد أو تاريخ صرف دواء.</p>
          <p>إن لم تستطع الكتابة فاضغط أيقونة التقويم بجانب الحقل.</p>
        </div>
        <button type="button" onClick={acknowledge} autoFocus
          className="mt-5 w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold cursor-pointer transition-colors">
          فهمت
        </button>
      </div>
    </div>
  );
}
