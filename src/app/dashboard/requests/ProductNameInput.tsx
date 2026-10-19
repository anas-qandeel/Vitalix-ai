'use client';

import { useId, useMemo, useState } from 'react';
import { frequentHint, indexStats, isFrequent, normalizeProductName, suggestNames, type ProductStat } from '@/lib/frequent-products';
import { INPUT_BASE } from './shared';

// حقل اسم الصنف مع اقتراح أسماء سبق طلبها في هذه الصيدلية. قائمة مخصّصة لا <datalist> لأن datalist
// يرشّح بالنص الخام فيخفي «أسبرين» عند كتابة «اسبرين»، والمطابقة هنا بعد التطبيع (همزات وتاء مربوطة وغيرها).
// كل المعالجة في الذاكرة على قائمة محمّلة مسبقاً: لا استعلام ولا debounce أثناء الكتابة.

interface Props {
  value: string;
  onChange: (v: string) => void;
  // سلوك Enter الحالي عند المستدعي (إضافة صف أو حفظ الصنف) حين لا يوجد اقتراح مظلَّل
  onEnter: () => void;
  stats: ProductStat[];
  ariaLabel: string;
  maxLength: number;
  autoFocus?: boolean;
}

export default function ProductNameInput({ value, onChange, onEnter, stats, ariaLabel, maxLength, autoFocus }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const suggestions = useMemo(() => suggestNames(stats, value), [stats, value]);
  const shown = open && suggestions.length > 0;

  const close = () => { setOpen(false); setHighlighted(-1); };
  const pick = (s: ProductStat) => { onChange(s.display_name); close(); };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // أثناء التركيب (لوحة مفاتيح IME) Enter يثبّت الحرف ولا يعني إضافة أو حفظاً
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      if (!shown) { setOpen(true); setHighlighted(0); return; }
      setHighlighted(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      if (!shown) return;
      e.preventDefault();
      // الرجوع إلى «بلا تظليل» ممكن كي يعود Enter إلى سلوكه المعتاد
      setHighlighted(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = shown && highlighted >= 0 ? suggestions[highlighted] : undefined;
      if (target) pick(target);
      else onEnter();
    } else if (e.key === 'Escape' && shown) {
      // يغلق القائمة وحدها: نافذة الطلب تستمع إلى Escape على مستوى المستند فلا يجوز أن يصلها
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input type="text" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={handleKeyDown}
        role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={shown && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        aria-label={ariaLabel} placeholder="اسم الصنف" maxLength={maxLength} autoFocus={autoFocus}
        className={`${INPUT_BASE} w-full`} />
      {shown && (
        <ul id={listId} role="listbox"
          className="absolute inset-x-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {suggestions.map((s, idx) => (
            // onMouseDown + preventDefault: يبقى التركيز في الحقل فلا يُغلق blur القائمة قبل وصول النقر
            <li key={s.name_key} id={`${listId}-${idx}`} role="option" aria-selected={idx === highlighted}
              onMouseDown={e => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setHighlighted(idx)}
              className={`flex items-center justify-between gap-2 px-3.5 py-2 text-sm text-slate-900 cursor-pointer transition-colors ${idx === highlighted ? 'bg-slate-50' : 'bg-white'}`}>
              <span className="truncate min-w-0"><bdi>{s.display_name}</bdi></span>
              {isFrequent(s) && (
                <span className="shrink-0 text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-md">مطلوب بكثرة</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// تلميح مخزون يُرسم تحت صف الصنف (خارج صف flex) حين يطابق الاسم المكتوب صنفاً مطلوباً بكثرة؛ نصيحة للصيدلاني وحده
export function ProductHint({ value, stats }: { value: string; stats: ProductStat[] }) {
  const index = useMemo(() => indexStats(stats), [stats]);
  const text = frequentHint(index.get(normalizeProductName(value)));
  if (!text) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-medium text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-2.5 py-1.5 leading-relaxed">
      <svg className="w-3.5 h-3.5 shrink-0 mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
      <span>{text}</span>
    </p>
  );
}
