/**
 * فئات المنتجات المستحقة في زيارة ضغط/سكر — منطق طبي حتمي بالعتبات، لا علاقة له بملف المريض
 * (الملاءمة تأتي بعده عبر product-suitability). مصدر واحد يستخدمه مسار الزيارة وتقرير الذكاء.
 * كما يحوي القوالب الاحتياطية الحتمية للسبب/الإرشاد لكل فئة، تُستخدم إن لم يكتب الذكاء نصاً.
 */
export const VISIT_PRODUCT_CATEGORIES = ['bp_device', 'sugar_device', 'sugar_strips'] as const;
export type VisitProductCategory = typeof VISIT_PRODUCT_CATEGORIES[number];

export const VISIT_CATEGORY_LABELS_AR: Record<VisitProductCategory, string> = {
  bp_device:    'جهاز قياس الضغط',
  sugar_device: 'جهاز فحص السكر',
  sugar_strips: 'شرائح فحص السكر',
};

export interface VisitReadings {
  sugar_value?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
}

/** العتبات نفسها التي كانت في GET /api/visit: سكر ≥ 180 ← جهاز + شرائح؛ ضغط ≥ 140/90 ← جهاز ضغط */
export function dueVisitCategories(v: VisitReadings): VisitProductCategory[] {
  const due: VisitProductCategory[] = [];
  if (v.sugar_value && v.sugar_value >= 180) due.push('sugar_device', 'sugar_strips');
  if ((v.bp_systolic && v.bp_systolic >= 140) || (v.bp_diastolic && v.bp_diastolic >= 90)) due.push('bp_device');
  return due;
}

export interface ProductNote { reason: string; instruction: string }
export type ProductNotes = Partial<Record<VisitProductCategory, ProductNote>>;

export interface PatientFlagsForNote { is_pregnant?: boolean; is_lactating?: boolean }

/** قالب حتمي بأرقام المريض — لا ادعاء علاجي، لا اسم منتج، لا نصيحة دوائية */
export function fallbackProductNote(category: VisitProductCategory, v: VisitReadings, p: PatientFlagsForNote = {}): ProductNote {
  switch (category) {
    case 'bp_device': {
      const reading = v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : 'اليوم';
      const pregnancy = p.is_pregnant ? ' ومتابعة ضغط الحمل مع طبيبك أمر أساسي.' : '';
      return {
        reason: `قراءة ضغطك ${reading} أعلى من الحد المطمئن؛ جهاز قياس منزلي يتيح لك ولطبيبك متابعة الضغط بانتظام بدل الاعتماد على قراءة واحدة.${pregnancy}`,
        instruction: 'قِس صباحاً ومساءً وأنت جالس مرتاح، وسجّل القراءات لعرضها على طبيبك.',
      };
    }
    case 'sugar_device':
      return {
        reason: `سكرك اليوم ${v.sugar_value ?? ''} مج/دسل أعلى من الهدف؛ جهاز قياس منزلي يساعدك على معرفة أثر وجباتك على السكر يوماً بيوم.`.replace('  ', ' '),
        instruction: 'قِس في الأوقات التي يحددها طبيبك أو صيدلانيك (مثل قبل الإفطار وبعد الوجبات) وسجّل القراءات.',
      };
    case 'sugar_strips':
      return {
        reason: 'شرائح الفحص تُكمّل جهازك المنزلي — بدون مخزون كافٍ منها تتوقف المتابعة.',
        instruction: 'تأكد من توافق الشرائح مع طراز جهازك ومن تاريخ الصلاحية.',
      };
  }
}

/** يُنقّي ما كتبه الذكاء: فئات مستحقة فقط، نصوص غير فارغة بحد أقصى، وإلا القالب الاحتياطي */
export function resolveProductNotes(
  raw: unknown,
  due: VisitProductCategory[],
  v: VisitReadings,
  p: PatientFlagsForNote = {},
): Record<VisitProductCategory, ProductNote & { source: 'ai' | 'fallback' }> {
  const out = {} as Record<VisitProductCategory, ProductNote & { source: 'ai' | 'fallback' }>;
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const c of due) {
    const n = obj[c] as { reason?: unknown; instruction?: unknown } | undefined;
    const reason = typeof n?.reason === 'string' ? n.reason.trim().slice(0, 300) : '';
    const instruction = typeof n?.instruction === 'string' ? n.instruction.trim().slice(0, 200) : '';
    if (reason.length >= 15 && instruction.length >= 8) out[c] = { reason, instruction, source: 'ai' };
    else out[c] = { ...fallbackProductNote(c, v, p), source: 'fallback' };
  }
  return out;
}
