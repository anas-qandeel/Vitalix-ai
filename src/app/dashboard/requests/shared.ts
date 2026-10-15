// أنواع وثوابت مشتركة بين صفحة الطلبات ونافذة التفاصيل. ملف مستقل لأن ملف page.tsx في Next
// لا يجوز أن يصدّر غير المكوّن الافتراضي.

export type RequestStatus = 'recorded' | 'ordered' | 'arrived' | 'delivered' | 'cancelled';

export interface RequestRow {
  id: string;
  price: number | null;
  deposit: number | null;
  status: RequestStatus;
  created_at: string;
  patient: { name: string; phone_number: string } | null;
  creator: { name: string } | null;
  items: { id: string; product_name: string; quantity: number; cancelled: boolean; supplier: string | null; arrived: boolean }[];
}

export const STATUS_META: Record<RequestStatus, { label: string; badge: string; dot: string }> = {
  recorded:  { label: 'مسجّل',                  badge: 'bg-slate-50 text-slate-700 border-slate-200',      dot: 'bg-slate-400' },
  ordered:   { label: 'طُلب من المورد',         badge: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500' },
  arrived:   { label: 'وصل — بانتظار المريض',   badge: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500 animate-pulse' },
  delivered: { label: 'سُلّم',                  badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  cancelled: { label: 'ملغى',                   badge: 'bg-rose-50 text-rose-700 border-rose-200',         dot: 'bg-rose-500' },
};

export function fmtJd(n: number): string {
  return Number(n).toFixed(3);
}

// طرح بالأجزاء الألفية لتفادي ضجيج الفاصلة العائمة (0.1 + 0.2)
export function remaining(price: number, deposit: number): number {
  return Math.round((Number(price) - Number(deposit)) * 1000) / 1000;
}
