'use client';

import { useEffect, useState } from 'react';
import { Package, X } from '@phosphor-icons/react';

// صورة منتج صغيرة: تظهر الصورة إن وُجدت ونجح تحميلها، وإلا أيقونة عامة — فلا يبقى مربع مكسور.
// الضغط على الصورة يفتحها مكبّرة، وتُغلق بالضغط خارجها أو على زر الإغلاق أو بمفتاح Esc.
export default function ProductThumb({ url, name }: { url: string | null | undefined; name: string }) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const hasImage = !!url && !broken;

  // أثناء فتح الصورة المكبّرة: لا تتحرك الصفحة خلفها، ومفتاح Esc يغلقها
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!hasImage) {
    return (
      <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center shrink-0">
        <Package size={24} weight="bold" className="text-slate-300" aria-hidden="true" />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`تكبير صورة ${name}`}
        className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 overflow-hidden shrink-0 cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url as string} alt={name} loading="lazy" onError={() => { setBroken(true); setOpen(false); }} className="w-full h-full object-cover" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          className="fixed inset-0 z-[80] bg-slate-900/80 flex flex-col items-center justify-center gap-3 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق"
            className="absolute top-4 left-4 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 flex items-center justify-center cursor-pointer"
          >
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url as string}
            alt={name}
            className="max-w-full max-h-[80vh] rounded-xl object-contain bg-white"
            onClick={e => e.stopPropagation()}
          />
          <p className="text-sm font-bold text-white text-center" dir="auto">{name}</p>
        </div>
      )}
    </>
  );
}
