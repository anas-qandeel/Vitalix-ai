// أدوات نص تسويقي قصير لمنتج في خطة المريض: بناء برومبت للنموذج، ثم فحص حتمي للنص العائد قبل أن يصل لأي مريض.
// الفحص هو خط الأمان الفعلي: البرومبت يوجّه النموذج فقط ولا يُعوَّل عليه — ما لا يجتاز validateMarketingText لا يُعرض.
// منطق نقي لا يستورد next ولا supabase ولا react، ويُختبر بشكل حتمي.
import { normalizeAr } from '@/lib/arabic';

export const MARKETING_MAX_CHARS = 240;

export type MarketingFacts = { categoryLabel: string; ingredients: string[]; relevantTo: string[] };
export type MarketingPatient = {
  ageBand: 'child' | 'adult' | 'senior' | null;
  conditions: string[];
  goal: 'weight_loss' | 'balanced_nutrition';
};

// جذور الادعاءات الممنوعة: تُطابَق كبادئة لرمز (كلمة) بعد التطبيع، فيشمل «يعالج» «يعالجك» «علاجي» ونحوها.
// قائمة ثابتة مُصدَّرة ليراجعها الصيدلاني لاحقاً.
export const BANNED_CLAIM_STEMS: readonly string[] = [
  'يعالج', 'علاج', 'يشفي', 'شفاء', 'يضمن', 'ضمان', 'مضمون', 'يمنع', 'وقاية', 'وقاي',
  'يخفض', 'يزيل', 'يحارب', 'معجز', 'يذيب', 'يحرق', 'توقف', 'تخلص',
  'آمن', 'نقي', 'فعال', 'أفضل', 'مثبت', 'مجرب',
  'أمان', 'نقاء', 'دراس', 'أثبت', 'علمي',
];
// رموز تُطابَق تماماً لا كبادئة: لو كانت «يقي» بادئة لالتقطت «يقيس» وهي كلمة سليمة
export const BANNED_CLAIM_EXACT: readonly string[] = ['يقي', 'ويقي'];
// عبارات تُطابَق ككتلة نصية (كلمات كاملة متتالية)
export const BANNED_CLAIM_PHRASES: readonly string[] = ['بدل الدواء', 'بديل الدواء', 'بدون دواء'];

const CONDITION_LABELS_AR: Record<string, string> = {
  weight: 'إدارة الوزن',
  diabetes: 'السكري',
  hypertension: 'ارتفاع ضغط الدم',
};
const AGE_LABELS_AR = { child: 'طفل', adult: 'بالغ', senior: 'كبير في السن' } as const;

// تطبيع الهمزات والتشكيل، مع حذف التطويل (ـ) حتى لا يُخفي كلمة ممنوعة مثل «يعـالج»
const norm = (s: string) => normalizeAr(s).replace(/ـ/g, '');
// فاصل الرموز: كل ما ليس حرفاً عربياً أو لاتينياً أو رقماً
const SEP_RE = /[^ء-غف-ي٠-٩۰-۹A-Za-z0-9]+/;
const tokens = (s: string): string[] => norm(s).split(SEP_RE).filter(Boolean);

const STEMS_N = BANNED_CLAIM_STEMS.map(norm);
const EXACT_N = BANNED_CLAIM_EXACT.map(norm);
const PHRASES_N = BANNED_CLAIM_PHRASES.map(p => tokens(p).join(' '));

// صيغ الرمز بعد نزع حرف عطف/جر لاصق (و ف ب ل ك) و«ال» — كي لا تُخفي «ويعالج» أو «العلاج» ادعاءً ممنوعاً
function variants(tok: string): string[] {
  const noConj = tok.replace(/^[وفبلك]/, '');
  const out = new Set<string>();
  for (const t of [tok, noConj]) {
    out.add(t);
    out.add(t.replace(/^(ال|لل)/, ''));
  }
  return [...out].filter(v => v.length >= 2);
}

function hasBannedClaim(text: string): boolean {
  const toks = tokens(text);
  const spaced = ` ${toks.join(' ')} `;
  if (PHRASES_N.some(p => spaced.includes(` ${p} `))) return true;
  return toks.some(tok => variants(tok).some(v => EXACT_N.includes(v) || STEMS_N.some(s => v.startsWith(s))));
}

// فواصل الجمل . ! ؟ ? ؛ … — المتتالية منها تُعدّ فاصلاً واحداً
function sentenceCount(text: string): number {
  return text.replace(/[.!؟?؛…]+/g, '.').split('.').filter(s => s.trim().length > 0).length;
}

// مقارنة صارمة عمداً (لا استثناء للنفي): «خالٍ من المكسرات» ادعاء لا نملك بيانات تدعمه، فيُرفض كذكرٍ صريح
function mentionsAllergen(text: string, allergens: string[]): boolean {
  const hay = tokens(text).join(' ');
  return allergens.some(a => {
    if (typeof a !== 'string') return false;
    const needle = tokens(a).join(' ');
    return needle.length >= 2 && hay.includes(needle);
  });
}

export function validateMarketingText(
  text: unknown,
  opts: { allergens: string[] },
): { ok: true; text: string } | { ok: false; reason: string } {
  if (typeof text !== 'string') return { ok: false, reason: 'empty' };
  const t = text.trim();
  if (!t) return { ok: false, reason: 'empty' };
  if (t.length > MARKETING_MAX_CHARS) return { ok: false, reason: 'too_long' };
  if (!/[؀-ۿ]/.test(t)) return { ok: false, reason: 'no_arabic' };
  if (/[0-9٠-٩۰-۹]/.test(t)) return { ok: false, reason: 'has_digit' };
  if (/[A-Za-z]/.test(t)) return { ok: false, reason: 'has_latin' };
  if (sentenceCount(t) > 2) return { ok: false, reason: 'too_many_sentences' };
  if (hasBannedClaim(t) || hasReasonClaim(t)) return { ok: false, reason: 'banned_claim' };
  if (mentionsAllergen(t, opts.allergens)) return { ok: false, reason: 'allergen' };
  return { ok: true, text: t };
}

const label = (code: string) => CONDITION_LABELS_AR[code] ?? code;

export function buildMarketingPrompt(items: { id: string; facts: MarketingFacts }[], patient: MarketingPatient): string {
  const conditions = patient.conditions.length > 0 ? patient.conditions.map(label).join('، ') : 'لا توجد حالات مسجّلة';
  const age = patient.ageBand ? AGE_LABELS_AR[patient.ageBand] : 'غير محددة';
  const goalLine = patient.goal === 'weight_loss'
    ? 'هدف المريض: خسارة وزن صحية وتدريجية.'
    : 'هدف المريض: تغذية متوازنة وصحة عامة (وليس خسارة الوزن).';
  const itemLines = items.map(it => {
    const ing = it.facts.ingredients.length > 0 ? it.facts.ingredients.join('، ') : 'غير محددة';
    const rel = it.facts.relevantTo.length > 0 ? it.facts.relevantTo.map(label).join('، ') : 'غير محدد';
    return `- id: ${it.id}\n  الفئة: ${it.facts.categoryLabel}\n  المكوّنات المعروفة: ${ing}\n  مفيد لـ: ${rel}`;
  }).join('\n');

  return `أنت تكتب نصوصاً تسويقية قصيرة لصيدلية، يقرؤها المريض في خطته الصحية.

${goalLine}
حالات المريض المسجّلة: ${conditions}
الفئة العمرية: ${age}

لكل عنصر من العناصر أدناه اكتب جملة أو جملتين (لا أكثر) بصيغة المخاطَب وبنبرة دافئة، تربط المنتج بهدف المريض وبحالته المسجّلة إن وُجدت، وتعتمد حصراً على المعلومات المعطاة لذلك العنصر.

قواعد صارمة:
- لا تذكر اسم علامة تجارية.
- لا ادعاء علاجياً ولا وقائياً: لا تستعمل كلمات مثل: يعالج، يشفي، يضمن، يمنع، يخفض، يزيل، يحرق، يذيب.
- لا أرقام أبداً: لا أرقام لاتينية ولا عربية-هندية، ولا مدة ولا كمية ولا نسبة.
- لا تذكر أدوية، ولا تقارن المنتج بدواء، ولا تقل ما يوحي بالاستغناء عن دواء.
- لا تذكر أي مكوّن غير مذكور في معلومات العنصر.
- اكتب بعربية بسيطة سليمة التركيب، بجمل قصيرة واضحة، دون مصطلحات تقنية.
- لا تستعمل أي حرف لاتيني: إن كان اسم مكوّن إنجليزياً فاذكره بالعربية الشائعة أو احذفه.
- لا ادعاء جودة أو أمان أو فعالية أو تفوّق: لا «آمن» ولا «نقي» ولا «فعّال» ولا «الأفضل» ولا «مثبت علمياً».
- لا تصف المنتج بصفة غير مذكورة صراحة في معلومات العنصر.
- صِفه بأنه «مكمّل غذائي يدعم نمط حياة صحي»، ولا تصفه بأنه «علاج».
- تنتهي الجملة الثانية (أو الأولى إن كتبتَ جملة واحدة) بدعوة لطيفة لسؤال الصيدلاني عند الحاجة.
- لا يزيد النص عن ${MARKETING_MAX_CHARS} حرفاً.

العناصر:
${itemLines}

أخرج JSON فقط، بلا أي نص خارجه ولا علامات تنسيق، بالشكل: [{ "id": "...", "text": "..." }] — عنصر لكل id بالمعرّف نفسه حرفياً.`;
}

// يحلّل ردّ النموذج إلى خريطة id → نص مقبول. كل عنصر لا يجتاز الفحص يُهمل وحده دون التأثير في غيره،
// ولا ترمي الدالة استثناءً أبداً: الردّ المعطوب أو غير المتوقع يعني خريطة فارغة، أي لا نص تسويقي لأحد.
export function parseMarketingResponse(
  raw: unknown,
  items: { id: string }[],
  opts: { allergens: string[] },
): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof raw !== 'string') return out;

  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // نص تمهيدي أو ختامي حول المصفوفة: نجرّب ما بين أول '[' وآخر ']'
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end <= start) return out;
    try { parsed = JSON.parse(cleaned.slice(start, end + 1)); } catch { return out; }
  }
  if (!Array.isArray(parsed)) return out;

  const allowed = new Set(items.map(i => i.id));
  for (const el of parsed) {
    if (!el || typeof el !== 'object') continue;
    const { id, text } = el as { id?: unknown; text?: unknown };
    // id خارج القائمة المسموحة أو مقبول سابقاً (يبقى الأول) يُتجاهل
    if (typeof id !== 'string' || !allowed.has(id) || out.has(id)) continue;
    const v = validateMarketingText(text, { allergens: opts.allergens });
    if (v.ok) out.set(id, v.text);
  }
  return out;
}

// سبب المنتج (reason) يكتبه النموذج في الخطة نفسها، ولا يمرّ على validateMarketingText. قائمته أضيق من قائمة النص التسويقي
// عمداً: «علاج» (علاج الميتفورمين، الخطة العلاجية) و«ضمان» (لضمان الاستمرارية) و«تحسين/تحسن» ترد كثيراً بمعنى بريء.
export const NEUTRAL_REASON = 'منتج مقترح من الصيدلية ضمن خطتك — اسأل الصيدلاني عن طريقة الاستخدام المناسبة لك.';

export const REASON_BANNED_STEMS: readonly string[] = [
  'يعالج', 'تعالج', 'يشفي', 'تشفي', 'شفاء', 'يضمن', 'مضمون', 'يمنع', 'وقاي', 'يخفض', 'تخفض', 'يزيل', 'يحارب',
  'معجز', 'يذيب', 'يحرق', 'آمن', 'أمان', 'نقي', 'فعال', 'أفضل', 'مثبت', 'مجرب', 'دراس', 'أثبت', 'علمي', 'التهاب',
];
const REASON_STEMS_N = REASON_BANNED_STEMS.map(norm);

// المنطق نفسه في hasBannedClaim (بادئة للجذور، تامة للرموز، كتلة للعبارات) لكن بجذور السبب
function hasReasonClaim(text: string): boolean {
  const toks = tokens(text);
  const spaced = ` ${toks.join(' ')} `;
  if (PHRASES_N.some(p => spaced.includes(` ${p} `))) return true;
  return toks.some(tok => variants(tok).some(v => EXACT_N.includes(v) || REASON_STEMS_N.some(s => v.startsWith(s))));
}

// يحوّل سبباً فيه ادعاء إلى النص المحايد؛ الفارغ أو غير النص يُستبدل أيضاً
export function sanitizeReason(reason: unknown): { text: string; replaced: boolean } {
  if (typeof reason !== 'string' || !reason.trim()) return { text: NEUTRAL_REASON, replaced: true };
  if (hasReasonClaim(reason)) return { text: NEUTRAL_REASON, replaced: true };
  return { text: reason.trim(), replaced: false };
}

export const FIXED_SUPPLEMENT_INSTRUCTION = 'اتبع تعليمات العبوة، أو اسأل الصيدلاني عن طريقة الاستخدام المناسبة لك.';
// طريقة استخدام المكمّلات لا يكتبها النموذج: لا يرى العبوة، وجرعة مخمَّنة خطر على المريض. الأجهزة تبقى بنصيحتها العامة
export function safeInstruction(categoryCode: string, instruction: string, supplementCodes: ReadonlySet<string>): string {
  return supplementCodes.has(categoryCode) ? FIXED_SUPPLEMENT_INSTRUCTION : instruction;
}
