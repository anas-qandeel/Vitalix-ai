'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════
export interface Feedback {
  id: string;
  pharmacy_id: string;
  pharmacy_name: string | null;
  pharmacist_name: string | null;
  type: string;
  message: string;
  rating: number | null;
  is_read: boolean;
  is_archived: boolean;
  status: string;
  admin_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  actions: Array<{ status: string; note: string | null; by: string | null; at: string }>;
  pharmacy_phone: string | null;
  created_at: string;
}

// ═══════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════
const TYPE_MAP: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  feature:     { label: 'ميزة جديدة', icon: '✨', bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200' },
  bug:         { label: 'مشكلة',       icon: '🐛', bg: 'bg-rose-50',    text: 'text-rose-700',   border: 'border-rose-200'   },
  improvement: { label: 'تحسين',       icon: '⚡', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200'  },
  other:       { label: 'أخرى',        icon: '💬', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200'  },
};

const STATUS_MAP: Record<string, { label: string; icon: string; pill: string }> = {
  new:         { label: 'جديد',          icon: '●', pill: 'bg-slate-100 text-slate-500 border-slate-200'     },
  in_progress: { label: 'قيد المعالجة', icon: '◐', pill: 'bg-blue-50 text-blue-700 border-blue-200'         },
  resolved:    { label: 'تم الحل',       icon: '✓', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
  rejected:    { label: 'مرفوض',         icon: '✕', pill: 'bg-slate-100 text-slate-500 border-slate-200'     },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', numberingSystem: 'latn' });
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', numberingSystem: 'latn' });
}
function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '').replace(/^0/, '962')}`;
}

// ═══════════════════════════════════════
// ACTION MODAL
// ═══════════════════════════════════════
function ActionModal({ feedback, adminName, onClose, onSaved }: {
  feedback: Feedback;
  adminName: string;
  onClose: () => void;
  onSaved: (updated: Feedback) => void;
}) {
  const [status, setStatus] = useState(feedback.status || 'new');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const newAction = { status, note: note.trim() || null, by: adminName, at: new Date().toISOString() };
      const updatedActions = [...(feedback.actions || []), newAction];
      const { error } = await supabase.from('feedback').update({
        status,
        actions: updatedActions,
        handled_by: adminName,
        handled_at: newAction.at,
        is_read: true,
      }).eq('id', feedback.id);
      if (!error) {
        onSaved({ ...feedback, status, actions: updatedActions, handled_by: adminName, handled_at: newAction.at, is_read: true });
        onClose();
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-900">تسجيل إجراء</p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[300px]">{feedback.message}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition text-sm font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* الحالة */}
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2">الحالة الجديدة</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_MAP).map(([v, { label, icon }]) => (
                <button key={v} onClick={() => setStatus(v)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-bold transition ${
                    status === v ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}>
                  <span>{icon}</span><span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* الملاحظة */}
          <div>
            <p className="text-xs font-bold text-slate-600 mb-1.5">ملاحظة <span className="font-normal text-slate-400">(اختياري)</span></p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="مثال: تم إضافة الميزة في الإصدار v1.2 ..."
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition resize-none text-slate-900" />
          </div>

          <button onClick={save} disabled={saving || status === (feedback.status || 'new') && !note.trim()}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition disabled:opacity-40 active:scale-[0.98]">
            {saving ? 'جاري الحفظ...' : 'حفظ الإجراء'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// FEEDBACK CARD
// ═══════════════════════════════════════
function FeedbackCard({ item, index, total, adminName, onUpdate, onDelete }: {
  item: Feedback;
  index: number;
  total: number;
  adminName: string;
  onUpdate: (updated: Feedback) => void;
  onDelete: (id: string) => void;
}) {
  const [showAction, setShowAction] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const t = TYPE_MAP[item.type] || TYPE_MAP.other;
  const st = STATUS_MAP[item.status || 'new'] || STATUS_MAP.new;
  const isUnread = !item.is_read && !item.is_archived;

  const handleMarkRead = async () => {
    if (item.is_read) return;
    const { error } = await supabase.from('feedback').update({ is_read: true }).eq('id', item.id);
    if (!error) onUpdate({ ...item, is_read: true });
  };

  const handleArchive = async () => {
    const { error } = await supabase.from('feedback').update({ is_archived: !item.is_archived, is_read: true }).eq('id', item.id);
    if (!error) onUpdate({ ...item, is_archived: !item.is_archived, is_read: true });
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('feedback').delete().eq('id', item.id);
    if (!error) onDelete(item.id);
  };

  return (
    <>
      <div onClick={handleMarkRead}
        className={`relative flex border-b border-slate-100 last:border-b-0 transition-colors ${
          isUnread ? 'bg-[#EEF4FF]' : item.is_archived ? 'bg-slate-50/60 opacity-70' : 'bg-white hover:bg-slate-50/40'
        }`}>
        {/* شريط الحالة الجانبي — أعرض وأوضح للغير مقروء */}
        <div className={`shrink-0 rounded-r-sm ${
          isUnread ? 'w-1 bg-[#2563EB]' :
          item.status === 'resolved' ? 'w-[3px] bg-emerald-400' :
          item.status === 'in_progress' ? 'w-[3px] bg-blue-400' :
          item.status === 'rejected' ? 'w-[3px] bg-slate-300' : 'w-[3px] bg-transparent'
        }`} />

        <div className="flex-1 px-5 py-4 space-y-2.5 min-w-0">
          {/* الصف الأول */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* رقم تسلسلي */}
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 rounded-md w-5 h-5 flex items-center justify-center shrink-0">
                {total - index}
              </span>
              {/* نوع */}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${t.bg} ${t.text} ${t.border}`}>
                {t.icon} {t.label}
              </span>
              {/* حالة الإجراء */}
              {item.status && item.status !== 'new' && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${st.pill}`}>
                  {st.icon} {st.label}
                </span>
              )}
              {/* جديد */}
              {isUnread && (
                <span className="text-[10px] font-black bg-[#2563EB] text-white px-2 py-0.5 rounded-md">● جديد</span>
              )}
              {/* تقييم */}
              {item.rating && (
                <span className="text-[11px] text-amber-400 tracking-tight">
                  {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-slate-400">{formatDate(item.created_at)}</span>
              {/* أرشفة */}
              <button onClick={e => { e.stopPropagation(); handleArchive(); }}
                title={item.is_archived ? 'إلغاء الأرشفة' : 'أرشفة'}
                className="text-[10px] text-slate-300 hover:text-slate-600 hover:bg-slate-100 w-6 h-6 rounded-lg flex items-center justify-center transition">
                {item.is_archived ? '↩' : '⊟'}
              </button>
              {/* حذف نهائي — يظهر فقط من الأرشيف */}
              {item.is_archived && !confirmDelete && (
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                  title="حذف نهائي"
                  className="text-[10px] text-rose-300 hover:text-rose-600 hover:bg-rose-50 w-6 h-6 rounded-lg flex items-center justify-center transition">
                  ✕
                </button>
              )}
              {item.is_archived && confirmDelete && (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={handleDelete}
                    className="text-[10px] font-bold text-white bg-rose-500 hover:bg-rose-600 px-2 py-0.5 rounded-md transition">
                    حذف
                  </button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded-md transition">
                    إلغاء
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* نص الرسالة */}
          <p className={`text-sm leading-relaxed ${isUnread ? 'text-[#0F172A] font-bold' : 'text-slate-600 font-normal'}`}>
            {item.message}
          </p>

          {/* سجل الإجراءات */}
          {item.actions && item.actions.length > 0 && (
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">سجل الإجراءات</p>
              </div>
              {item.actions.map((a, i) => {
                const as = STATUS_MAP[a.status] || STATUS_MAP.new;
                return (
                  <div key={i} className="flex items-start gap-3 px-3 py-2.5 border-b border-slate-50 last:border-b-0">
                    <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                      <div className={`w-2 h-2 rounded-full ${
                        a.status === 'resolved' ? 'bg-emerald-400' :
                        a.status === 'in_progress' ? 'bg-blue-400' :
                        a.status === 'rejected' ? 'bg-slate-300' : 'bg-slate-300'
                      }`} />
                      {i < item.actions.length - 1 && <div className="w-px h-3 bg-slate-100" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-700">{as.label}</span>
                        {a.by && <span className="text-[10px] text-slate-400">· {a.by}</span>}
                        <span className="text-[10px] text-slate-400">· {formatDateTime(a.at)}</span>
                      </div>
                      {a.note && <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{a.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${
                item.is_archived ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white'
              }`}>
                {(item.pharmacy_name || '?').charAt(0)}
              </div>
              <span className="text-[11px] font-bold text-slate-700">{item.pharmacy_name || '—'}</span>
              {item.pharmacist_name && <span className="text-[10px] text-slate-400">· {item.pharmacist_name}</span>}
              {item.pharmacy_phone && (
                <>
                  <span className="text-slate-200">·</span>
                  <span className="text-[10px] text-slate-500 font-mono">{item.pharmacy_phone}</span>
                  <a href={waLink(item.pharmacy_phone)} target="_blank" rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                    واتساب
                  </a>
                </>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); handleMarkRead(); setShowAction(true); }}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition ${
                !item.status || item.status === 'new'
                  ? 'bg-[#0F172A] text-white border-[#0F172A] hover:bg-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}>
              {!item.status || item.status === 'new' ? '+ إجراء' : '📝 تحديث'}
            </button>
          </div>
        </div>
      </div>

      {showAction && (
        <ActionModal
          feedback={item}
          adminName={adminName}
          onClose={() => setShowAction(false)}
          onSaved={updated => { onUpdate(updated); setShowAction(false); }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════
// MAIN INBOX COMPONENT
// ═══════════════════════════════════════
export default function FeedbackInbox({ feedbackList, loading, adminName, onUpdate, onDelete, onMarkAllRead, onToggleArchived, showArchived }: {
  feedbackList: Feedback[];
  loading: boolean;
  adminName: string;
  onUpdate: (updated: Feedback) => void;
  onDelete: (id: string) => void;
  onMarkAllRead: () => void;
  onToggleArchived: () => void;
  showArchived: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState('all');

  const unread = feedbackList.filter(f => !f.is_read && !f.is_archived);
  const archived = feedbackList.filter(f => f.is_archived);

  const filtered = feedbackList.filter(f =>
    (showArchived ? f.is_archived : !f.is_archived) &&
    (typeFilter === 'all' || f.type === typeFilter)
  );

  const typeButtons = [
    { v: 'all',         l: 'الكل',    count: feedbackList.filter(f => showArchived ? f.is_archived : !f.is_archived).length },
    { v: 'feature',     l: '✨ ميزة', count: feedbackList.filter(f => f.type === 'feature'     && (showArchived ? f.is_archived : !f.is_archived)).length },
    { v: 'bug',         l: '🐛 مشكلة', count: feedbackList.filter(f => f.type === 'bug'        && (showArchived ? f.is_archived : !f.is_archived)).length },
    { v: 'improvement', l: '⚡ تحسين', count: feedbackList.filter(f => f.type === 'improvement' && (showArchived ? f.is_archived : !f.is_archived)).length },
    { v: 'other',       l: '💬 أخرى', count: feedbackList.filter(f => f.type === 'other'       && (showArchived ? f.is_archived : !f.is_archived)).length },
  ].filter(b => b.v === 'all' || b.count > 0);

  return (
    <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="bg-[#0F172A] px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg shrink-0">💡</div>
          <div>
            <h3 className="text-base font-bold text-white">صندوق الاقتراحات</h3>
            <p className="text-[12px] text-slate-400 mt-0.5">
              {feedbackList.filter(f => !f.is_archived).length} اقتراح إجمالي
              {unread.length > 0 && (
                <span className="mr-2 text-blue-400 font-bold">· {unread.length} غير مقروء</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unread.length > 0 && !showArchived && (
            <button onClick={onMarkAllRead}
              className="text-[11px] font-bold text-slate-300 hover:text-white px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition">
              ✓ تعليم الكل مقروء
            </button>
          )}
          <button onClick={onToggleArchived}
            className={`text-[11px] font-bold px-3 py-2 rounded-xl transition flex items-center gap-1.5 ${
              showArchived ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white bg-white/10 hover:bg-white/20'
            }`}>
            <span>⊟</span>
            <span>الأرشيف</span>
            {archived.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${showArchived ? 'bg-slate-900 text-white' : 'bg-white/20 text-white'}`}>
                {archived.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── فلاتر النوع ── */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex items-center gap-1 overflow-x-auto">
        {typeButtons.map(({ v, l, count }) => (
          <button key={v} onClick={() => setTypeFilter(v)}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition whitespace-nowrap ${
              typeFilter === v
                ? 'bg-[#0F172A] text-white'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
            }`}>
            {l}
            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
              typeFilter === v ? 'bg-white/20' : 'bg-slate-200 text-slate-500'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {/* ── القائمة ── */}
      {loading ? (
        <div className="bg-white py-20 flex flex-col items-center justify-center gap-3">
          <div className="w-7 h-7 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          <p className="text-xs text-slate-400">جاري التحميل...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white py-20 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-4xl">{showArchived ? '📭' : '✉️'}</span>
          <p className="text-sm font-semibold text-slate-500 mt-1">{showArchived ? 'الأرشيف فارغ' : 'لا توجد اقتراحات بعد'}</p>
          {!showArchived && <p className="text-xs text-slate-400">ستظهر هنا اقتراحات المستخدمين فور إرسالها</p>}
        </div>
      ) : (
        <div className="bg-white divide-y divide-slate-100">
          {filtered.map((item, idx) => (
            <FeedbackCard
              key={item.id}
              item={item}
              index={idx}
              total={filtered.length}
              adminName={adminName}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
