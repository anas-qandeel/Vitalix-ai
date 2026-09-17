'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * نافذة تأكيد داخل المنصة بدل window.confirm() المتصفح.
 * useConfirm() يعطي دالة confirm(options) تعيد Promise<boolean> (نعم/لا) وعنصر dialog يُرسم مرة في الصفحة.
 * التصميم مطابق لنافذة حذف الكتالوج. لا منطق أعمال هنا.
 */
export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean; // أحمر للأفعال الحاسمة (حذف/أرشفة)، وإلا تركوازي
};

type DialogProps = ConfirmOptions & { onConfirm: () => void; onCancel: () => void };

export default function ConfirmDialog({ title, message, confirmText = 'تأكيد', cancelText = 'إلغاء', destructive = false, onConfirm, onCancel }: DialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 p-6 text-center" onClick={e => e.stopPropagation()}>
        <h4 id="confirm-title" className="text-sm font-bold text-slate-900 mb-2">{title}</h4>
        {message && <p className="text-xs text-slate-500 mb-6">{message}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel}
            className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
            {cancelText}
          </button>
          <button type="button" onClick={onConfirm} autoFocus
            className={`h-10 flex items-center justify-center rounded-lg text-white text-sm font-medium shadow-sm transition-all cursor-pointer ${destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-600 hover:bg-teal-700'}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current = resolve;
    setOpts(o);
  }), []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  const dialog = opts ? <ConfirmDialog {...opts} onConfirm={() => close(true)} onCancel={() => close(false)} /> : null;
  return { confirm, dialog };
}
