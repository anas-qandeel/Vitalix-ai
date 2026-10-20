// أسعار Gemini بالدولار لكل مليون توكن. المرجع الوحيد للأسعار في المشروع — لا تكرّرها في مكان آخر.
// المصدر: صفحة Google الرسمية https://ai.google.dev/gemini-api/docs/pricing (فئة Standard)، وهو موقع خارجي
// يتغيّر، فتُراجَع الأرقام منه وتُحدَّث PRICING_REVIEWED_AT معها. آخر مراجعة: 2026-10-20.
// تنبيه: سعر flash يتضاعف في 2027-01-01، لذا يُحسب السعر بشهر الاستهلاك لا بتاريخ اليوم.
export const PRICING_REVIEWED_AT = '2026-10-20';

interface Rate { input: number; output: number }

const FLASH_LITE: Rate = { input: 0.30, output: 2.50 };
const FLASH_UNTIL_2026: Rate = { input: 0.75, output: 3.75 };
const FLASH_FROM_2027: Rate = { input: 1.50, output: 7.50 };
const FREE: Rate = { input: 0, output: 0 };

// month بصيغة 'YYYY-MM': المقارنة النصية صحيحة لأن الصيغة ثابتة الطول
const FLASH_PRICE_CHANGE_MONTH = '2027-01';

function rateFor(model: string, month: string): Rate {
  // الرسالة الاحتياطية المحلية لا تستدعي أي نموذج فلا تكلفة عليها
  if (model === 'local-fallback') return FREE;
  if (model.includes('flash-lite')) return FLASH_LITE;
  // أي نموذج آخر (الافتراضي gemini-3.6-flash) يُسعَّر بسعر flash
  return month >= FLASH_PRICE_CHANGE_MONTH ? FLASH_FROM_2027 : FLASH_UNTIL_2026;
}

/** تكلفة تقديرية بالدولار. outputTokens تشمل توكنز التفكير لأنها تُحاسَب كمخرجات. month = شهر الاستهلاك 'YYYY-MM'. */
export function estimateCostUsd(model: string, promptTokens: number, outputTokens: number, month: string): number {
  const r = rateFor(model, month);
  return (promptTokens * r.input + outputTokens * r.output) / 1_000_000;
}
