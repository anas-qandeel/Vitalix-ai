// حسابات إحصاءات /welcome كدوال صافية، تشترك فيها صفحة /admin/ads وملف Excel كي لا تختلف الأرقام بينهما.
// لا استيراد هنا لأي شيء خاص بالخادم: تُستعمل من كود المتصفح أيضاً.

export interface FunnelRow {
  period: string;
  src: string;
  visits: number;
  median_active_seconds: number | null;
  wa_visits: number;
  wa_pct: number | null;
  [k: string]: string | number | null;
}

// أسماء الأقسام العشرة بترتيبها في /welcome (مشتقة من عناوينها الفعلية)
export const SECTION_NAMES = [
  'العنوان الرئيسي', 'سبب الانتقال', 'التنبيه قبل النفاد', 'الصندوق اليومي', 'خدمات العودة',
  'سجل الوصفات', 'متابعة الموظفين', 'أسئلة الاشتراك', 'العرض والسعر', 'ابدأ اليوم',
];
export const BUTTON_ORDER = ['hero', 'offer', 'start', 'float'];
export const BUTTON_LABEL: Record<string, string> = { hero: 'الرئيسي', offer: 'العرض', start: 'ابدأ اليوم', float: 'العائم' };
export const TABLE_SRCS = ['fb-a', 'fb-b', 'ig', 'web'];

export const fmtMedian = (s: number | null | undefined) => {
  if (s == null) return '—';
  const sec = Math.round(Number(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
export const fmtSecs = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const waText = (clicks: string[]) => (clicks.length ? clicks.map(t => BUTTON_LABEL[t] || t).join('، ') : 'لم يضغط');

// اختبار نسبتين: يرجع اسم الإعلان المتفوّق، أو 'none' إن لم يثبت فرق، أو 'small' إن كانت العينة صغيرة
export function verdict(a: FunnelRow | undefined, b: FunnelRow | undefined): { kind: 'small' | 'none' | 'win'; winner?: string } {
  const n1 = a?.visits ?? 0, n2 = b?.visits ?? 0, x1 = a?.wa_visits ?? 0, x2 = b?.wa_visits ?? 0;
  if (n1 < 30 || n2 < 30 || x1 + x2 < 10) return { kind: 'small' };
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { kind: 'none' };
  const z = (x1 / n1 - x2 / n2) / se;
  if (Math.abs(z) >= 1.96) return { kind: 'win', winner: z > 0 ? 'fb-a' : 'fb-b' };
  return { kind: 'none' };
}
// النص نفسه الظاهر في الصفحة
export function verdictText(v: ReturnType<typeof verdict>): string {
  if (v.kind === 'small') return 'العينة ما زالت صغيرة — لا تحكم بعد.';
  if (v.kind === 'none') return 'لا فرق موثوق بعد بين الإعلانين.';
  return `الإعلان ${v.winner} يتفوّق بفرق موثوق.`;
}

export function reached(row: FunnelRow | undefined, n: number): number {
  return row ? Number(row[`reached_${n}_pct`] ?? 0) : 0;
}
// القسم الذي ينتهي عنده أكبر هبوط بين قسمين متتاليين (فهرس 2..10)، أو null إن لم يكن هناك هبوط
export function biggestDrop(row: FunnelRow | undefined): number | null {
  if (!row) return null;
  let best = 0, at: number | null = null;
  for (let n = 2; n <= 10; n++) {
    const drop = reached(row, n - 1) - reached(row, n);
    if (drop > best) { best = drop; at = n; }
  }
  return at;
}

export type DeviceTally = { mobile: number; desktop: number };
// نسبة الجوال من الزيارات المعروفة الجهاز (0..100)، أو null إن لم يُعرف جهاز أي زيارة
export function mobileShare(d: DeviceTally | undefined): number | null {
  const total = (d?.mobile ?? 0) + (d?.desktop ?? 0);
  return total ? (100 * (d?.mobile ?? 0)) / total : null;
}

// تجميع زيارة واحدة في عدّادات الأجهزة والأزرار (زيارة تضغط الزر مرتين تُحسب مرة)
export function tallyVisit(
  v: { src: string; device: string | null; wa_clicks: string[] | null },
  devices: Record<string, DeviceTally>,
  buttons: Record<string, Record<string, number>>,
) {
  const d = (devices[v.src] ||= { mobile: 0, desktop: 0 });
  if (v.device === 'mobile') d.mobile++;
  else if (v.device === 'desktop') d.desktop++;
  for (const tag of new Set<string>(v.wa_clicks || [])) {
    const b = (buttons[tag] ||= {});
    b[v.src] = (b[v.src] || 0) + 1;
  }
}

// وسيط قائمة أرقام (null إن كانت فارغة)
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((x, y) => x - y);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
