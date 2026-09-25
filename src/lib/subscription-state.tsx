'use client';

import { createContext, useContext } from 'react';

// حالة اشتراك الصيدلية للواجهة — يوفّرها dashboard/layout.tsx لكل صفحات اللوحة.
// readOnly = expired (القفل الفعلي في القاعدة عبر trigger؛ هذا للواجهة فقط كي لا يبدأ الصيدلي عملاً لن يُحفظ).
export type SubscriptionState = { status: string; readOnly: boolean };

export const SubscriptionContext = createContext<SubscriptionState>({ status: '', readOnly: false });
export const useSubscriptionState = () => useContext(SubscriptionContext);

export const READ_ONLY_MESSAGE = 'انتهى اشتراك الصيدلية — الحساب للقراءة فقط حتى التجديد.';

/** يحوّل خطأ القفل القادم من القاعدة إلى رسالة مفهومة؛ وإلا يعيد الرسالة الأصلية أو الافتراضية. */
export function friendlyError(err: unknown, fallback = 'حدث خطأ، حاول مرة أخرى.'): string {
  const text = typeof err === 'string' ? err : (err as { message?: string } | null)?.message ?? '';
  if (/SUBSCRIPTION_READ_ONLY/.test(text)) return READ_ONLY_MESSAGE;
  return text || fallback;
}
