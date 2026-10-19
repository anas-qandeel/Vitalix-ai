// أنواع وثوابت مشتركة بين صفحة الطلبات ونافذة التفاصيل. ملف مستقل لأن ملف page.tsx في Next
// لا يجوز أن يصدّر غير المكوّن الافتراضي.
import { toLatinDigits } from '@/lib/phone';

// حالة الطلب (مفتوح حتى يُسلَّم كل صنف فعّال أو يُلغى كله) ومرحلة كل صنف (مخطط v2)
export type RequestStatus = 'open' | 'delivered' | 'cancelled';
export type ItemStage = 'recorded' | 'ordered' | 'arrived' | 'delivered' | 'cancelled';

export interface RequestItem {
  id: string;
  product_name: string;
  quantity: number;
  supplier: string | null;
  stage: ItemStage;
  ordered_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  // لحظة دخول البند مرحلته الحالية (تضبطها القاعدة)؛ عليها يُحسب تأخر الطلبات
  stage_changed_at: string;
  // يُملأ في نافذة التفاصيل فقط: غير فارغ = أُلغي البند بإلغاء الطلب نفسه (لا بإلغاء فردي)
  stage_before_cancel?: string | null;
}

export interface RequestRow {
  id: string;
  patient_id: string;
  request_number: number;
  request_year: number;
  price: number | null;
  deposit: number | null;
  deposit_returned: boolean | null;
  status: RequestStatus;
  created_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  patient: { name: string; phone_number: string } | null;
  creator: { name: string } | null;
  items: RequestItem[];
  payments: { amount: number }[];
}

export const STATUS_META: Record<RequestStatus, { label: string; badge: string; dot: string }> = {
  open:      { label: 'مفتوح', badge: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500' },
  delivered: { label: 'سُلّم', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: 'ملغى',  badge: 'bg-rose-50 text-rose-700 border-rose-200',          dot: 'bg-rose-500' },
};

export const STAGE_META: Record<ItemStage, { label: string; chip: string }> = {
  recorded:  { label: 'مسجّل',         chip: 'bg-slate-50 text-slate-600 border-slate-200' },
  ordered:   { label: 'طُلب من المورد', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  arrived:   { label: 'وصل',           chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  delivered: { label: 'سُلّم',         chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ملغى',          chip: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// ترتيب المراحل: أي انتقال إلى رقم أصغر تراجع
export const STAGE_RANK: Record<ItemStage, number> = { recorded: 1, ordered: 2, arrived: 3, delivered: 4, cancelled: 5 };

// وقت دخول الصنف مرحلته الحالية (المسجّل لا وقت له على البند)
export function stageTime(it: RequestItem): string | null {
  switch (it.stage) {
    case 'ordered': return it.ordered_at;
    case 'arrived': return it.arrived_at;
    case 'delivered': return it.delivered_at;
    case 'cancelled': return it.cancelled_at;
    default: return null;
  }
}

// طلب ملغى عربونه لم يُعَد بعد: يبقى بين «المفتوحة» حتى يُسجَّل الإرجاع
export function isPendingRefund(r: { status: RequestStatus; deposit: number | null; deposit_returned: boolean | null }): boolean {
  return r.status === 'cancelled' && Number(r.deposit ?? 0) > 0 && r.deposit_returned === false;
}

// عنوان الطلب «طلب مواد رقم N/YYYY» (الترقيم يبدأ من 1 كل سنة بتوقيت عمّان)
export function requestTitle(number: number, year: number): string {
  return `طلب مواد رقم ${number}/${year}`;
}

export function fmtJd(n: number): string {
  return Number(n).toFixed(3);
}

export function paidTotal(payments: { amount: number }[]): number {
  return Math.round(payments.reduce((sum, p) => sum + Number(p.amount), 0) * 1000) / 1000;
}

// المتبقي = السعر الإجمالي − العربون − المدفوع عند التسليم (بالأجزاء الألفية لتفادي ضجيج الفاصلة العائمة)
export function remainingAmount(price: number, deposit: number | null, paid: number): number {
  return Math.round((Number(price) - Number(deposit ?? 0) - Number(paid)) * 1000) / 1000;
}

// ═══════════════════════════════════════════════════════
// رسائل المريض عبر واتساب — باسم الصيدلية فقط (لا ذكر للمنصة)، وآخر سطر فيهما اسم الصيدلية وحده
// ═══════════════════════════════════════════════════════
export type PatientMessageKind = 'confirmation' | 'arrival';

export interface PatientMessageInput {
  kind: PatientMessageKind;
  patientName: string;
  number: number;
  year: number;
  items: RequestItem[];
  price: number | null;
  deposit: number | null;
  paid: number;
  includeAmounts: boolean;
  pharmacyName: string;
}

const jd = (n: number): string => `${fmtJd(n)} د.أ`;

export function buildPatientMessage(m: PatientMessageInput): string {
  const price = m.price != null ? Number(m.price) : null;
  const deposit = Number(m.deposit ?? 0);
  const itemLine = (it: RequestItem) => `• ${it.product_name} × ${it.quantity}`;

  // كتل نصية تُفصل بسطر فارغ واحد؛ الكتلة الفارغة تسقط مع سطرها الفارغ، فلا سطران فارغان متتاليان
  // ولا سطر فارغ في بداية الرسالة أو نهايتها
  const blocks: string[][] = [[`مرحباً ${m.patientName}،`]];

  if (m.kind === 'confirmation') {
    blocks.push([`تم تسجيل طلبك رقم ${m.number}/${m.year}:`, ...m.items.filter(it => it.stage !== 'cancelled').map(itemLine)]);
    if (m.includeAmounts) {
      const money: string[] = [];
      if (price != null) {
        money.push(`السعر الإجمالي: ${jd(price)}`);
        if (deposit > 0) money.push(`العربون المدفوع: ${jd(deposit)}`);
        money.push(`المتبقي: ${jd(remainingAmount(price, deposit, m.paid))}`);
      } else if (deposit > 0) {
        money.push(`العربون المدفوع: ${jd(deposit)}`);
      }
      blocks.push(money);
    }
    blocks.push(['سنتواصل معك فور وصول طلبك.']);
  } else {
    const waiting = m.items.filter(it => it.stage === 'recorded' || it.stage === 'ordered').map(it => it.product_name);
    // صياغة سطر الطلب بحسب الحال: أصناف ما زالت معلّقة / باقي الطلب بعد تسليم جزئي / الطلب كله
    const hasDelivered = m.items.some(it => it.stage === 'delivered');
    const arrivalLead = waiting.length > 0
      ? `وصل من طلبك رقم ${m.number}/${m.year}:`
      : hasDelivered
        ? `وصل باقي طلبك رقم ${m.number}/${m.year}:`
        : `وصل طلبك رقم ${m.number}/${m.year}:`;
    blocks.push([
      arrivalLead,
      ...m.items.filter(it => it.stage === 'arrived').map(itemLine),
      'وهو جاهز للاستلام من الصيدلية.',
    ]);
    if (waiting.length > 0) blocks.push([`وما زلنا بانتظار: ${waiting.join('، ')}، وسنبلغك عند وصوله.`]);
    if (m.includeAmounts) {
      if (price != null) blocks.push([`المتبقي من قيمة الطلب: ${jd(remainingAmount(price, deposit, m.paid))}.`]);
      else if (deposit > 0) blocks.push([`سيُخصم العربون المدفوع (${jd(deposit)}) عند الاستلام.`]);
    }
  }

  blocks.push([m.pharmacyName]);
  return blocks.filter(b => b.length > 0).map(b => b.join('\n')).join('\n\n');
}

// حدّ numeric(10,3) في القاعدة: 7 خانات صحيحة و3 كسرية
export const MONEY_RE = /^\d{1,7}(\.\d{1,3})?$/;

// يحوّل أرقام الإدخال العربية إلى لاتينية ويقبل الفاصلة كفاصل عشري
export function cleanNumberInput(raw: string): string {
  return toLatinDigits(raw).replace(/,/g, '.').replace(/\s/g, '');
}

// بلا عرض: حقول البنود تحدّد عرضها بنفسها (w-full هنا كان يتعارض مع w-20 فيتمدد حقل الكمية ويضغط الاسم)
export const INPUT_BASE = 'px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all';
export const INPUT_CLS = `w-full ${INPUT_BASE}`;

// تبويب «المغلقة»: يعرض افتراضياً ما أُغلق خلال آخر N يوماً تقويمياً بتوقيت عمّان (اليوم + N-1 قبله)
export const CLOSED_WINDOW_DAYS = 30;

// بداية اليوم (00:00 بتوقيت عمّان) قبل days-1 يوماً من اليوم، كلحظة ISO. لا نفترض إزاحة ثابتة: نقرأ إزاحة عمّان
// الفعلية عند تلك اللحظة من Intl (الأردن يعتمد +03 دائماً منذ 2022، لكن التواريخ القديمة قد تختلف)
const AMMAN_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function ammanParts(d: Date): { y: number; m: number; d: number; ms: number } {
  const p: Record<string, number> = {};
  for (const part of AMMAN_FMT.formatToParts(d)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { y: p.year, m: p.month, d: p.day, ms: Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) };
}

export function closedWindowStartIso(days: number = CLOSED_WINDOW_DAYS, now: Date = new Date()): string {
  const today = ammanParts(now);
  const targetLocal = Date.UTC(today.y, today.m - 1, today.d - (days - 1)); // منتصف الليل المحلي كأنه UTC
  let guess = targetLocal - 3 * 3600000;
  for (let i = 0; i < 2; i++) {
    guess = targetLocal - (ammanParts(new Date(guess)).ms - guess);
  }
  return new Date(guess).toISOString();
}
