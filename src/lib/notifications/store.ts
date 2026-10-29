'use client';

import { useSyncExternalStore } from 'react';
import type { NotificationSummary } from './engine';

// نفس نمط chronic/inventory-link.ts: متغير على مستوى الملف مع اشتراك بسيط، فتشاركه كل المكوّنات بلا Context
let summary: NotificationSummary | null = null;
const listeners = new Set<() => void>();

export function setNotificationSummary(next: NotificationSummary | null): void {
  if (summary === next) return;
  summary = next;
  listeners.forEach((l) => l());
}

export const subscribeNotifications = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
export const getNotificationSnapshot = (): NotificationSummary | null => summary;
const getServerSnapshot = (): NotificationSummary | null => null;

/** loading = لم يصل أول حساب بعد (أو الميزة مغلقة) */
export function useNotifications(): { summary: NotificationSummary | null; loading: boolean } {
  const s = useSyncExternalStore(subscribeNotifications, getNotificationSnapshot, getServerSnapshot);
  return { summary: s, loading: s === null };
}
