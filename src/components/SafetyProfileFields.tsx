'use client';

import { useState } from 'react';
import type { ClinicalProfile, AllergenTag, ConditionTag, RelevanceTag, SafetyLevel } from '@/lib/product-suitability';
import { ALLERGEN_TAGS, ALLERGEN_LABELS_AR, CONDITION_TAGS, RELEVANCE_TAGS } from '@/lib/product-suitability';

const CONDITION_LABELS_AR: Record<ConditionTag, string> = { hypertension: 'ضغط الدم', diabetes: 'السكري' };
const RELEVANCE_LABELS_AR: Record<RelevanceTag, string> = { diabetes: 'السكري', hypertension: 'ضغط الدم', weight: 'الوزن' };
const SAFETY_LABELS_AR: Record<SafetyLevel, string> = { safe: 'آمن', caution: 'بحذر', avoid: 'ممنوع', unknown: 'غير معروف' };
const SAFETY_LEVELS: SafetyLevel[] = ['safe', 'caution', 'avoid', 'unknown'];

// درجة ثقة الذكاء الاصطناعي في الحقل — ظاهرة ككلمة لا نقطة، كي لا تُقرأ كحكم أمان
function ConfidenceDot({ level }: { level?: 'high' | 'medium' | 'low' }) {
  if (!level) return null;
  const meta = level === 'high'
    ? { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'ثقة عالية' }
    : level === 'medium'
    ? { cls: 'bg-amber-50 text-amber-700 border-amber-200', label: 'ثقة متوسطة — راجعه' }
    : { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: 'ثقة منخفضة — راجعه' };
  return (
    <span className={`inline-block text-[9px] font-bold px-1.5 py-px rounded border ${meta.cls}`} title="مدى ثقة الذكاء الاصطناعي في هذا الحقل — القرار النهائي للصيدلاني">
      {meta.label}
    </span>
  );
}

function FieldLabel({ text, confidence }: { text: string; confidence?: 'high' | 'medium' | 'low' }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-1.5">
      {text}
      <ConfidenceDot level={confidence} />
    </label>
  );
}

/** الحقول التسعة لبطاقة الأمان — قابلة للتعديل اليدوي، مع نقطة ثقة بجانب كل حقل ملأه الذكاء الاصطناعي */
export default function SafetyProfileFields({ profile, onChange }: {
  profile: ClinicalProfile;
  onChange: (next: ClinicalProfile) => void;
}) {
  const [ingredientDraft, setIngredientDraft] = useState('');
  const set = (patch: Partial<ClinicalProfile>) => onChange({ ...profile, ...patch });
  const conf = profile.confidence ?? {};

  const toggleAllergen = (tag: AllergenTag) => {
    const cur = profile.allergen_tags ?? [];
    set({ allergen_tags: cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag] });
  };
  const toggleCondition = (tag: ConditionTag) => {
    const cur = profile.avoid_with_conditions ?? [];
    set({ avoid_with_conditions: cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag] });
  };
  const toggleRelevance = (tag: RelevanceTag) => {
    const cur = profile.relevant_to_conditions ?? [];
    set({ relevant_to_conditions: cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag] });
  };
  const addIngredient = () => {
    const v = ingredientDraft.trim();
    if (!v) return;
    set({ active_ingredients: [...(profile.active_ingredients ?? []), v] });
    setIngredientDraft('');
  };

  return (
    <div className="space-y-4">
      <div>
        <FieldLabel text="المكونات الفعالة" confidence={conf.active_ingredients} />
        {(profile.active_ingredients ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(profile.active_ingredients ?? []).map(ing => (
              <span key={ing} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs">
                {ing}
                <button type="button" onClick={() => set({ active_ingredients: (profile.active_ingredients ?? []).filter(i => i !== ing) })}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer leading-none">✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input type="text" value={ingredientDraft} onChange={e => setIngredientDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } }}
            placeholder="مكوّن — ثم Enter"
            className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
          <button type="button" onClick={addIngredient} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold cursor-pointer">إضافة</button>
        </div>
      </div>

      <div>
        <FieldLabel text="المسببات التي يحويها" confidence={conf.allergen_tags} />
        <div className="grid grid-cols-2 gap-1.5">
          {ALLERGEN_TAGS.map(tag => {
            const active = (profile.allergen_tags ?? []).includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleAllergen(tag)}
                className={`text-xs font-bold px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${active ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {ALLERGEN_LABELS_AR[tag]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel text="الحمل" confidence={conf.pregnancy} />
          <select value={profile.pregnancy ?? 'unknown'} onChange={e => set({ pregnancy: e.target.value as SafetyLevel })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900">
            {SAFETY_LEVELS.map(s => <option key={s} value={s}>{SAFETY_LABELS_AR[s]}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel text="الرضاعة" confidence={conf.lactation} />
          <select value={profile.lactation ?? 'unknown'} onChange={e => set({ lactation: e.target.value as SafetyLevel })}
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900">
            {SAFETY_LEVELS.map(s => <option key={s} value={s}>{SAFETY_LABELS_AR[s]}</option>)}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel text="غير مناسب لمرضى" confidence={conf.avoid_with_conditions} />
        <div className="grid grid-cols-2 gap-1.5">
          {CONDITION_TAGS.map(tag => {
            const active = (profile.avoid_with_conditions ?? []).includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleCondition(tag)}
                className={`text-xs font-bold px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {CONDITION_LABELS_AR[tag]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel text="يفيد مرضى" confidence={conf.relevant_to_conditions} />
        <div className="grid grid-cols-3 gap-1.5">
          {RELEVANCE_TAGS.map(tag => {
            const active = (profile.relevant_to_conditions ?? []).includes(tag);
            return (
              <button key={tag} type="button" onClick={() => toggleRelevance(tag)}
                className={`text-xs font-bold px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${active ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {RELEVANCE_LABELS_AR[tag]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([['contains_sugar', 'يحوي سكراً', conf.contains_sugar], ['contains_sodium', 'يحوي صوديوم', conf.contains_sodium], ['contains_caffeine', 'يحوي كافيين', conf.contains_caffeine]] as const).map(([key, label, c]) => (
          <div key={key}>
            <FieldLabel text={label} confidence={c} />
            <button type="button" onClick={() => set({ [key]: profile[key] === true ? false : true } as Partial<ClinicalProfile>)}
              className={`w-full text-xs font-bold px-2 py-2 rounded-lg border transition-all cursor-pointer ${profile[key] === true ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>
              {profile[key] === true ? 'نعم' : profile[key] === false ? 'لا' : '—'}
            </button>
          </div>
        ))}
      </div>

      <div>
        <FieldLabel text="أقل عمر مسموح (سنة)" />
        <input type="number" value={profile.min_age_years ?? ''} onChange={e => set({ min_age_years: e.target.value ? Number(e.target.value) : null })}
          placeholder="بلا حد أدنى"
          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
      </div>

      <div>
        <FieldLabel text="يتداخل مع أدوية (الاسم العلمي)" confidence={conf.interacts_with_generics} />
        <input type="text" value={(profile.interacts_with_generics ?? []).join('، ')}
          onChange={e => set({ interacts_with_generics: e.target.value.split(/[،,]/).map(s => s.trim()).filter(Boolean) })}
          placeholder="مثال: warfarin، metformin"
          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
      </div>

      <div>
        <FieldLabel text="ملاحظة للصيدلاني" />
        <textarea value={profile.notes_for_pharmacist ?? ''} onChange={e => set({ notes_for_pharmacist: e.target.value })} rows={2}
          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 resize-none" />
      </div>
    </div>
  );
}
