// يحدّد اتجاه عرض تقارير الذكاء الاصطناعي التي قد تصل بالعربية أو الإنجليزية،
// بلا حاجة لحفظ لغة التقرير في القاعدة — الاتجاه يُستنتج من محتوى النص مباشرة
export function detectTextDir(text: string | null | undefined): 'rtl' | 'ltr' {
  if (!text) return 'rtl';

  // نطاقات الأحرف العربية: العربية الأساسية، الملحقة، الممتدة-أ،
  // وأشكال العرض التقديمية أ/ب
  const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  const LATIN_LETTER = /[A-Za-z]/;

  for (const char of text) {
    if (ARABIC_LETTER.test(char)) return 'rtl';
    if (LATIN_LETTER.test(char)) return 'ltr';
  }

  return 'rtl';
}
