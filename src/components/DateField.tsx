'use client';

import { useRef, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { formatIsoAsDmy, maskTypedDate, parseDmyToIso } from '@/lib/date-input';

type Props = {
  value: string; // yyyy-mm-dd أو فراغ
  onChange: (iso: string) => void; // yyyy-mm-dd، أو فراغ إن كان الإدخال ناقصاً أو غير صالح
  min?: string; // yyyy-mm-dd — للمنتقي ولتلوين الحقل فقط؛ الرفض الفعلي يبقى عند الحفظ
  max?: string;
  className?: string; // أصناف حقل النص (نفس أصناف الحقول القديمة)
  placeholder?: string;
  onInvalidChange?: (invalid: boolean) => void; // true حين يكون الإدخال غير فارغ وغير صالح (ناقص أو مستحيل)
};

const DEFAULT_CLASS =
  'w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900';

// حقل تاريخ يوم/شهر/سنة: الكتابة dd/mm/yyyy بشرطات تلقائية وأرقام عربية مقبولة، والقيمة المُرجعة yyyy-mm-dd.
export default function DateField({ value, onChange, min, max, className, placeholder = 'DD/MM/YYYY', onInvalidChange }: Props) {
  const [text, setText] = useState(() => formatIsoAsDmy(value));
  const pickerRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  // قيمة تغيّرت من الخارج (تحميل بيانات، تفريغ نموذج): تُعرض. أما ما كتبه المستخدم نفسه فلا يُستبدل.
  // تُضبط الحالة أثناء الرسم لا داخل effect (النمط الموصى به في React، ويتفادى رسماً ثانياً).
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== parseDmyToIso(text)) setText(formatIsoAsDmy(value));
  }

  const iso = parseDmyToIso(text);
  const impossible = text.length === 10 && !iso;
  const incomplete = touched && text.length > 0 && text.length < 10;
  const outOfRange = !!iso && ((!!min && iso < min) || (!!max && iso > max));

  const handleText = (raw: string) => {
    const next = maskTypedDate(text, raw);
    setText(next);
    onInvalidChange?.(next.length > 0 && !parseDmyToIso(next));
    setTouched(false);
    onChange(parseDmyToIso(next));
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };

  return (
    <div>
      <div className="relative flex items-stretch gap-1.5">
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          maxLength={10}
          value={text}
          placeholder={placeholder}
          onChange={e => handleText(e.target.value)}
          onBlur={() => setTouched(true)}
          className={`${className ?? DEFAULT_CLASS} flex-1 min-w-0 text-right tabular-nums ${impossible || outOfRange ? 'ring-1 ring-rose-400' : ''}`}
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label="اختيار التاريخ من التقويم"
          className="w-9 shrink-0 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
        >
          <CalendarBlank size={16} weight="bold" aria-hidden="true" />
        </button>
        {/* منتقي التاريخ الأصلي: مخفي، يُفتح بزر التقويم، وقيمته yyyy-mm-dd دائماً فلا لبس في الصيغة */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={formatIsoAsDmy(value) ? value.slice(0, 10) : ''}
          min={min}
          max={max}
          onChange={e => { onChange(e.target.value); setText(formatIsoAsDmy(e.target.value)); onInvalidChange?.(false); }}
          className="absolute inset-0 opacity-0 pointer-events-none"
        />
      </div>
      {impossible && <p className="text-[11px] text-rose-600 mt-1">تاريخ غير صالح</p>}
      {incomplete && <p className="text-[11px] text-slate-400 mt-1">أكمل التاريخ: يوم/شهر/سنة</p>}
    </div>
  );
}
