'use client';

import { supabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/tenant';
import { NOTIFICATIONS_ENABLED } from './config';
import { addSeen, seenId, seenKeyOf, type SeenKind } from './seen';

/**
 * مُعلِّم «رأيتُ» تستدعيه الشاشات التي تعرض ملاحظات الكادر (انظر seen.ts).
 * الميزة مغلقة (NOTIFICATIONS_ENABLED=false): لا استعلام ولا تخزين — السلوك كما كان تماماً.
 * فشل أي خطوة صامت: «رأيتُ» تحسين، ولا يجوز أن يعطّل الصفحة التي استدعته.
 */
export async function markSeenIds(kind: SeenKind, ids: readonly string[]): Promise<void> {
  if (!NOTIFICATIONS_ENABLED || ids.length === 0) return;
  try {
    const tenant = await getTenantContext();
    addSeen(seenKeyOf(tenant), ids.map((id) => seenId(kind, id)));
  } catch { /* لا شيء */ }
}

/** فتح ملف المريض: ملاحظاته المفتوحة الآن صارت مرئية (معرّفات فقط، بلا نص الملاحظة). */
export async function markPatientNotesSeen(patientId: string): Promise<void> {
  if (!NOTIFICATIONS_ENABLED) return;
  try {
    const { data, error } = await supabase.from('patient_notes').select('id').eq('patient_id', patientId).is('closed_at', null);
    if (error || !Array.isArray(data)) return;
    await markSeenIds('pn', (data as { id: string }[]).map((r) => r.id));
  } catch { /* لا شيء */ }
}
