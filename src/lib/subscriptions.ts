// حساب الاشتراك — مصدر الحقيقة الوحيد لتاريخ الانتهاء والسعر. خادم فقط.
// المتصفح يرسل الخيارات؛ الخادم يقرأ الخطة والعرض والإعدادات ويحسب.

export type PlanRow = { id: string; name: string; price: number; duration_months: number; free_months: number; seats_limit: number | null; lifetime_price: boolean; is_active: boolean };
export type PromoRow = { id: string; name: string; discount_type: 'percent' | 'amount'; discount_value: number; valid_from: string | null; valid_to: string | null; max_uses: number | null; used_count: number; is_active: boolean };

export type Quote = {
  starts_on: string; ends_on: string; status: 'trial' | 'active';
  list_price: number; discount: number; final_price: number;
  plan_id: string | null; promotion_id: string | null;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function addMonths(dateISO: string, months: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toISODate(d);
}
export function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}
export const todayISO = () => toISODate(new Date());

/** بداية الاشتراك الجديد: اليوم أو نهاية الاشتراك الحالي، أيهما أبعد (تجديد مبكر لا يضيّع أياماً). */
export function nextStart(currentEndsOn: string | null, requested?: string | null): string {
  const today = todayISO();
  if (requested) return requested;
  if (currentEndsOn && currentEndsOn > today) return addDays(currentEndsOn, 1);
  return today;
}

export function promoError(p: PromoRow | null, on: string): string | null {
  if (!p) return null;
  if (!p.is_active) return 'العرض متوقف';
  if (p.valid_from && on < p.valid_from) return 'العرض لم يبدأ بعد';
  if (p.valid_to && on > p.valid_to) return 'انتهت صلاحية العرض';
  if (p.max_uses != null && p.used_count >= p.max_uses) return 'استُنفد حد استخدام العرض';
  return null;
}

export function buildQuote(opts: { plan: PlanRow | null; promo: PromoRow | null; startsOn: string; trialDays: number }): Quote {
  const { plan, promo, startsOn, trialDays } = opts;
  if (!plan) {
    return { starts_on: startsOn, ends_on: addDays(startsOn, Math.max(trialDays, 0)), status: 'trial', list_price: 0, discount: 0, final_price: 0, plan_id: null, promotion_id: null };
  }
  const list = round2(Number(plan.price));
  let discount = 0;
  if (promo) discount = promo.discount_type === 'percent' ? round2(list * Number(promo.discount_value) / 100) : round2(Number(promo.discount_value));
  discount = Math.min(discount, list);
  return {
    starts_on: startsOn,
    ends_on: addMonths(startsOn, plan.duration_months + plan.free_months),
    status: 'active',
    list_price: list, discount, final_price: round2(list - discount),
    plan_id: plan.id, promotion_id: promo?.id ?? null,
  };
}
