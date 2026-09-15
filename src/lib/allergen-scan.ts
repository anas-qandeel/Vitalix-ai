import { normalizeAr } from '@/lib/arabic';

// صيغ النفي/الاستبعاد القريبة التي تجعل ذكر المسبب "استبعاداً" لا "اقتراحاً"
const NEGATION_RE = /(خالي|خاليه|خال|بدون|بلا|دون|عدم|غير|تجنب|تجنبي|لا تتناول|لا تتناولي|لا يحتوي|لا تحتوي|ابتعد|ابتعدي|ممنوع|استبدل|استبدلي|بديل|بديلا|بدلا|تعويض|لتعويض|استغناء|استغني)/;
const NEGATION_WINDOW = 40; // حرفاً قبل موضع الكلمة
const SNIPPET_PAD = 35;     // حرفاً حول الكلمة في المقتطف

// توابع آمنة: إن تلت المسبّبَ مباشرةً فالذكر لبديل نباتي لا للمسبّب نفسه (المفاتيح بعد normalizeAr)
const SAFE_FOLLOWERS: Record<string, RegExp> = {
  'حليب': /^\s*(اللوز|الصويا|الشوفان|الارز|جوز الهند|النباتي|نباتي|الام|الثدي)/,
  'زبده': /^\s*(الفول السوداني|اللوز|الشيا|الكاكاو)/,
  'جبن':  /^\s*(نباتي|النباتي)/,
};

// سوابق آمنة: إن سبقت المسبّبَ مباشرةً (مع "ال" اختيارية) فالذكر لحليب الرضاعة لا لمنتج ألبان.
// مؤمّنة بفراغ/بداية النص قبلها كي لا تطابق جزء كلمة. "كمية/مصدر الحليب" تبقى إنذاراً عمداً.
const SAFE_PRECEDERS: Record<string, RegExp> = {
  'حليب': /(^|\s)(انتاج|إنتاج|ادرار|إدرار|تدفق|غزاره|غزارة)\s*(ال)?$/,
};

export interface LabeledText { label: string; text: unknown }

/**
 * يبحث عن ذكر كل مسبب حساسية داخل نصوص حرة (كلٌّ باسم قسمه) بعد تطبيع الهمزات والتشكيل.
 * يتجاهل الذكر المسبوق بصيغة نفي/استبعاد ضمن NEGATION_WINDOW حرفاً.
 * يعيد مقتطفات مراجعة للصيدلاني بصيغة «المسبب» — القسم: …مقتطف… — علم لا حكم. النصوص لا تُعدَّل أبداً.
 * المقتطف من النص المطبَّع لأن مواضع النص الأصلي لا تطابقه بعد حذف التشكيل.
 */
export function findAllergenMentions(texts: LabeledText[], allergens: unknown[]): string[] {
  const textFields = texts.filter((t): t is { label: string; text: string } => typeof t.text === 'string' && t.text.length > 0);
  const list = allergens.filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
  const conflicts: string[] = [];
  for (const allergen of list) {
    const needle = normalizeAr(allergen);
    if (needle.length < 2) continue;
    for (const { label, text } of textFields) {
      const hay = normalizeAr(text);
      let idx = hay.indexOf(needle);
      while (idx !== -1) {
        const before = hay.slice(Math.max(0, idx - NEGATION_WINDOW), idx);
        const after  = hay.slice(idx + needle.length, idx + needle.length + 20);
        const safeFollower = SAFE_FOLLOWERS[needle]?.test(after) ?? false;
        const safePreceder = SAFE_PRECEDERS[needle]?.test(before) ?? false;
        if (!NEGATION_RE.test(before) && !safeFollower && !safePreceder) {
          const start = Math.max(0, idx - SNIPPET_PAD);
          const end   = Math.min(hay.length, idx + needle.length + SNIPPET_PAD);
          conflicts.push(`«${allergen}» — ${label}: ${start > 0 ? '…' : ''}${hay.slice(start, end)}${end < hay.length ? '…' : ''}`);
          break;
        }
        idx = hay.indexOf(needle, idx + needle.length);
      }
    }
  }
  return conflicts;
}
