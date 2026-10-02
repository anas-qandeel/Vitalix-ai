import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * دفتر استهلاك الذكاء الاصطناعي — سطر واحد لكل استدعاء Gemini (ناجح أو فاشل) ولكل رسالة احتياطية.
 * يُخزَّن عدد التوكنز ورمز الخطأ ورسالته المختصرة فقط: لا نص الطلب ولا نص الرد ولا أي بيانات مريض.
 * التكلفة المالية لا تُخزَّن؛ تُحسب عند العرض من سعر قابل للتعديل.
 */
export type AiFeature = 'vitals_report' | 'catalog_profile' | 'weight_plan';
export type AiOutcome = 'used' | 'discarded' | 'failed' | 'fallback';

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
  /** discarded = استُهلكت التوكنز ثم أُهمل الرد (فارغ أو غير صالح) — failed = استدعاء رمى خطأ — fallback = خرجت رسالة احتياطية */
  outcome?: AiOutcome;
  /** للفشل والاحتياطي فقط: رمز الخطأ (0 إن لم يوجد رمز) ورسالته المختصرة */
  errorStatus?: number | null;
  errorMessage?: string | null;
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
      error_status: entry.errorStatus ?? null,
      error_message: entry.errorMessage ? String(entry.errorMessage).slice(0, 300) : null,
    });
    if (error) console.warn('[ai-usage] insert failed:', error.message);
  } catch (e) {
    console.warn('[ai-usage] skipped:', e);
  }
}

/**
 * إشعار الجرس عند خروج رسالة احتياطية في الملخّص الذكي — مرة لكل صيدلية في اليوم
 * (الدالة notify_ai_fallback في القاعدة تتجاهل التكرار). لا يرمي خطأ أبداً.
 */
export async function notifyAiFallback(pharmacyId: string, pharmacyName: string): Promise<void> {
  try {
    if (!pharmacyId) return;
    const { error } = await supabaseAdmin.rpc('notify_ai_fallback', {
      p_pharmacy_id: pharmacyId,
      p_message: `رسالة احتياطية في ${pharmacyName}: تعذّر الملخّص الذكي اليوم — راجع مراقبة الذكاء.`,
    });
    if (error) console.warn('[ai-usage] notify failed:', error.message);
  } catch (e) {
    console.warn('[ai-usage] notify skipped:', e);
  }
}
