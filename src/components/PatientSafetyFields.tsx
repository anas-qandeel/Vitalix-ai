'use client';

import { useState } from 'react';

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════
export interface PatientSafetyValues {
  drug_allergies: string[];
  food_allergies: string[];
  is_pregnant: boolean;
  is_lactating: boolean;
}

export const EMPTY_PATIENT_SAFETY: PatientSafetyValues = {
  drug_allergies: [],
  food_allergies: [],
  is_pregnant: false,
  is_lactating: false,
};

/** يجهّز القيم للحفظ: الحمل/الرضاعة لا تُحفظ إلا للإناث */
export function safetyForSave(values: PatientSafetyValues, gender: string): PatientSafetyValues {
  const female = gender === 'female';
  return {
    drug_allergies: values.drug_allergies,
    food_allergies: values.food_allergies,
    is_pregnant: female && values.is_pregnant,
    is_lactating: female && values.is_lactating,
  };
}

interface PatientSafetyFieldsProps {
  value: PatientSafetyValues;
  onChange: (next: PatientSafetyValues) => void;
  /** 'male' | 'female' — حقول الحمل والرضاعة تظهر للإناث فقط */
  gender: string;
}

// ═══════════════════════════════════════════════════════
// ChipInput — قائمة شرائح نصية (إضافة بـ Enter أو زر، حذف بـ ✕)
// ═══════════════════════════════════════════════════════
function ChipInput({ label, placeholder, items, onChange }: {
  label: string; placeholder: string; items: string[]; onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const parts = draft.split(/[،,]/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...items];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft('');
  };

  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1.5">{label} <span className="font-normal text-slate-400">(اختياري)</span></label>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {items.map(item => (
            <span key={item} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
              {item}
              <button type="button" onClick={() => onChange(items.filter(i => i !== item))}
                className="text-rose-400 hover:text-rose-700 cursor-pointer leading-none" aria-label="حذف">✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
        <button type="button" onClick={add} disabled={!draft.trim()}
          className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-40 cursor-pointer">إضافة</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// PatientSafetyFields — حساسية الأدوية/الأطعمة + الحمل/الرضاعة
// ═══════════════════════════════════════════════════════
export default function PatientSafetyFields({ value, onChange, gender }: PatientSafetyFieldsProps) {
  const set = (patch: Partial<PatientSafetyValues>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <ChipInput label="حساسية من أدوية" placeholder="مثال: بنسلين — ثم Enter"
        items={value.drug_allergies} onChange={drug_allergies => set({ drug_allergies })} />
      <ChipInput label="حساسية من أطعمة" placeholder="مثال: مكسرات — ثم Enter"
        items={value.food_allergies} onChange={food_allergies => set({ food_allergies })} />

      {gender === 'female' && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2">حالة خاصة <span className="font-normal text-slate-400">(اختياري)</span></label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'is_pregnant' as const, label: 'حامل' },
              { key: 'is_lactating' as const, label: 'مرضعة' },
            ].map(({ key, label }) => {
              const active = value[key];
              return (
                <button key={key} type="button" onClick={() => set({ [key]: !active })}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <span>{active ? '✓ ' : ''}{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
