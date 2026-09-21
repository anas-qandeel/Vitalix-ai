'use client';

import type { ClinicalProfile } from '@/lib/product-suitability';
import { ALLERGEN_LABELS_AR } from '@/lib/product-suitability';

const CONDITION_LABELS_AR: Record<string, string> = { hypertension: 'ضغط الدم', diabetes: 'السكري' };
const LEVEL_LABELS_AR: Record<string, string> = { safe: 'آمن', caution: 'بحذر', avoid: 'ممنوع', unknown: 'غير معروف' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 shrink-0">{label}</span>
      <span className="text-xs font-bold text-slate-800 text-left">{children}</span>
    </div>
  );
}

/** عرض كامل وقراءة فقط لبطاقة الأمان — يُستخدم في نافذة "عرض" من الكتالوج، بلا أي إمكانية تعديل أو حفظ */
export default function SafetyProfileFull({ profile }: { profile: ClinicalProfile }) {
  const allergens = profile.allergen_tags ?? [];
  const interactions = profile.interacts_with_generics ?? [];
  const conditions = profile.avoid_with_conditions ?? [];
  const ingredients = profile.active_ingredients ?? [];

  return (
    <div className="px-1">
      {ingredients.length > 0 && <Row label="المكوّنات الفعّالة">{ingredients.join('، ')}</Row>}
      <Row label="الحمل">{LEVEL_LABELS_AR[profile.pregnancy ?? 'unknown']}</Row>
      <Row label="الرضاعة">{LEVEL_LABELS_AR[profile.lactation ?? 'unknown']}</Row>
      {profile.min_age_years != null && <Row label="الحد الأدنى للعمر">{profile.min_age_years} سنة</Row>}
      <Row label="يحتوي سكراً">{profile.contains_sugar == null ? 'غير معروف' : profile.contains_sugar ? 'نعم' : 'لا'}</Row>
      <Row label="يحتوي صوديوم">{profile.contains_sodium == null ? 'غير معروف' : profile.contains_sodium ? 'نعم' : 'لا'}</Row>
      <Row label="يحتوي كافيين">{profile.contains_caffeine == null ? 'غير معروف' : profile.contains_caffeine ? 'نعم' : 'لا'}</Row>
      {allergens.length > 0 && <Row label="مسبِّبات حساسية">{allergens.map(a => ALLERGEN_LABELS_AR[a] ?? a).join('، ')}</Row>}
      {conditions.length > 0 && <Row label="غير مناسب لمرضى">{conditions.map(c => CONDITION_LABELS_AR[c] ?? c).join('، ')}</Row>}
      {interactions.length > 0 && <Row label="يتداخل مع">{interactions.join('، ')}</Row>}
      {profile.notes_for_pharmacist && <Row label="ملاحظات للصيدلاني">{profile.notes_for_pharmacist}</Row>}
    </div>
  );
}
