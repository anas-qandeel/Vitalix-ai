import type { ClinicalProfile, SafetyLevel } from '@/lib/product-suitability';

/**
 * قواعد صيدلانية حتمية تُطبَّق على بطاقة الأمان بعد بناء الذكاء الاصطناعي لها وقبل عرضها.
 * الفلسفة نفسها التي في حارس الأدوية: النموذج يقترح، والقائمة تفرض حداً أدنى لا يُنزل عنه.
 * القواعد تُشدّد فقط (safe → caution → avoid) ولا تُخفّف أبداً، وترفع ثقة الحقل إلى high.
 * القائمة يملكها صيدلاني المنصة ويوسّعها؛ كل قاعدة: مطابقة على الاسم/المكونات + أثر + سبب بالعربية.
 */

const LEVEL_RANK: Record<SafetyLevel, number> = { safe: 0, unknown: 1, caution: 2, avoid: 3 };

/** يعيد الأشدّ بين الحالي والحدّ الأدنى المطلوب — لا يُخفّف أبداً */
export function stricter(current: SafetyLevel | undefined, floor: SafetyLevel): SafetyLevel {
  const cur: SafetyLevel = current ?? 'unknown';
  return LEVEL_RANK[floor] > LEVEL_RANK[cur] ? floor : cur;
}

export interface PharmacistRule {
  id: string;
  /** تُطابَق على اسم المنتج وكل مكوّن بعد تحويلها لحروف صغيرة (بلا علم g) */
  match: RegExp;
  /** مكوّن يحوي هذا النص لا يُعدّ مطابقاً (استثناء) */
  exclude?: RegExp;
  reason_ar: string;
  apply: (p: ClinicalProfile) => ClinicalProfile;
}

export const PHARMACIST_RULES: PharmacistRule[] = [
  {
    id: 'preformed_vitamin_a_pregnancy',
    match: /\b(vitamin a|retinol|retinyl|cod liver oil)\b/,
    exclude: /caroten/,
    reason_ar: 'فيتامين A بصيغته الجاهزة (ريتينول/زيت كبد الحوت) — إرشاد NHS: يُتجنّب في الحمل',
    apply: p => ({
      ...p,
      pregnancy: stricter(p.pregnancy, 'avoid'),
      confidence: { ...(p.confidence ?? {}), pregnancy: 'high' },
    }),
  },
  {
    id: 'caffeine_source',
    match: /\b(caffeine|caffeinated|guarana)\b/,
    reason_ar: 'مصدر كافيين — يُعلَّم "يحوي كافيين" ويُعدّ بحذر أثناء الرضاعة',
    apply: p => ({
      ...p,
      contains_caffeine: true,
      lactation: stricter(p.lactation, 'caution'),
      confidence: { ...(p.confidence ?? {}), contains_caffeine: 'high' },
    }),
  },
];

// قاعدة الجيلاتين تُضاف هنا لأنها تحتاج الوسوم لا مستويات الأمان
PHARMACIST_RULES.push({
  id: 'capsule_gelatin',
  match: /\b(softgel|soft gel|softgels|capsule|capsules|caps)\b|كبسول/,
  exclude: /vegetarian|vegan|veggie|hpmc|pullulan|نباتي/,
  reason_ar: 'شكل كبسولات — الغلاف جيلاتيني ما لم يُذكر أنه نباتي؛ أُضيف وسم الجيلاتين',
  apply: p => ({
    ...p,
    allergen_tags: Array.from(new Set([...(p.allergen_tags ?? []), 'gelatin' as const])),
    confidence: { ...(p.confidence ?? {}), allergen_tags: 'high' },
  }),
});

export interface AppliedRule { id: string; reason_ar: string }

export function applyPharmacistRules(
  profile: ClinicalProfile,
  brandName: string,
): { profile: ClinicalProfile; applied: AppliedRule[] } {
  const haystack = [brandName, ...(profile.active_ingredients ?? [])].map(s => String(s).toLowerCase());
  let out = profile;
  const applied: AppliedRule[] = [];
  for (const rule of PHARMACIST_RULES) {
    const hit = haystack.some(s => rule.match.test(s) && !(rule.exclude && rule.exclude.test(s)));
    if (!hit) continue;
    out = rule.apply(out);
    applied.push({ id: rule.id, reason_ar: rule.reason_ar });
  }
  if (applied.length > 0) {
    const note = 'قاعدة صيدلانية: ' + applied.map(a => a.reason_ar).join('؛ ');
    out = { ...out, notes_for_pharmacist: out.notes_for_pharmacist ? `${out.notes_for_pharmacist} — ${note}` : note };
  }
  return { profile: out, applied };
}
