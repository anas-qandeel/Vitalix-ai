import { normalizeAr } from '@/lib/arabic';

// ═══════════════════════════════════════════════════════════════════════
// محرك ملاءمة المنتج للمريض — حتمي بالكامل، لا نموذج ذكاء اصطناعي هنا.
// يقرأ البطاقة السريرية للمنتج (يملؤها الذكاء الاصطناعي مرة واحدة ويؤكدها الصيدلاني)
// وملف المريض، ويعيد: مناسب / بحذر / ممنوع + الأسباب بالعربية للصيدلاني.
// مبدأ المنصة: لا اقتراح أدوية ولا علاج ولا تشخيص — المنتجات داعمة فقط.
// ═══════════════════════════════════════════════════════════════════════

export const ALLERGEN_TAGS = [
  'fish', 'shellfish', 'milk', 'soy', 'egg', 'tree_nuts', 'peanut', 'sesame',
  'wheat_gluten', 'gelatin', 'yeast', 'bee_products',
] as const;
export type AllergenTag = typeof ALLERGEN_TAGS[number];

export const CONDITION_TAGS = ['hypertension', 'diabetes'] as const;
export type ConditionTag = typeof CONDITION_TAGS[number];

/** حالات يفيدها المنتج (منطق اقتراح، منفصل عن avoid_with_conditions الذي يعني "ممنوع عن") */
export const RELEVANCE_TAGS = ['diabetes', 'hypertension', 'weight'] as const;
export type RelevanceTag = typeof RELEVANCE_TAGS[number];

export type SafetyLevel = 'safe' | 'caution' | 'avoid' | 'unknown';
export type Confidence  = 'high' | 'medium' | 'low';

export interface ClinicalProfile {
  active_ingredients?: string[];
  allergen_tags?: AllergenTag[];
  pregnancy?: SafetyLevel;
  lactation?: SafetyLevel;
  min_age_years?: number | null;
  contains_sugar?: boolean | null;
  contains_sodium?: boolean | null;
  contains_caffeine?: boolean | null;
  avoid_with_conditions?: ConditionTag[];
  /** يفيد مرضى — يقترحه النموذج ويوقّعه الصيدلاني؛ يستهلكه محرك الاقتراح */
  relevant_to_conditions?: RelevanceTag[];
  interacts_with_generics?: string[];
  notes_for_pharmacist?: string | null;
  confidence?: Partial<Record<string, Confidence>>;
}

export interface ProductForSuitability {
  id: string;
  brand_name: string;
  is_active: boolean;
  review_status: 'ok' | 'needs_review' | 'rejected_medicine';
  profile_confirmed_at: string | null;
  clinical_profile: ClinicalProfile | null;
}

export interface PatientForSuitability {
  age: number | null;
  diagnosed_conditions: string[];
  drug_allergies: string[];
  food_allergies: string[];
  is_pregnant: boolean;
  is_lactating: boolean;
  /** الأسماء العلمية لأدوية المريض المزمنة (بعد مطابقتها في جدول الأدوية) */
  chronic_generics: string[];
}

export type SuitabilityStatus = 'ok' | 'caution' | 'forbidden';
export interface Suitability { status: SuitabilityStatus; reasons: string[] }

// ── الأسماء العربية للوسوم (للأسباب المعروضة) ──
export const ALLERGEN_LABELS_AR: Record<AllergenTag, string> = {
  fish: 'سمك', shellfish: 'محار/قشريات', milk: 'حليب', soy: 'صويا', egg: 'بيض',
  tree_nuts: 'مكسرات', peanut: 'فول سوداني', sesame: 'سمسم', wheat_gluten: 'قمح/غلوتين',
  gelatin: 'جيلاتين', yeast: 'خميرة', bee_products: 'منتجات نحل',
};

// ── كلمات مفتاحية تربط نص الحساسية كما يكتبه الصيدلاني بالوسم (عربي/إنجليزي، بعد normalizeAr) ──
const ALLERGEN_KEYWORDS: Record<AllergenTag, string[]> = {
  fish:         ['سمك', 'اسماك', 'سمكه', 'fish', 'salmon', 'tuna', 'cod', 'sardine'],
  shellfish:    ['محار', 'قشريات', 'جمبري', 'روبيان', 'سرطان البحر', 'shellfish', 'shrimp', 'prawn', 'crab', 'oyster', 'lobster'],
  milk:         ['حليب', 'لبن', 'البان', 'الالبان', 'لاكتوز', 'milk', 'dairy', 'lactose', 'casein', 'whey'],
  soy:          ['صويا', 'soy', 'soya'],
  egg:          ['بيض', 'egg'],
  tree_nuts:    ['مكسرات', 'لوز', 'جوز', 'بندق', 'كاجو', 'فستق', 'nuts', 'almond', 'walnut', 'hazelnut', 'cashew', 'pistachio'],
  peanut:       ['فول سوداني', 'فستق سوداني', 'peanut'],
  sesame:       ['سمسم', 'طحينه', 'sesame', 'tahini'],
  wheat_gluten: ['قمح', 'غلوتين', 'جلوتين', 'شعير', 'wheat', 'gluten', 'barley'],
  gelatin:      ['جيلاتين', 'gelatin', 'gelatine'],
  yeast:        ['خميره', 'yeast'],
  bee_products: ['عسل', 'غذاء ملكات', 'حبوب لقاح', 'بروبوليس', 'honey', 'royal jelly', 'bee pollen', 'propolis'],
};

/** يحوّل نصوص حساسية المريض إلى وسوم مغلقة (بالمطابقة الجزئية بعد التطبيع) */
export function allergyTextsToTags(texts: string[]): Set<AllergenTag> {
  const tags = new Set<AllergenTag>();
  for (const raw of texts) {
    const t = normalizeAr(String(raw ?? ''));
    if (t.length < 2) continue;
    for (const tag of ALLERGEN_TAGS) {
      if (ALLERGEN_KEYWORDS[tag].some(k => t.includes(normalizeAr(k)))) tags.add(tag);
    }
  }
  return tags;
}

/**
 * القرار لمنتج واحد ومريض واحد. الترتيب: كل الأسباب تُجمع، والحالة النهائية هي الأشد
 * (ممنوع > بحذر > مناسب). لا يُستدعى لمنتج معطّل أو مرفوض — المستدعي يستبعده أصلاً،
 * لكن نعيد "ممنوع" احتياطاً لو وصل.
 */
export function assessProductForPatient(product: ProductForSuitability, patient: PatientForSuitability): Suitability {
  const reasons: string[] = [];
  let status = 'ok' as SuitabilityStatus;
  const bump = (to: SuitabilityStatus, why: string) => {
    reasons.push(why);
    if (to === 'forbidden' || (to === 'caution' && status === 'ok')) status = to;
  };

  if (!product.is_active) bump('forbidden', 'المنتج معطّل');
  if (product.review_status === 'rejected_medicine') bump('forbidden', 'مرفوض: مستحضر دوائي — المنصة لا تعرض أدوية');
  if (product.review_status === 'needs_review') bump('caution', 'البطاقة السريرية بحاجة لمراجعة الصيدلاني');
  if (status === 'forbidden') return { status, reasons };

  const p = product.clinical_profile ?? {};
  if (!product.profile_confirmed_at) bump('caution', 'البطاقة السريرية غير مؤكدة من الصيدلاني');

  // ── الحساسية: وسوم المنتج × وسوم المريض، ثم مطابقة نصية مع المكونات (لمن يكتب حساسيته بالإنجليزية) ──
  const patientTags = allergyTextsToTags([...patient.drug_allergies, ...patient.food_allergies]);
  for (const tag of p.allergen_tags ?? []) {
    if (patientTags.has(tag)) bump('forbidden', `يحوي ${ALLERGEN_LABELS_AR[tag]} والمريض مسجّل بحساسية منه`);
  }
  const ingredients = (p.active_ingredients ?? []).map(i => normalizeAr(String(i)));
  for (const raw of [...patient.drug_allergies, ...patient.food_allergies]) {
    const a = normalizeAr(String(raw ?? ''));
    if (a.length < 3) continue;
    const hit = ingredients.find(i => i.includes(a));
    if (hit) bump('forbidden', `من مكوناته «${raw}» والمريض مسجّل بحساسية منه`);
  }

  // ── الحمل والرضاعة ──
  if (patient.is_pregnant) {
    if (p.pregnancy === 'avoid') bump('forbidden', 'ممنوع أثناء الحمل');
    else if (p.pregnancy === 'caution') bump('caution', 'يُستخدم بحذر أثناء الحمل');
    else if (p.pregnancy !== 'safe') bump('caution', 'أمانه في الحمل غير معروف');
  }
  if (patient.is_lactating) {
    if (p.lactation === 'avoid') bump('forbidden', 'ممنوع أثناء الرضاعة');
    else if (p.lactation === 'caution') bump('caution', 'يُستخدم بحذر أثناء الرضاعة');
    else if (p.lactation !== 'safe') bump('caution', 'أمانه في الرضاعة غير معروف');
  }

  // ── العمر ──
  if (patient.age != null && p.min_age_years != null && patient.age < p.min_age_years) {
    bump('forbidden', `للأعمار من ${p.min_age_years} سنة فأكثر`);
  }

  // ── التشخيصات ──
  const hasHtn = patient.diagnosed_conditions.includes('hypertension');
  const hasDm  = patient.diagnosed_conditions.includes('diabetes');
  if (hasHtn && (p.avoid_with_conditions ?? []).includes('hypertension')) bump('forbidden', 'غير مناسب لمرضى الضغط');
  if (hasDm  && (p.avoid_with_conditions ?? []).includes('diabetes'))     bump('forbidden', 'غير مناسب لمرضى السكري');
  if (hasDm  && p.contains_sugar   === true) bump('caution', 'يحوي سكراً والمريض سكري');
  if (hasHtn && p.contains_sodium  === true) bump('caution', 'يحوي صوديوم والمريض مصاب بالضغط');
  if (p.contains_caffeine === true && (hasHtn || patient.is_pregnant || patient.is_lactating)) {
    bump('caution', 'يحوي كافيين (ضغط/حمل/رضاعة)');
  }

  // ── التداخل مع الأدوية المزمنة (أسماء علمية) ──
  const generics = new Set(patient.chronic_generics.map(g => g.toLowerCase().trim()));
  for (const g of p.interacts_with_generics ?? []) {
    const key = String(g).toLowerCase().trim();
    if (generics.has(key)) bump('caution', `يتداخل مع دواء المريض المزمن (${g})`);
  }

  return { status, reasons };
}
