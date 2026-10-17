import { supabase } from '@/lib/supabase';
import { normalizeAr } from '@/lib/arabic';

// الأصناف كثيرة الطلب: عدّ حتمي (بلا ذكاء اصطناعي) ونصيحة مخزون للصيدلاني وحده.
// الثوابت هنا فقط وتصل القاعدة معاملات لـ request_product_stats، فلا نسخة ثانية في SQL تنجرف.

/** الحد الأدنى لعدد الطلبات المختلفة داخل النافذة ليُعدّ الصنف «مطلوباً بكثرة» */
export const FREQUENT_MIN_REQUESTS = 3;
/** نافذة العدّ بالأيام التقويمية بتوقيت عمّان (اليوم + الأيام السابقة) */
export const FREQUENT_WINDOW_DAYS = 60;
/** مدى سجل الأسماء المقترحة أثناء الكتابة (يشمل الأسماء المطلوبة مرة واحدة) */
export const SUGGEST_HISTORY_DAYS = 365;

export interface ProductStat {
  name_key: string;
  display_name: string;
  requests_in_window: number;
  patients_in_window: number;
  last_requested_at: string;
  requests_in_history: number;
}

// ═══════════════════════════════════════════════════════
// التطبيع: يطابق normalize_product_name في القاعدة خطوة بخطوة وبالترتيب نفسه
// (ترحيل 20261017100000_frequent_request_products.sql). أي تعديل هنا يستوجب تعديله هناك.
// ═══════════════════════════════════════════════════════
export function normalizeProductName(s: string): string {
  const folded = normalizeAr(s)                                        // 1. normalize_ar
    .replace(/ـ/g, '')                                            // 2. حذف التطويل
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)) // 3. الأرقام الهندية
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0)) //    والفارسية
    .replace(/[-._]/g, ' ')                                            // 4. - . _ ← مسافة
    // 5. طيّ المسافات البيضاء: \s في JavaScript هي المجموعة المذكورة في تعليق الترحيل بالضبط
    .replace(/\s+/g, ' ');
  return folded.replace(/^ +| +$/g, '');                               // 6. btrim (مسافة عادية فقط)
}

// ═══════════════════════════════════════════════════════
// المنطق
// ═══════════════════════════════════════════════════════
export function isFrequent(stat: ProductStat): boolean {
  return stat.requests_in_window >= FREQUENT_MIN_REQUESTS;
}

/** مفتاح التطبيع ← الإحصاءات، للبحث الفوري أثناء الكتابة */
export function indexStats(stats: ProductStat[]): Map<string, ProductStat> {
  return new Map(stats.map(s => [s.name_key, s]));
}

/** أسماء سبق طلبها: البادئة أولاً ثم الاحتواء، وبترتيب القاعدة داخل كل مجموعة؛ المطابقة التامة للنص المكتوب تُستبعد */
export function suggestNames(stats: ProductStat[], typed: string, limit = 6): ProductStat[] {
  const key = normalizeProductName(typed);
  if (!key) return [];
  const prefix: ProductStat[] = [];
  const contains: ProductStat[] = [];
  for (const s of stats) {
    if (s.name_key === key) continue;
    if (s.name_key.startsWith(key)) prefix.push(s);
    else if (s.name_key.includes(key)) contains.push(s);
  }
  return [...prefix, ...contains].slice(0, limit);
}

/** «مرات» من 3 إلى 10، و«مرة» من 11 فأكثر (وحالتا العدد 1 و2 للاكتمال) */
export function timesLabel(n: number): string {
  if (n === 1) return 'مرة واحدة';
  if (n === 2) return 'مرتين';
  return n <= 10 ? `${n} مرات` : `${n} مرة`;
}

export function patientsLabel(n: number): string {
  if (n === 1) return 'مريض واحد';
  if (n === 2) return 'مريضين';
  return n <= 10 ? `${n} مرضى` : `${n} مريضاً`;
}

/** عبارة النافذة مشتقة من الثابت: 60 ← «الشهرين الماضيين»، 30 ← «الشهر الماضي»، وإلا «آخر N يوماً» */
export function windowPhrase(days = FREQUENT_WINDOW_DAYS): string {
  if (days === 60) return 'الشهرين الماضيين';
  if (days === 30) return 'الشهر الماضي';
  return `آخر ${days} يوماً`;
}

export function frequentHint(stat: ProductStat | undefined): string | null {
  if (!stat || !isFrequent(stat)) return null;
  return `طُلب ${timesLabel(stat.requests_in_window)} خلال ${windowPhrase()} — يُنصح بتوفيره دائماً`;
}

const AMMAN_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Amman', day: '2-digit', month: '2-digit', year: 'numeric' });
/** dd/mm/yyyy بأرقام لاتينية وبتوقيت عمّان */
export function formatRequestDate(iso: string): string {
  return AMMAN_DATE.format(new Date(iso));
}

export async function fetchProductStats(): Promise<ProductStat[]> {
  const { data, error } = await supabase.rpc('request_product_stats', {
    p_window_days: FREQUENT_WINDOW_DAYS,
    p_history_days: SUGGEST_HISTORY_DAYS,
  });
  if (error) throw error;
  return (data ?? []) as ProductStat[];
}
