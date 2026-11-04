'use client';

import { createContext, useContext } from 'react';
import { ChartBar, type Icon } from '@phosphor-icons/react';

export type AdminRole = 'owner' | 'pharmacist' | 'support';

export type AdminInfo = {
  role: AdminRole;
  userName: string;
  userId: string;
};

const AdminContext = createContext<AdminInfo | null>(null);

export const AdminProvider = AdminContext.Provider;

export function useAdmin(): AdminInfo {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider (src/app/admin/layout.tsx)');
  return ctx;
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'المالك',
  pharmacist: 'صيدلاني المنصة',
  support: 'دعم فني',
};

export const ROUTE_ROLES: Array<{ prefix: string; roles: AdminRole[] }> = [
  { prefix: '/admin/admins', roles: ['owner'] },
  { prefix: '/admin/plans', roles: ['owner'] },
  { prefix: '/admin/blocklist', roles: ['owner', 'pharmacist'] },
  { prefix: '/admin/rejections', roles: ['owner', 'pharmacist'] },
  { prefix: '/admin/ai-monitor', roles: ['owner', 'support'] },
  { prefix: '/admin/ads', roles: ['owner'] },
];

export function canAccess(pathname: string, role: AdminRole): boolean {
  const match = ROUTE_ROLES.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));
  if (!match) return true;
  return match.roles.includes(role);
}

export const NAV: Array<{ href: string; label: string; icon?: Icon }> = [
  { href: '/admin', label: 'الصيدليات' },
  { href: '/admin/plans', label: 'الخطط والاشتراكات' },
  { href: '/admin/blocklist', label: 'قائمة الحظر' },
  { href: '/admin/rejections', label: 'المرفوضات' },
  { href: '/admin/admins', label: 'المسؤولون' },
  { href: '/admin/feedback', label: 'الاقتراحات' },
  { href: '/admin/ai-monitor', label: 'مراقبة الذكاء' },
  { href: '/admin/ads', label: 'الإعلانات', icon: ChartBar },
];

// يُطلق بعد أي تغيير على الاقتراحات ليُحدّث الشريط عدد غير المقروء فوراً
export const FEEDBACK_CHANGED_EVENT = 'vitalix:feedback-changed';
