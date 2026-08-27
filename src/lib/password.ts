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

const LETTER_RE = /[a-zA-Z]/;
const DIGIT_RE = /[0-9٠-٩]/;
const ALNUM_EN_RE = /[a-z0-9]/;

const SEQUENTIAL_MIN_LEN = 5;

function isAllSameChar(pw: string): boolean {
  return pw.split('').every(c => c === pw[0]);
}

function isCommonPassword(pw: string): boolean {
  return COMMON_PASSWORDS.includes(pw.toLowerCase());
}

// تسلسل متصاعد أو متنازل (أرقام أو أحرف إنجليزية فقط) من minLen محارف متتالية أو أكثر
// في أي موضع من الكلمة — لا يشترط أن يغطي التسلسل الكلمة كاملة
function hasSequentialRun(pw: string, minLen: number): boolean {
  const s = pw.toLowerCase();
  let ascLen = 1;
  let descLen = 1;
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1];
    const cur = s[i];
    const bothAlnumEn = ALNUM_EN_RE.test(prev) && ALNUM_EN_RE.test(cur);
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    ascLen = (bothAlnumEn && diff === 1) ? ascLen + 1 : 1;
    descLen = (bothAlnumEn && diff === -1) ? descLen + 1 : 1;
    if (ascLen >= minLen || descLen >= minLen) return true;
  }
  return false;
}

export type PasswordChecks = {
  length: boolean;      // 8 أحرف على الأقل
  hasLetter: boolean;   // حرف إنجليزي واحد على الأقل (a-z أو A-Z فقط — لا عربي)
  hasDigit: boolean;    // رقم واحد على الأقل
  notSimple: boolean;   // ليست تكراراً لمحرف واحد، ولا تحوي تسلسلاً من 5 محارف أو أكثر، ولا كلمة شائعة
};

export function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    hasLetter: LETTER_RE.test(pw),
    hasDigit: DIGIT_RE.test(pw),
    notSimple: !isAllSameChar(pw) && !hasSequentialRun(pw, SEQUENTIAL_MIN_LEN) && !isCommonPassword(pw),
  };
}

export function isPasswordValid(checks: PasswordChecks): boolean {
  return checks.length && checks.hasLetter && checks.hasDigit && checks.notSimple;
}

export function validatePassword(pw: string): { valid: boolean; message?: string } {
  if (!pw) {
    return { valid: false, message: 'أدخل كلمة المرور' };
  }

  const checks = checkPassword(pw);

  if (!checks.length) {
    return { valid: false, message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' };
  }
  if (!checks.hasLetter || !checks.hasDigit) {
    return { valid: false, message: 'يجب أن تحوي أحرفاً وأرقاماً معاً' };
  }
  if (!checks.notSimple) {
    if (isAllSameChar(pw)) {
      return { valid: false, message: 'كلمة المرور بسيطة جداً — لا تكرّر نفس الحرف' };
    }
    if (hasSequentialRun(pw, SEQUENTIAL_MIN_LEN)) {
      return { valid: false, message: 'كلمة المرور بسيطة جداً — تجنّب التسلسل' };
    }
    return { valid: false, message: 'كلمة المرور شائعة جداً — اختر كلمة أخرى' };
  }

  return { valid: true };
}
