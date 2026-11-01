'use client';

import { useSyncExternalStore } from 'react';

// حالة فتح لوحة الإشعارات: متغير على مستوى الملف مع اشتراك بسيط (نفس نمط store.ts و chronic/inventory-link.ts)،
// فيفتحها الجرس في القائمة الجانبية أو في الشريط العلوي، وتقرؤها اللوحة، بلا Context ولا تعديل لـ DashboardShell.
let open = false;
let opener: HTMLElement | null = null; // الزر الذي فتحها: إليه يعود التركيز عند الإغلاق
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const subscribePanel = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};
export const getPanelOpen = (): boolean => open;

export function openNotificationsPanel(from?: HTMLElement | null): void {
  if (open) return;
  opener = from ?? null;
  open = true;
  emit();
}

/** restoreFocus=false عند الانتقال لصفحة أخرى أو الضغط خارج اللوحة: لا نسحب التركيز من الهدف الجديد. */
export function closeNotificationsPanel(restoreFocus = true): void {
  if (!open) return;
  open = false;
  const el = opener;
  opener = null;
  emit();
  if (restoreFocus && el && el.isConnected) el.focus();
}

export function toggleNotificationsPanel(from?: HTMLElement | null): void {
  if (open) closeNotificationsPanel(true);
  else openNotificationsPanel(from);
}

export function useNotificationsPanelOpen(): boolean {
  return useSyncExternalStore(subscribePanel, getPanelOpen, () => false);
}
