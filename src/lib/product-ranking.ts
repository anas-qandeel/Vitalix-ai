import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * حلقة التعلّم (المرحلة 6) — ترتيب المنتجات «الملائمة» فيما بينها بناءً على أحداث الصيدلية نفسها.
 * لا يتجاوز محرك الملاءمة أبداً: «ممنوع» لا يصل إلى هنا أصلاً، و«ملائم» يسبق «بحذر» مهما كانت الدرجة.
 * منفصل لكل صيدلية: الأحداث تُجلب بـ pharmacy_id فقط.
 * حتمي بالكامل: نفس الأحداث ← نفس الترتيب؛ التعادل يُكسر بالاسم.
 */
export const RANKING_WINDOW_DAYS = 90;

export const EVENT_WEIGHTS: Record<string, number> = {
  patient_inquired:    1,   // اهتمام مريض
  pharmacist_excluded: -2,  // قرار مهني — أثقل من اهتمام المريض
};

export function scoreFromEvents(events: { product_id: string; event_type: string }[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const e of events) {
    const w = EVENT_WEIGHTS[e.event_type];
    if (w === undefined) continue;
    scores.set(e.product_id, (scores.get(e.product_id) ?? 0) + w);
  }
  return scores;
}

/** يجلب أحداث الصيدلية للمنتجات المرشّحة ضمن النافذة ويحوّلها إلى درجات. فشل الجلب ← درجات محايدة (لا كسر). */
export async function fetchProductScores(
  client: SupabaseClient<any, any, any>,
  pharmacyId: string,
  productIds: string[],
  windowDays: number = RANKING_WINDOW_DAYS,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data, error } = await client
    .from('catalog_product_events')
    .select('product_id, event_type')
    .eq('pharmacy_id', pharmacyId)
    .in('product_id', productIds)
    .gte('created_at', since);
  if (error) {
    console.warn('[product-ranking] events fetch failed — neutral scores used:', error);
    return new Map();
  }
  return scoreFromEvents((data ?? []) as { product_id: string; event_type: string }[]);
}

export interface Rankable { status: 'ok' | 'caution'; score: number; name: string; relevant?: boolean }

/** مقارن الفرز: ملائم قبل بحذر، ثم "يفيد حالة المريض" قبل غيره (اختياري)، ثم الدرجة الأعلى، ثم الاسم أبجدياً. */
export function rankSuitable(a: Rankable, b: Rankable): number {
  if (a.status !== b.status) return a.status === 'ok' ? -1 : 1;
  const ra = a.relevant ? 1 : 0, rb = b.relevant ? 1 : 0;
  if (ra !== rb) return rb - ra;
  if (a.score !== b.score) return b.score - a.score;
  return a.name.localeCompare(b.name);
}
