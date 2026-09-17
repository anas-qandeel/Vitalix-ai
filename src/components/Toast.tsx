'use client';

import { useEffect, useState } from 'react';

/**
 * رسالة عائمة داخل المنصة بدل alert() المتصفح.
 * useNotice() يعطي الحالة ودالة الضبط؛ <Toast notice={notice} /> يرسمها أسفل الشاشة
 * وتختفي تلقائياً بعد 4.5 ثوانٍ. لا منطق أعمال هنا.
 */
export type Notice = { kind: 'ok' | 'err'; text: string } | null;

export function useNotice(autoHideMs = 4500) {
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), autoHideMs);
    return () => clearTimeout(t);
  }, [notice, autoHideMs]);
  return { notice, setNotice };
}

export default function Toast({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return (
    <div role="status" aria-live="polite"
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] max-w-[92vw] px-4 py-2.5 rounded-xl shadow-lg border text-sm font-bold saas-fade-in ${notice.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
      {notice.text}
    </div>
  );
}
