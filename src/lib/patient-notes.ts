import { supabase } from '@/lib/supabase';
import { READ_ONLY_MESSAGE } from '@/lib/subscription-state';

export interface PatientNote {
  id: string;
  patient_id: string;
  body: string;
  author_name: string;
  created_at: string;
  closed_at: string | null;
  closed_by_name: string | null;
}

export const NOTE_MAX = 1000;

// أعمدة العرض فقط؛ الصيدلية والكاتب والإغلاق تضبطها triggers القاعدة لا العميل
const NOTES_SELECT = 'id, patient_id, body, author_name, created_at, closed_at, closed_by_name';

export type NoteResult = { ok: true } | { ok: false; message: string };
export type CloseResult = { status: 'closed' } | { status: 'already_closed' } | { status: 'error'; message: string };

/** يحوّل أخطاء triggers القاعدة إلى رسالة عربية مفهومة */
export function noteErrorMessage(err: unknown): string {
  const text = typeof err === 'string' ? err : (err as { message?: string } | null)?.message ?? '';
  if (/SUBSCRIPTION_READ_ONLY/.test(text)) return READ_ONLY_MESSAGE;
  if (/STAFF_REQUIRED/.test(text)) return 'يلزم حساب موظف نشط لكتابة الملاحظات أو إغلاقها.';
  if (/ALREADY_CLOSED/.test(text)) return 'أُغلقت هذه الملاحظة من قبل.';
  if (/PATIENT_NOT_FOUND/.test(text)) return 'المريض غير موجود.';
  if (/IMMUTABLE_FIELD/.test(text)) return 'لا يمكن تعديل الملاحظة بعد حفظها.';
  return 'تعذّر تنفيذ العملية. تحقّق من اتصالك ثم حاول مرة أخرى.';
}

/** كل ملاحظات المريض (المفتوحة والمغلقة)، الأحدث أولاً */
export async function fetchPatientNotes(patientId: string): Promise<{ notes: PatientNote[]; error: boolean }> {
  const { data, error } = await supabase
    .from('patient_notes')
    .select(NOTES_SELECT)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  if (error) return { notes: [], error: true };
  return { notes: (data ?? []) as PatientNote[], error: false };
}

/** المفتوحة فقط لعدة مرضى باستعلام واحد (للقوائم) */
export async function fetchOpenNotesFor(patientIds: string[]): Promise<{ notes: PatientNote[]; error: boolean }> {
  if (patientIds.length === 0) return { notes: [], error: false };
  const { data, error } = await supabase
    .from('patient_notes')
    .select(NOTES_SELECT)
    .in('patient_id', patientIds)
    .is('closed_at', null)
    .order('created_at', { ascending: false });
  if (error) return { notes: [], error: true };
  return { notes: (data ?? []) as PatientNote[], error: false };
}

export async function addPatientNote(patientId: string, body: string): Promise<NoteResult> {
  const text = body.trim();
  if (!text) return { ok: false, message: 'اكتب الملاحظة أولاً.' };
  if (text.length > NOTE_MAX) return { ok: false, message: `الملاحظة لا تتجاوز ${NOTE_MAX} حرف.` };
  const { error } = await supabase.from('patient_notes').insert({ patient_id: patientId, body: text });
  if (error) return { ok: false, message: noteErrorMessage(error) };
  return { ok: true };
}

export async function closePatientNote(id: string): Promise<CloseResult> {
  // PostgREST يرفض update بلا أعمدة؛ closed_at هنا مجرد إشارة إغلاق ويستبدلها trigger القاعدة
  // بالوقت الفعلي ويضبط من أغلق، فلا قيمة من العميل تُحفظ
  const { data, error } = await supabase
    .from('patient_notes')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', id)
    .is('closed_at', null)
    .select('id');
  if (error) {
    if (/ALREADY_CLOSED/.test(error.message ?? '')) return { status: 'already_closed' };
    return { status: 'error', message: noteErrorMessage(error) };
  }
  // صفر صفوف: أُغلقت قبلنا من مستخدم آخر
  if (!data || data.length === 0) return { status: 'already_closed' };
  return { status: 'closed' };
}

/** يوم/شهر/سنة — أرقام لاتينية */
export function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** 12 ساعة مع ص/م — أرقام لاتينية */
export function formatNoteTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

export function formatNoteDateTime(iso: string): string {
  return `${formatNoteDate(iso)} ${formatNoteTime(iso)}`;
}
