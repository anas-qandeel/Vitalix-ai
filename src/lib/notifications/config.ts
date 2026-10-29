import { USE_SIDEBAR } from '@/app/dashboard/components/shell-config';
import { makeConfig, type NotifyConfig, type Routes } from './engine';

// مغلق افتراضياً في كل مكان: يعمل فقط مع القائمة الجانبية ومتغير بيئة صريح (الصيغة حرفية كي يستبدلها Next.js وقت البناء)
export const NOTIFICATIONS_ENABLED = USE_SIDEBAR && process.env.NEXT_PUBLIC_NOTIFICATIONS === 'true';

// تسجيل تشخيصي اختياري (أرقام وحالات مصادر فقط، بلا أي بيانات) — لا يعمل إلا مع الميزة نفسها
export const NOTIFICATIONS_DEBUG = NOTIFICATIONS_ENABLED && process.env.NEXT_PUBLIC_NOTIFICATIONS_DEBUG === 'true';

// الروابط الفعلية التي تستعملها القائمة الجانبية والصفحات اليوم
export const NOTIFICATION_ROUTES: Routes = {
  home: '/dashboard',
  chronic: '/dashboard/chronic',
  inventory: '/dashboard/chronic?view=inventory', // الرابط العميق الذي تقرؤه useInventoryDeepLink
  requests: '/dashboard/requests',
  catalog: '/dashboard/pharmacy-catalog-manager',
  patients: '/dashboard/patients',
  account: '/dashboard/profile', // الاشتراك وبيانات الصيدلية (للمالك وحده، كما في dashboard/layout.tsx)
  patient: (id) => `/dashboard/patients/${id}`,
};

// mirrors chronic/page.tsx:42-46 — المتغير نفسه والافتراضي نفسه (5)، كي لا يختلف «بلا رد» بين الجرس والصفحة
const MSG_EXPIRY_DAYS = Number(process.env.NEXT_PUBLIC_MSG_EXPIRY_DAYS != null ? process.env.NEXT_PUBLIC_MSG_EXPIRY_DAYS : 5);

/**
 * noResponseArchiveDays يبقى null عمداً: NEXT_PUBLIC_NO_RESPONSE_ARCHIVE_DAYS في صفحة المزمنين (الافتراضي 30)
 * عتبة لنص إرشادي على البطاقة فقط (chronic/page.tsx:281-285) ولا أرشفة تلقائية؛ الأرشفة يدوية (:2292).
 */
export function buildConfig(): NotifyConfig {
  return makeConfig(NOTIFICATION_ROUTES, MSG_EXPIRY_DAYS);
}
