// تحقّق قوّة كلمة المرور — هذا فحص واجهة فقط (client-side)، لا يمنع تمرير كلمة مرور
// ضعيفة عبر استدعاء مباشر لـ Supabase Auth API. الحماية الكاملة تحتاج ضبط قواعد قوة
// كلمة المرور في إعدادات Supabase Auth نفسها أيضاً.

const COMMON_PASSWORDS = [
  'password',
  'passw0rd',
  'qwerty',
  'qwertyui',
  'iloveyou',
  'admin123',
  'letmein',
  'welcome',
  'pharmacy',
  'vitalix',
];

const LETTER_RE = /[a-zA-Zء-ي]/;
const DIGIT_RE = /[0-9٠-٩]/;

function isAllSameChar(pw: string): boolean {
  return pw.split('').every(c => c === pw[0]);
}

function isSequential(pw: string): boolean {
  const s = pw.toLowerCase();
  let ascending = true;
  let descending = true;
  for (let i = 1; i < s.length; i++) {
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}

export function validatePassword(pw: string): { valid: boolean; message?: string } {
  if (!pw) {
    return { valid: false, message: 'أدخل كلمة المرور' };
  }
  if (pw.length < 8) {
    return { valid: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }
  if (!LETTER_RE.test(pw)) {
    return { valid: false, message: 'يجب أن تحوي أحرفاً وأرقاماً معاً' };
  }
  if (!DIGIT_RE.test(pw)) {
    return { valid: false, message: 'يجب أن تحوي أحرفاً وأرقاماً معاً' };
  }
  if (isAllSameChar(pw)) {
    return { valid: false, message: 'كلمة المرور بسيطة جداً — لا تكرّر نفس الحرف' };
  }
  if (isSequential(pw)) {
    return { valid: false, message: 'كلمة المرور بسيطة جداً — تجنّب التسلسل' };
  }
  if (COMMON_PASSWORDS.includes(pw.toLowerCase())) {
    return { valid: false, message: 'كلمة المرور شائعة جداً — اختر كلمة أخرى' };
  }

  return { valid: true };
}
