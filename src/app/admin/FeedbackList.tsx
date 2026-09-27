'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { FEEDBACK_CHANGED_EVENT } from './admin-context';
import type { Icon } from '@phosphor-icons/react';
import {
  Lightbulb, Checks, Archive, Sparkle, Bug, Lightning, ChatCircle, Star,
  WhatsappLogo, Check, PencilSimple, ArrowCounterClockwise, Trash, Tray, EnvelopeSimple, X,
} from '@phosphor-icons/react';

type Feedback = {
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
  actions: Array<{ status: string; note: string | null; by: string | null; by_id?: string; at: string }>;
  pharmacy_phone: string | null;
  created_at: string;
};

const TYPE_MAP: Record<string, { label: string; icon: Icon; cls: string }> = {
  feature: { label: 'ميزة جديدة', icon: Sparkle, cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  bug: { label: 'مشكلة', icon: Bug, cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  improvement: { label: 'تحسين', icon: Lightning, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  other: { label: 'أخرى', icon: ChatCircle, cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};
const TYPE_ORDER = ['feature', 'bug', 'improvement', 'other'] as const;

const STATUS_MAP: Record<string, { label: string; cls: string; dot: string }> = {
  new: { label: 'جديد', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  in_progress: { label: 'قيد المعالجة', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  resolved: { label: 'تم الحل', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'مرفوض', cls: 'bg-slate-200 text-slate-700 border-slate-300', dot: 'bg-slate-500' },
};
const STATUS_ORDER = ['new', 'in_progress', 'resolved', 'rejected'] as const;

function fmtDate(x: string): string {
  return new Date(x).toLocaleDateString('en-GB');
}
function fmtDateTime(x: string): string {
  return new Date(x).toLocaleString('en-GB');
}
function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^0-9]/g, '').replace(/^0/, '962')}`;
}

function mergeFeedback(old: Feedback, row: any): Feedback {
  return {
    ...old,
    ...row,
    pharmacy_name: old.pharmacy_name,
    pharmacy_phone: old.pharmacy_phone,
    actions: Array.isArray(row.actions) ? row.actions : [],
  };
}

type PatchFn = (body: Record<string, unknown>) => Promise<{ ok: boolean; json: any }>;

function ActionModal({ feedback, patch, onClose, onSaved }: {
  feedback: Feedback;
  patch: PatchFn;
  onClose: () => void;
  onSaved: (updated: Feedback) => void;
}) {
  const { notice, setNotice } = useNotice();
  const [status, setStatus] = useState(feedback.status || 'new');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const noChange = status === (feedback.status || 'new') && !note.trim();

  const save = async () => {
    if (saving || noChange) return;
    setSaving(true);
    const { ok, json } = await patch({ op: 'action', id: feedback.id, status, note: note.trim() || null });
    if (!ok) {
      setNotice({ kind: 'err', text: json.error || 'فشل حفظ التعديل' });
      setSaving(false);
      return;
    }
    onSaved(mergeFeedback(feedback, json.data));
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900">تسجيل إجراء</h3>
            <p className="text-xs text-slate-400 mt-1 truncate">{feedback.message}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">الحالة الجديدة</span>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_ORDER.map(v => (
                <button key={v} type="button" onClick={() => setStatus(v)}
                  className={`h-9 rounded-lg text-xs font-bold cursor-pointer border transition ${status === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                  {STATUS_MAP[v].label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">ملاحظة داخلية (اختياري)</span>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 resize-none" />
          </label>
        </div>

        <button type="button" onClick={save} disabled={saving || noChange}
          className="w-full h-10 mt-5 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          {saving ? 'جارٍ الحفظ…' : 'حفظ الإجراء'}
        </button>

        <Toast notice={notice} />
      </div>
    </div>
  );
}

export default function FeedbackList({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
  const { notice, setNotice } = useNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionTarget, setActionTarget] = useState<Feedback | null>(null);

  const loadedRef = useRef(false);

  const load = async () => {
    if (!loadedRef.current) setLoading(true);
    const res = await adminFetch('/api/admin/feedback');
    if (!res.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب الاقتراحات' });
    } else {
      const json = await res.json();
      setItems(json.data);
    }
    if (!loadedRef.current) { setLoading(false); loadedRef.current = true; }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch: PatchFn = async (body) => {
    const res = await adminFetch('/api/admin/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) window.dispatchEvent(new Event(FEEDBACK_CHANGED_EVENT));
    return { ok: res.ok, json };
  };

  const updateItem = (updated: Feedback) => {
    setItems(prev => prev.map(f => f.id === updated.id ? updated : f));
  };

  const handleMarkRead = async (item: Feedback) => {
    if (item.is_read) return;
    const { ok, json } = await patch({ op: 'read', id: item.id });
    if (ok) updateItem(mergeFeedback(item, json.data));
    else setNotice({ kind: 'err', text: json.error || 'فشل حفظ التعديل' });
  };

  const handleArchive = async (item: Feedback) => {
    const { ok, json } = await patch({ op: 'archive', id: item.id });
    if (ok) { updateItem(mergeFeedback(item, json.data)); setNotice({ kind: 'ok', text: 'تمت الأرشفة' }); }
    else setNotice({ kind: 'err', text: json.error || 'فشل حفظ التعديل' });
  };

  const handleUnarchive = async (item: Feedback) => {
    const { ok, json } = await patch({ op: 'unarchive', id: item.id });
    if (ok) { updateItem(mergeFeedback(item, json.data)); setNotice({ kind: 'ok', text: 'أُعيد من الأرشيف' }); }
    else setNotice({ kind: 'err', text: json.error || 'فشل حفظ التعديل' });
  };

  const handleMarkAllRead = async () => {
    const { ok, json } = await patch({ op: 'read_all' });
    if (ok) { setNotice({ kind: 'ok', text: 'تم تعليم الكل مقروءاً' }); load(); }
    else setNotice({ kind: 'err', text: json.error || 'فشل حفظ التعديل' });
  };

  const openAction = async (item: Feedback) => {
    let current = item;
    if (!item.is_read) {
      const { ok, json } = await patch({ op: 'read', id: item.id });
      if (ok) { current = mergeFeedback(item, json.data); updateItem(current); }
    }
    setActionTarget(current);
  };

  const handleDelete = async (item: Feedback) => {
    const ok = await confirm({
      title: 'حذف الاقتراح نهائياً؟',
      message: 'لا يمكن استرجاعه بعد الحذف.',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;

    const res = await adminFetch(`/api/admin/feedback?id=${item.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (res.ok) { window.dispatchEvent(new Event(FEEDBACK_CHANGED_EVENT)); setItems(prev => prev.filter(f => f.id !== item.id)); setNotice({ kind: 'ok', text: 'تم الحذف' }); }
    else setNotice({ kind: 'err', text: json.error || 'فشل الحذف' });
  };

  const totalCount = items.filter(f => !f.is_archived).length;
  const unreadCount = items.filter(f => !f.is_read && !f.is_archived).length;
  const archivedCount = items.filter(f => f.is_archived).length;

  const scoped = items.filter(f => showArchived ? f.is_archived : !f.is_archived);

  const statusButtons = [
    { v: 'all', label: 'الكل', count: scoped.length },
    ...STATUS_ORDER.map(v => ({ v, label: STATUS_MAP[v].label, count: scoped.filter(f => (f.status || 'new') === v).length })),
  ];

  const typeButtons = [
    { v: 'all', label: 'الكل', icon: null as Icon | null, count: scoped.length },
    ...TYPE_ORDER.map(v => ({ v, label: TYPE_MAP[v].label, icon: TYPE_MAP[v].icon as Icon | null, count: scoped.filter(f => f.type === v).length })),
  ].filter(b => b.v === 'all' || b.count > 0);

  const q = search.trim().toLowerCase();
  const filtered = items.filter(f => {
    if (showArchived ? !f.is_archived : f.is_archived) return false;
    if (statusFilter !== 'all' && (f.status || 'new') !== statusFilter) return false;
    if (typeFilter !== 'all' && f.type !== typeFilter) return false;
    if (q) {
      const hay = `${f.message} ${f.pharmacy_name ?? ''} ${f.pharmacist_name ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Lightbulb size={18} weight="bold" aria-hidden="true" className="text-slate-700" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">صندوق الاقتراحات</h2>
            <p className="text-xs text-slate-500">
              {totalCount} اقتراح
              {unreadCount > 0 && <span className="text-teal-600 font-bold"> · {unreadCount} غير مقروء</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && !showArchived && (
            <button type="button" onClick={handleMarkAllRead}
              className="h-9 px-3 rounded-xl text-xs font-bold cursor-pointer bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
              <Checks size={14} weight="bold" aria-hidden="true" />
              تعليم الكل مقروءاً
            </button>
          )}
          <button type="button" onClick={() => setShowArchived(v => !v)}
            className={`h-9 px-3 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5 ${showArchived ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
            <Archive size={14} weight="bold" aria-hidden="true" />
            الأرشيف
            {archivedCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${showArchived ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{archivedCount}</span>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 space-y-3">
        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">بحث</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في الرسالة أو اسم الصيدلية أو الصيدلاني…"
            className="w-full h-9 px-3 text-xs border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none" />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {statusButtons.map(({ v, label, count }) => (
            <button key={v} type="button" onClick={() => setStatusFilter(v)}
              className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${statusFilter === v ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusFilter === v ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {typeButtons.map(({ v, label, icon: TIcon, count }) => (
            <button key={v} type="button" onClick={() => setTypeFilter(v)}
              className={`h-8 px-3 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 ${typeFilter === v ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
              {TIcon && <TIcon size={12} weight="bold" aria-hidden="true" />}
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeFilter === v ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-12">جارٍ التحميل…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 flex flex-col items-center justify-center gap-2">
          {showArchived
            ? <Tray size={28} weight="bold" aria-hidden="true" className="text-slate-300" />
            : <EnvelopeSimple size={28} weight="bold" aria-hidden="true" className="text-slate-300" />}
          <p className="text-sm text-slate-400">{showArchived ? 'الأرشيف فارغ' : 'لا توجد اقتراحات مطابقة'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const isUnread = !item.is_read && !item.is_archived;
            const t = TYPE_MAP[item.type] || TYPE_MAP.other;
            const TIcon = t.icon;
            const st = STATUS_MAP[item.status || 'new'] || STATUS_MAP.new;

            return (
              <div key={item.id}
                className={`bg-white rounded-2xl border border-slate-200 p-4 ${isUnread ? 'border-r-4 border-r-teal-500' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${t.cls}`}>
                      <TIcon size={12} weight="bold" aria-hidden="true" />
                      {t.label}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.cls}`}>
                      {st.label}
                    </span>
                    {isUnread && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                        غير مقروء
                      </span>
                    )}
                    {item.rating ? (
                      <span className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <Star key={n} size={12} weight={n <= item.rating! ? 'fill' : 'bold'} aria-hidden="true"
                            className={n <= item.rating! ? 'text-amber-400' : 'text-slate-200'} />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{fmtDate(item.created_at)}</span>
                </div>

                <p className={`text-sm leading-relaxed whitespace-pre-line mb-2 ${isUnread ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                  {item.message}
                </p>

                {item.actions.length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 mb-2 space-y-2">
                    {item.actions.map((a, i) => {
                      const as = STATUS_MAP[a.status] || STATUS_MAP.new;
                      return (
                        <div key={i} className="flex items-start gap-2">
                          <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${as.dot}`} />
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-600">
                              <span className="font-bold text-slate-700">{as.label}</span>
                              {a.by && <span> · {a.by}</span>}
                              <span> · {fmtDateTime(a.at)}</span>
                            </p>
                            {a.note && <p className="text-[11px] text-slate-500 mt-0.5">{a.note}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 pt-2 border-t border-slate-100 mb-2">
                  {item.pharmacy_id ? (
                    <button type="button" onClick={() => router.push(`/admin/pharmacies/${item.pharmacy_id}`)}
                      className="font-bold text-slate-700 hover:underline cursor-pointer">
                      {item.pharmacy_name || '—'}
                    </button>
                  ) : (
                    <span className="font-bold text-slate-700">{item.pharmacy_name || '—'}</span>
                  )}
                  {item.pharmacist_name && <span>· {item.pharmacist_name}</span>}
                  {item.pharmacy_phone && (
                    <>
                      <span>·</span>
                      <a href={`tel:${item.pharmacy_phone}`} className="hover:underline" dir="ltr">{item.pharmacy_phone}</a>
                      <a href={waLink(item.pharmacy_phone)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold">
                        <WhatsappLogo size={12} weight="bold" aria-hidden="true" />
                        واتساب
                      </a>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {!item.is_archived ? (
                    <>
                      {isUnread && (
                        <button type="button" onClick={() => handleMarkRead(item)}
                          className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-white border border-slate-200 text-slate-700 flex items-center gap-1.5">
                          <Check size={14} weight="bold" aria-hidden="true" />
                          تعليم كمقروء
                        </button>
                      )}
                      <button type="button" onClick={() => openAction(item)}
                        className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-slate-900 hover:bg-slate-800 text-white flex items-center gap-1.5">
                        <PencilSimple size={14} weight="bold" aria-hidden="true" />
                        إجراء
                      </button>
                      <button type="button" onClick={() => handleArchive(item)}
                        className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-white border border-slate-200 text-slate-700 flex items-center gap-1.5">
                        <Archive size={14} weight="bold" aria-hidden="true" />
                        أرشفة
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => handleUnarchive(item)}
                        className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-white border border-slate-200 text-slate-700 flex items-center gap-1.5">
                        <ArrowCounterClockwise size={14} weight="bold" aria-hidden="true" />
                        إعادة من الأرشيف
                      </button>
                      {isOwner && (
                        <button type="button" onClick={() => handleDelete(item)}
                          className="h-8 px-3 rounded-lg text-xs font-bold cursor-pointer bg-white border border-rose-200 text-rose-600 flex items-center gap-1.5">
                          <Trash size={14} weight="bold" aria-hidden="true" />
                          حذف نهائي
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {actionTarget && (
        <ActionModal
          feedback={actionTarget}
          patch={patch}
          onClose={() => setActionTarget(null)}
          onSaved={(merged) => {
            updateItem(merged);
            setActionTarget(null);
            setNotice({ kind: 'ok', text: 'تم حفظ الإجراء' });
          }}
        />
      )}

      {confirmDialog}
      <Toast notice={notice} />
    </div>
  );
}
