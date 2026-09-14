import { normalizeAr } from '@/lib/arabic';

// صيغ النفي القريبة التي تجعل ذكر المسبب "استبعاداً" لا "اقتراحاً"
const NEGATION_RE = /(خالي|خالية|خال|بدون|بلا|دون|تجنب|تجنبي|لا تتناول|لا تتناولي|ابتعد|ابتعدي|ممنوع|استبدل|استبدلي)/;
const NEGATION_WINDOW = 40; // حرفاً قبل موضع الكلمة
const SNIPPET_PAD = 35;     // حرفاً حول الكلمة في المقتطف

/**
 * يبحث عن ذكر كل مسبب حساسية داخل نصوص حرة بعد تطبيع الهمزات والتشكيل (normalizeAr).
 * يتجاهل الذكر المسبوق بصيغة نفي ضمن NEGATION_WINDOW حرفاً.
 * يعيد مقتطفات مراجعة للصيدلاني — علم لا حكم. النصوص لا تُعدَّل أبداً.
 * المقتطف من النص المطبَّع لأن مواضع النص الأصلي لا تطابقه بعد حذف التشكيل.
 */
export function findAllergenMentions(texts: unknown[], allergens: unknown[]): string[] {
  const textFields = texts.filter((t): t is string => typeof t === 'string' && t.length > 0);
  const list = allergens.filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
  const conflicts: string[] = [];
  for (const allergen of list) {
    const needle = normalizeAr(allergen);
    if (needle.length < 2) continue;
    for (const t of textFields) {
      const hay = normalizeAr(t);
      let idx = hay.indexOf(needle);
      while (idx !== -1) {
        const before = hay.slice(Math.max(0, idx - NEGATION_WINDOW), idx);
        if (!NEGATION_RE.test(before)) {
          const start = Math.max(0, idx - SNIPPET_PAD);
          const end   = Math.min(hay.length, idx + needle.length + SNIPPET_PAD);
          conflicts.push(`«${allergen}» ورد في: ${start > 0 ? '…' : ''}${hay.slice(start, end)}${end < hay.length ? '…' : ''}`);
          break;
        }
        idx = hay.indexOf(needle, idx + needle.length);
      }
    }
  }
  return conflicts;
}
