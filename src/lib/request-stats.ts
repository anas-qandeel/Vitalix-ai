import { supabase } from '@/lib/supabase';
import { FRIDAY, SAME_DAY_ORDER_UNTIL } from '@/lib/request-overdue';

// إحصائيات الطلبات على مستوى الصيدلية (لا أرقام لكل موظف). الحساب كله في القاعدة (ترحيل
// 20261017200000_request_statistics.sql)؛ هنا الثوابت والأنواع والتنسيق فقط.

/** الفترات المتاحة بالأيام (الأولى هي الافتراضية) */
export const STATS_PERIODS = [30, 90] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

/** أقل عدد عيّنات ليُعرض رقم مدة؛ دونه «بيانات غير كافية» (الوسيط على عيّنة صغيرة يوهم بدقة غير موجودة) */
export const MIN_SAMPLE_DURATION = 5;
/** أقل عدد عيّنات لمدة مورد أو لنسبة التزامه بالموعد */
export const MIN_SAMPLE_SUPPLIER = 3;

export interface StatsSummary {
  requests_total: number;
  requests_delivered: number;
  requests_open: number;
  requests_cancelled: number;
  cancelled_pending_refund: number;
  items_total: number;
  items_cancelled: number;
  reg_to_ordered_n: number;
  reg_to_ordered_median_seconds: number | null;
  reg_to_ordered_avg_seconds: number | null;
  ordered_to_arrived_n: number;
  ordered_to_arrived_median_seconds: number | null;
  ordered_to_arrived_avg_seconds: number | null;
  arrived_to_delivered_n: number;
  arrived_to_delivered_median_seconds: number | null;
  arrived_to_delivered_avg_seconds: number | null;
  reg_to_delivered_n: number;
  reg_to_delivered_median_seconds: number | null;
  reg_to_delivered_avg_seconds: number | null;
  legacy_without_ordered_at: number;
}

export interface SupplierStat {
  supplier_key: string;
  display_name: string;
  items_ordered: number;
  arrived_n: number;
  median_seconds: number | null;
  avg_seconds: number | null;
  on_time_n: number | null;
  resolved_n: number | null;
}

export interface StatsData { summary: StatsSummary; suppliers: SupplierStat[] }

/** ثوابت قاعدة الوصول المتوقع تؤخذ من request-overdue.ts لا من نسخة مكتوبة هنا */
export async function fetchRequestStats(days: number): Promise<StatsData> {
  const [summaryRes, suppliersRes] = await Promise.all([
    supabase.rpc('request_stats_summary', { p_days: days }),
    supabase.rpc('request_stats_suppliers', { p_days: days, p_same_day_until: SAME_DAY_ORDER_UNTIL, p_weekend_dow: FRIDAY }),
  ]);
  if (summaryRes.error) throw summaryRes.error;
  if (suppliersRes.error) throw suppliersRes.error;
  const summary = (summaryRes.data as StatsSummary[] | null)?.[0];
  if (!summary) throw new Error('empty summary');
  return { summary, suppliers: (suppliersRes.data ?? []) as SupplierStat[] };
}

// ═══════════════════════════════════════════════════════
// التنسيق
// ═══════════════════════════════════════════════════════
const HOUR = 3600;
const DAY = 86400;

/**
 * مدة مقروءة بالعربية: أقل من ساعة ← «أقل من ساعة»؛ حتى 23 ساعة ← ساعات صحيحة مقرَّبة؛
 * من يوم فأكثر ← أقرب نصف يوم («يوم ونصف»، «3 أيام ونصف»). الأرقام لاتينية.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < HOUR) return 'أقل من ساعة';
  const hours = Math.round(seconds / HOUR);
  if (hours < 24) {
    if (hours === 1) return 'ساعة واحدة';
    if (hours === 2) return 'ساعتان';
    return hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`;
  }
  // 23.5 ساعة وما فوقها تُقرَّب إلى 24 فتدخل هنا؛ أقل رقم ممكن «يوم واحد»
  const halves = Math.max(2, Math.round(seconds / (DAY / 2)));
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  let base: string;
  if (whole === 1) base = 'يوم';
  else if (whole === 2) base = 'يومان';
  else base = whole <= 10 ? `${whole} أيام` : `${whole} يوماً`;
  if (!half) return whole === 1 ? 'يوم واحد' : base;
  return `${base} ونصف`;
}

/** نسبة صحيحة مقرَّبة؛ null حين لا مقام */
export function formatPercent(part: number, whole: number): string | null {
  if (!whole) return null;
  return `${Math.round((part / whole) * 100)}%`;
}

/** عدد مع معدوده بصياغة عربية سليمة: واحد / اثنان / 3–10 جمع قلة / 11 فأكثر تمييز مفرد */
export function countNoun(n: number, f: { one: string; two: string; few: string; many: string }): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  return n <= 10 ? `${n} ${f.few}` : `${n} ${f.many}`;
}

export const itemsCount = (n: number) => countNoun(n, { one: 'صنف واحد', two: 'صنفان', few: 'أصناف', many: 'صنفاً' });
export const requestsCount = (n: number) => countNoun(n, { one: 'طلب واحد', two: 'طلبان', few: 'طلبات', many: 'طلباً' });
export const legacyItemsCount = (n: number) => countNoun(n, { one: 'صنف قديم واحد', two: 'صنفان قديمان', few: 'أصناف قديمة', many: 'صنفاً قديماً' });

/** سطر الأصناف القديمة (وصلت بلا وقت طلب من المورد) مع مطابقة الصفة للعدد */
export function legacyNote(n: number): string {
  if (n === 1) return 'وصنف قديم واحد غير محتسب';
  if (n === 2) return 'وصنفان قديمان غير محتسبين';
  // 3–10 جمع قلة فالصفة جمع، و11 فأكثر تمييز مفرد فالصفة مفردة
  return n <= 10 ? `و${n} أصناف قديمة غير محتسبة` : `و${n} صنفاً قديماً غير محتسب`;
}
