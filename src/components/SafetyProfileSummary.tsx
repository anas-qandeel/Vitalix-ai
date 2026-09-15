'use client';

import type { ClinicalProfile } from '@/lib/product-suitability';
import { ALLERGEN_LABELS_AR } from '@/lib/product-suitability';

function badge(text: string, tone: 'red' | 'amber' | 'slate') {
  const cls = tone === 'red' ? 'bg-rose-50 border-rose-200 text-rose-700'
    : tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-slate-50 border-slate-200 text-slate-500';
  return <span key={text} className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${cls}`}>{text}</span>;
}

/** ملخص سطر واحد لبطاقة الأمان — يُظهر ما يستحق انتباه الصيدلاني فوراً بلا فتح التفاصيل */
export default function SafetyProfileSummary({ profile }: { profile: ClinicalProfile }) {
  const badges: React.ReactNode[] = [];

  const allergens = profile.allergen_tags ?? [];
  if (allergens.length > 0) {
    badges.push(badge(`مسببات: ${allergens.map(a => ALLERGEN_LABELS_AR[a] ?? a).join('، ')}`, 'amber'));
  }
  if (profile.pregnancy === 'avoid') badges.push(badge('ممنوع بالحمل', 'red'));
  else if (profile.pregnancy === 'caution' || profile.pregnancy === 'unknown') badges.push(badge('حمل: بحذر', 'amber'));

  if (profile.lactation === 'avoid') badges.push(badge('ممنوع بالرضاعة', 'red'));
  else if (profile.lactation === 'caution' || profile.lactation === 'unknown') badges.push(badge('رضاعة: بحذر', 'amber'));

  const interactions = profile.interacts_with_generics ?? [];
  if (interactions.length > 0) badges.push(badge(`يتداخل مع ${interactions.length} دواء`, 'amber'));

  if (profile.avoid_with_conditions?.includes('hypertension')) badges.push(badge('غير مناسب لمرضى الضغط', 'red'));
  if (profile.avoid_with_conditions?.includes('diabetes')) badges.push(badge('غير مناسب لمرضى السكري', 'red'));

  if (badges.length === 0) badges.push(badge('لا محاذير مسجّلة', 'slate'));

  return <div className="px-4 py-3 flex flex-wrap gap-1.5">{badges}</div>;
}
