// مصدر واحد لمعالجة أرقام الهاتف في المشروع.
// التخزين دائماً بصيغة E.164 بلا علامة + (مثال: 962791759005) لأن واتساب يتطلّب هذه الصيغة
// في روابط wa.me / api.whatsapp.com. أما العرض للصيدلاني فيبقى بالصيغة الأردنية المألوفة
// (07XXXXXXXX) عبر displayPhone — لا تخزّن الصيغة المحلية مباشرة في القاعدة.

// يحوّل أي إدخال (محلي 07..، دولي 962.. أو 00962.., أو رقم أجنبي) إلى E.164 بلا +
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');

  // 00962XXXXXXXXX — رقم أردني مسبوق بمفتاح دولي كامل
  if (digits.startsWith('00962')) {
    return '962' + digits.slice(5);
  }
  // 962XXXXXXXXX بطول أكبر من 10 — رقم أردني مسبوق بمفتاح الدولة بلا أصفار دولية
  if (digits.startsWith('962') && digits.length > 10) {
    return '962' + digits.slice(3);
  }
  // 07XXXXXXXX — رقم أردني محلي
  if (digits.startsWith('0') && digits.length === 10) {
    return '962' + digits.slice(1);
  }
  // 00XX.. — مفتاح دولة أخرى مسبوق بأصفار دولية
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  return digits;
}

// يعكس normalizePhone للعرض: أردني → 07XXXXXXXX، غير ذلك → +الرقم كما هو
export function displayPhone(stored: string): string {
  if (stored.startsWith('962') && stored.length === 12) {
    return '0' + stored.slice(3);
  }
  return `+${stored}`;
}

export function validatePhone(input: string): { valid: boolean; message?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, message: 'أدخل رقم الهاتف' };
  }

  // صفر واحد فقط في البداية (لا صفرين) يعني رقماً أردنياً حتماً — حتى لو
  // طوله خاطئ. لو تركناه لـ normalizePhone فسيمر بلا تطبيع (لأنها تشترط
  // طول 10 بالضبط) ويُفحص كرقم أجنبي فيمرّ خطأً كصحيح.
  const rawDigits = trimmed.replace(/\D/g, '');
  if (rawDigits.startsWith('0') && !rawDigits.startsWith('00')) {
    if (rawDigits.length !== 10) {
      return { valid: false, message: 'رقم أردني يجب أن يكون 10 خانات تبدأ بـ07' };
    }
    return { valid: true };
  }

  const normalized = normalizePhone(trimmed);

  if (normalized.startsWith('962')) {
    if (normalized.length !== 12) {
      return { valid: false, message: 'رقم أردني يجب أن يكون 10 خانات تبدأ بـ07' };
    }
    return { valid: true };
  }

  if (normalized.length < 8 || normalized.length > 15) {
    return { valid: false, message: 'تحقّق من الرقم — يبدو غير مكتمل' };
  }

  return { valid: true };
}
