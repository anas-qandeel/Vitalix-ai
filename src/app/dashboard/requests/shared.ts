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
}

export interface RequestRow {
  id: string;
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

// حدّ numeric(10,3) في القاعدة: 7 خانات صحيحة و3 كسرية
export const MONEY_RE = /^\d{1,7}(\.\d{1,3})?$/;

// يحوّل أرقام الإدخال العربية إلى لاتينية ويقبل الفاصلة كفاصل عشري
export function cleanNumberInput(raw: string): string {
  return toLatinDigits(raw).replace(/,/g, '.').replace(/\s/g, '');
}

// بلا عرض: حقول البنود تحدّد عرضها بنفسها (w-full هنا كان يتعارض مع w-20 فيتمدد حقل الكمية ويضغط الاسم)
export const INPUT_BASE = 'px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all';
export const INPUT_CLS = `w-full ${INPUT_BASE}`;
