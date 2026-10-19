'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, Plus, Check } from '@phosphor-icons/react';
import ConfirmDialog from '@/components/ConfirmDialog';
import Toast, { useNotice } from '@/components/Toast';
import { useSubscriptionState, READ_ONLY_MESSAGE } from '@/lib/subscription-state';
import {
  PatientNote, NOTE_MAX, fetchPatientNotes, addPatientNote, closePatientNote, formatNoteDateTime,
} from '@/lib/patient-notes';

/**
 * لافتة ملاحظات الكادر المفتوحة على ملف مريض واحد. داخلية للكادر فقط:
 * لا تُدرج في أي عنصر يُحوَّل إلى PDF ولا في صفحات المريض العامة.
 * Toast ونافذة التأكيد تُرسمان في body لأن النوافذ ذات الأنيميشن (transform) تكسر position: fixed.
 * refreshKey يُغيَّر من الأب لإعادة التحميل بعد تغيير من مكوّن آخر (مثل السجل)، و onChange يُبلغه بتغييرنا.
 */
export default function PatientNotesBanner({ patientId, onChange, refreshKey = 0, className = 'mt-5' }: {
  patientId: string;
  onChange?: (openCount: number | null) => void; // عدد المفتوحة بعد التغيير، أو null إن فشل إعادة التحميل
  refreshKey?: number;
  className?: string; // الهامش الخارجي؛ تغيّره الشاشة المضيفة حسب تخطيطها
}) {
  const { readOnly } = useSubscriptionState();
  const { notice, setNotice } = useNotice();
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState<PatientNote | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);

  const load = useCallback(async (): Promise<number | null> => {
    const res = await fetchPatientNotes(patientId);
    setLoadFailed(res.error);
    if (res.error) return null;
    const open = res.notes.filter(n => !n.closed_at);
    setNotes(open);
    return open.length;
  }, [patientId]);

  // الجلب داخل then (لا setState متزامن في جسم الـ effect)، والتنظيف يمنع تحديث حالة بعد تغيّر المريض
  useEffect(() => {
    let alive = true;
    fetchPatientNotes(patientId).then(res => {
      if (!alive) return;
      setLoadFailed(res.error);
      if (!res.error) setNotes(res.notes.filter(n => !n.closed_at));
    });
    return () => { alive = false; };
  }, [patientId, refreshKey]);

  const save = async () => {
    setSaving(true);
    const res = await addPatientNote(patientId, text);
    setSaving(false);
    if (!res.ok) { setNotice({ kind: 'err', text: res.message }); return; }
    setNotice({ kind: 'ok', text: 'تمت إضافة الملاحظة' });
    setText(''); setAdding(false);
    onChange?.(await load());
  };

  const confirmClose = async () => {
    if (!closing || closeBusy) return;
    setCloseBusy(true);
    const res = await closePatientNote(closing.id);
    setCloseBusy(false);
    setClosing(null);
    if (res.status === 'closed') setNotice({ kind: 'ok', text: 'تم إغلاق الملاحظة' });
    else if (res.status === 'already_closed') setNotice({ kind: 'err', text: 'أُغلقت هذه الملاحظة من قبل' });
    else setNotice({ kind: 'err', text: res.message });
    onChange?.(await load());
  };

  const addForm = (
    <div className="space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value.slice(0, NOTE_MAX))} rows={3} autoFocus
        aria-label="نص الملاحظة" placeholder="اكتب الملاحظة..."
        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none transition-all resize-none" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400 tabular-nums">{text.length} / {NOTE_MAX}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setAdding(false); setText(''); }} disabled={saving}
            className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
            إلغاء
          </button>
          <button type="button" onClick={save} disabled={saving || !text.trim()}
            className="px-4 py-2 bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl text-xs font-bold active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  );

  const addButton = (
    <button type="button" onClick={() => setAdding(true)} disabled={readOnly}
      title={readOnly ? READ_ONLY_MESSAGE : undefined}
      className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
      <Plus className="w-3.5 h-3.5" /> إضافة ملاحظة
    </button>
  );

  return (
    <>
      {loadFailed && (
        <div className={`${className} flex items-center justify-between gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3`}>
          <p className="text-xs font-bold text-rose-700">تعذّر تحميل ملاحظات الكادر.</p>
          <button type="button" onClick={() => { load(); }} className="text-xs font-bold text-rose-700 underline cursor-pointer">إعادة المحاولة</button>
        </div>
      )}

      {!loadFailed && notes.length === 0 && (
        <div className={className}>{adding ? <div className="bg-white border border-slate-200 rounded-2xl p-4">{addForm}</div> : addButton}</div>
      )}

      {!loadFailed && notes.length > 0 && (
        <section aria-label="ملاحظات الكادر" className={`${className} bg-amber-50 border border-amber-200 rounded-2xl shadow-sm overflow-hidden`}>
          <div className="px-4 py-3 border-b border-amber-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Note className="w-4 h-4 text-amber-700 shrink-0" />
              <p className="text-sm font-bold text-amber-800">ملاحظات الكادر</p>
              <span className="text-[11px] font-bold text-amber-700 tabular-nums">{notes.length}</span>
            </div>
            {!adding && (
              <button type="button" onClick={() => setAdding(true)} disabled={readOnly}
                title={readOnly ? READ_ONLY_MESSAGE : undefined}
                className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                <Plus className="w-3.5 h-3.5" /> إضافة ملاحظة
              </button>
            )}
          </div>
          <ul className="divide-y divide-amber-100">
            {notes.map(n => (
              <li key={n.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap break-words">{n.body}</p>
                  <p className="text-[11px] text-amber-700 mt-1"><bdi>{n.author_name}</bdi> · <span className="tabular-nums">{formatNoteDateTime(n.created_at)}</span></p>
                </div>
                <button type="button" onClick={() => setClosing(n)} disabled={readOnly}
                  title={readOnly ? READ_ONLY_MESSAGE : undefined}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-emerald-50 border border-amber-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-700 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0">
                  <Check className="w-3.5 h-3.5" /> تمّت
                </button>
              </li>
            ))}
          </ul>
          {adding && <div className="px-4 py-3 border-t border-amber-100 bg-white/60">{addForm}</div>}
        </section>
      )}

      {typeof document !== 'undefined' && createPortal(
        <>
          {closing && (
            <ConfirmDialog
              title="إغلاق الملاحظة"
              message="ستُنقل الملاحظة إلى السجل ولا يمكن إعادة فتحها. هل تمّت المتابعة؟"
              confirmText="تمّت"
              onConfirm={confirmClose}
              onCancel={() => { if (!closeBusy) setClosing(null); }}
            />
          )}
          <Toast notice={notice} />
        </>,
        document.body,
      )}
    </>
  );
}
