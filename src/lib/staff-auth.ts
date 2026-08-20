/** أرقام PIN شائعة جداً — ممنوعة */
const BANNED_PINS = new Set([
  "123456", "654321", "111111", "000000", "222222", "333333",
  "444444", "555555", "666666", "777777", "888888", "999999",
  "121212", "112233", "123123", "102030", "123321", "789456",
]);

function isSequential(pin: string): boolean {
  let asc = true, desc = true;
  for (let i = 1; i < pin.length; i++) {
    const prev = Number(pin[i - 1]);
    const cur = Number(pin[i]);
    if (cur !== prev + 1) asc = false;
    if (cur !== prev - 1) desc = false;
  }
  return asc || desc;
}

/** يُرجع رسالة خطأ عربية، أو null إذا كان الرمز صالحاً */
export function validatePin(pin: string, phone?: string | null): string | null {
  if (!/^\d{6}$/.test(pin))       return "الرمز يجب أن يكون ٦ أرقام بالضبط";
  if (BANNED_PINS.has(pin))       return "هذا الرمز شائع جداً، اختر غيره";
  if (/^(\d)\1{5}$/.test(pin))    return "لا تكرّر الرقم نفسه";
  if (isSequential(pin))          return "لا تستخدم أرقاماً متتالية";
  if (/^(19|20)\d{4}$/.test(pin)) return "لا تستخدم سنة ميلاد";
  if (phone && phone.replace(/\D/g, "").includes(pin))
    return "لا تستخدم جزءاً من رقم هاتفك";
  return null;
}

/** يطبّع رقم هاتف أردني لأي صيغة إدخال إلى +9627XXXXXXXX، أو null إن كانت الصيغة غير معروفة */
export function normalizeJordanPhone(input: string): string | null {
  const cleaned = input.replace(/[^\d+]/g, "");

  let local: string; // بصيغة 7XXXXXXXX دائماً
  if (/^\+9627\d{8}$/.test(cleaned))     local = cleaned.slice(4);
  else if (/^9627\d{8}$/.test(cleaned))  local = cleaned.slice(3);
  else if (/^07\d{8}$/.test(cleaned))    local = cleaned.slice(1);
  else if (/^7\d{8}$/.test(cleaned))     local = cleaned;
  else return null;

  return `+962${local}`;
}

/** توليد PIN عشوائي صالح */
export function generatePin(): string {
  for (let i = 0; i < 100; i++) {
    const pin = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    if (!validatePin(pin)) return pin;
  }
  return "482913"; // احتياطي نظري
}

/** بناء البريد الاصطناعي — lowercase إلزامي (Supabase يخزّنه كذلك) */
export function buildStaffEmail(slug: string, pharmacyCode: string): string {
  return `${slug}@ph${pharmacyCode}.staff.vitalix-ai.com`.toLowerCase();
}

/** مدة القفل بالثواني حسب عدد المحاولات الفاشلة */
export function lockoutSeconds(failedCount: number): number {
  if (failedCount < 3)  return 0;
  if (failedCount === 3) return 30;
  if (failedCount === 4) return 120;
  if (failedCount === 5) return 600;
  return 1800;
}
