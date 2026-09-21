import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * دفتر استهلاك الذكاء الاصطناعي — سطر واحد لكل استدعاء Gemini.
 * يُخزَّن عدد التوكنز فقط: لا نص الطلب ولا نص الرد ولا أي بيانات مريض.
 * التكلفة المالية لا تُخزَّن؛ تُحسب عند العرض من سعر قابل للتعديل.
 */
export type AiFeature = 'vitals_report' | 'catalog_profile' | 'weight_plan';
export type AiOutcome = 'used' | 'discarded';

export interface AiUsageEntry {
  pharmacyId: string;
  userId?: string | null;
  staffId?: string | null;
  feature: AiFeature;
  /** مرحلة الاستدعاء داخل الميزة، مثل: raw / compress / summary / profile / plan */
  step: string;
  model: string;
  /** كائن استجابة Gemini كاملاً — تُقرأ منه أعداد التوكنز فقط */
  response: unknown;
  /** discarded = استُهلكت التوكنز ثم أُهمل الرد (فارغ أو غير صالح) */
  outcome?: AiOutcome;
}

interface UsageLike {
  promptTokenCount?: unknown;
  candidatesTokenCount?: unknown;
  thoughtsTokenCount?: unknown;
  totalTokenCount?: unknown;
}

function toCount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
}

/**
 * يسجّل استهلاك استدعاء واحد. لا يرمي خطأ أبداً: فشل التسجيل لا يعطّل أي ميزة.
 * يُنتظر (await) عمداً كي لا تُجمَّد الدالة على Vercel قبل اكتمال الكتابة.
 */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    if (!entry.pharmacyId) return;
    const holder = entry.response as { usageMetadata?: UsageLike } | null | undefined;
    const usage: UsageLike = holder?.usageMetadata ?? {};
    const { error } = await supabaseAdmin.from('ai_usage_log').insert({
      pharmacy_id: entry.pharmacyId,
      user_id: entry.userId ?? null,
      staff_id: entry.staffId ?? null,
      feature: entry.feature,
      step: entry.step,
      model: entry.model,
      prompt_tokens: toCount(usage.promptTokenCount),
      output_tokens: toCount(usage.candidatesTokenCount),
      thoughts_tokens: toCount(usage.thoughtsTokenCount),
      total_tokens: toCount(usage.totalTokenCount),
      outcome: entry.outcome ?? 'used',
    });
    if (error) console.warn('[ai-usage] insert failed:', error.message);
  } catch (e) {
    console.warn('[ai-usage] skipped:', e);
  }
}
