'use client';

import { useEffect, useState } from 'react';
import { Note, Check } from '@phosphor-icons/react';
import { PatientNote, fetchPatientNotes, formatNoteDateTime } from '@/lib/patient-notes';

/**
 * السجل الكامل لملاحظات المريض (مفتوحة ومغلقة، الأحدث أولاً). للقراءة فقط:
 * الإضافة والإغلاق من اللافتة، ويُعاد التحميل عند تغيّر refreshKey. داخلية للكادر فقط.
 */
export default function PatientNotesHistory({ patientId, refreshKey = 0 }: { patientId: string; refreshKey?: number }) {
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPatientNotes(patientId).then(res => {
      if (!alive) return;
      setFailed(res.error);
      if (!res.error) setNotes(res.notes);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [patientId, refreshKey]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
        <Note className="w-4 h-4 text-slate-500" />
        <p className="text-sm font-bold text-slate-900">سجل الملاحظات</p>
        {!loading && !failed && <span className="text-[11px] font-bold text-slate-400 tabular-nums">{notes.length}</span>}
      </div>
      {loading ? (
        <p className="px-5 py-4 text-xs text-slate-400 font-medium text-center">جاري التحميل...</p>
      ) : failed ? (
        <p className="px-5 py-4 text-xs text-rose-600 font-medium text-center">تعذّر تحميل السجل.</p>
      ) : notes.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400 font-medium text-center">لا توجد ملاحظات</p>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {notes.map(n => {
            const closed = !!n.closed_at;
            return (
              <li key={n.id} className={`px-5 py-3 ${closed ? 'bg-slate-50/60' : ''}`}>
                <p className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${closed ? 'text-slate-500' : 'text-slate-900'}`}>{n.body}</p>
                <p className="text-[11px] text-slate-400 mt-1"><bdi>{n.author_name}</bdi> · <span className="tabular-nums">{formatNoteDateTime(n.created_at)}</span></p>
                {closed && n.closed_at ? (
                  <p className="flex items-center gap-1 text-[11px] text-emerald-700 mt-1">
                    <Check className="w-3 h-3 shrink-0" />
                    <span>أغلقها <bdi>{n.closed_by_name}</bdi> — <span className="tabular-nums">{formatNoteDateTime(n.closed_at)}</span></span>
                  </p>
                ) : (
                  <p className="text-[11px] font-bold text-amber-700 mt-1">مفتوحة</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
