'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { useAdmin } from '../admin-context';
import { Plus, Key, PencilSimple, Trash, Lock, X } from '@phosphor-icons/react';

type PlatformAdmin = {
  id: string;
  user_id: string;
  role: string;
  name?: string;
  email?: string;
  created_at: string;
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'المالك',
  pharmacist: 'صيدلاني المنصة',
  support: 'دعم فني',
};

const ROLE_CLS: Record<string, string> = {
  owner: 'bg-slate-900 text-white border-slate-900',
  pharmacist: 'bg-teal-50 text-teal-700 border-teal-200',
  support: 'bg-amber-50 text-amber-700 border-amber-200',
};

function fmtDate(x: string): string {
  return new Date(x).toLocaleDateString('en-GB');
}

type FormState = { mode: 'create' } | { mode: 'edit'; admin: PlatformAdmin };

export default function PlatformAdminsPage() {
  const { notice, setNotice } = useNotice();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { userId: currentUserId } = useAdmin();

  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [pwTarget, setPwTarget] = useState<PlatformAdmin | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await adminFetch('/api/admin/admins-list');
    if (!res.ok) {
      setNotice({ kind: 'err', text: 'تعذّر جلب المسؤولين' });
    } else {
      const json = await res.json();
      setAdmins(json.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDelete = async (a: PlatformAdmin) => {
    const ok = await confirm({
      title: `إزالة صلاحية «${a.name || a.email}»؟`,
      message: 'سيفقد هذا الحساب صلاحية إدارة المنصة فوراً. لا يُحذف حساب الدخول نفسه.',
      confirmText: 'إزالة',
      destructive: true,
    });
    if (!ok) return;

    const res = await adminFetch(`/api/admin/create-platform-admin?id=${a.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    setNotice(res.ok ? { kind: 'ok', text: 'تمت إزالة الصلاحية' } : { kind: 'err', text: json.error || 'فشلت عملية الحذف' });
    if (res.ok) load();
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto p-4">
        <h1 className="text-lg font-bold text-slate-900 mb-4">مسؤولو المنصة</h1>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <p className="text-xs text-slate-500">إدارة حسابات المسؤولين وصلاحياتهم على لوحة الإدارة</p>
            <button
              onClick={() => setFormState({ mode: 'create' })}
              className="h-9 px-3 rounded-xl text-xs font-bold cursor-pointer bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5"
            >
              <Plus size={14} weight="bold" aria-hidden="true" />
              إضافة مسؤول
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 text-center py-12">جارٍ التحميل…</p>
          ) : admins.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">لا يوجد مسؤولون مضافون</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 font-semibold">الاسم</th>
                    <th className="py-2.5 font-semibold">البريد</th>
                    <th className="py-2.5 font-semibold">الدور</th>
                    <th className="py-2.5 font-semibold">تاريخ الإضافة</th>
                    <th className="py-2.5 font-semibold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {admins.map(a => {
                    const isSelf = a.user_id === currentUserId;
                    return (
                      <tr key={a.id}>
                        <td className="py-2.5 font-bold text-slate-900">{a.name || '—'}</td>
                        <td className="py-2.5">{a.email || '—'}</td>
                        <td className="py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_CLS[a.role] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {ROLE_LABEL[a.role] ?? a.role}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500 tabular-nums">{fmtDate(a.created_at)}</td>
                        <td className="py-2.5">
                          <div className="flex items-center justify-center gap-2.5">
                            <button type="button" onClick={() => setPwTarget(a)} title="كلمة المرور" aria-label="كلمة المرور"
                              className="text-amber-600 hover:text-amber-700 cursor-pointer">
                              <Key size={14} weight="bold" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => setFormState({ mode: 'edit', admin: a })} title="تعديل" aria-label="تعديل"
                              className="text-slate-500 hover:text-slate-700 cursor-pointer">
                              <PencilSimple size={14} weight="bold" aria-hidden="true" />
                            </button>
                            {isSelf ? (
                              <span title="لا يمكنك حذف صلاحيتك الخاصة" className="text-slate-300">
                                <Lock size={14} weight="bold" aria-hidden="true" />
                              </span>
                            ) : (
                              <button type="button" onClick={() => onDelete(a)} title="حذف" aria-label="حذف"
                                className="text-rose-500 hover:text-rose-700 cursor-pointer">
                                <Trash size={14} weight="bold" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {formState && (
        <AdminFormModal
          state={formState}
          currentUserId={currentUserId}
          onClose={() => setFormState(null)}
          onSaved={(msg) => { setFormState(null); setNotice({ kind: 'ok', text: msg }); load(); }}
        />
      )}
      {pwTarget && (
        <AdminPasswordModal
          admin={pwTarget}
          onClose={() => setPwTarget(null)}
          onSaved={(msg) => { setPwTarget(null); setNotice({ kind: 'ok', text: msg }); }}
        />
      )}

      {confirmDialog}
      <Toast notice={notice} />
    </div>
  );
}

function AdminFormModal({ state, currentUserId, onClose, onSaved }: {
  state: FormState;
  currentUserId: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { notice, setNotice } = useNotice();
  const editing = state.mode === 'edit' ? state.admin : null;
  const isSelf = !!editing && editing.user_id === currentUserId;

  const [name, setName] = useState(editing?.name || '');
  const [email, setEmail] = useState(editing?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(editing?.role || 'support');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (saving) return;

    const trimmedName = name.trim();
    if (!trimmedName) { setNotice({ kind: 'err', text: 'الاسم مطلوب' }); return; }

    if (editing) {
      setSaving(true);
      const res = await adminFetch('/api/admin/create-platform-admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, role, name: trimmedName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ kind: 'err', text: json.error || 'فشلت عملية تحديث المسؤول' });
        setSaving(false);
        return;
      }
      onSaved('تم تحديث المسؤول');
      return;
    }

    const trimmedEmail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) { setNotice({ kind: 'err', text: 'صيغة البريد الإلكتروني غير صحيحة' }); return; }
    if (password.length < 8) { setNotice({ kind: 'err', text: 'كلمة المرور 8 خانات على الأقل' }); return; }

    setSaving(true);
    const res = await adminFetch('/api/admin/create-platform-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, email: trimmedEmail, password, role }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice({ kind: 'err', text: json.error || 'فشلت عملية إضافة المسؤول' });
      setSaving(false);
      return;
    }
    onSaved('تمت إضافة المسؤول');
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900">{editing ? 'تعديل المسؤول' : 'إضافة مسؤول جديد'}</h3>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">الاسم</span>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
          </label>

          {!editing && (
            <>
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">البريد الإلكتروني</span>
                <input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">كلمة المرور الأولية</span>
                <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                <span className="block text-[11px] text-slate-400 mt-1">8 خانات على الأقل</span>
              </label>
            </>
          )}

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">الدور</span>
            <select value={role} onChange={e => setRole(e.target.value)} disabled={isSelf}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed">
              <option value="owner">المالك</option>
              <option value="pharmacist">صيدلاني المنصة</option>
              <option value="support">دعم فني</option>
            </select>
            {isSelf && <span className="block text-[11px] text-slate-400 mt-1">لا يمكنك تغيير دورك الخاص</span>}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button type="button" onClick={onClose}
            className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
            إلغاء
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            {editing ? 'حفظ التعديلات' : 'إضافة المسؤول'}
          </button>
        </div>

        <Toast notice={notice} />
      </div>
    </div>
  );
}

function AdminPasswordModal({ admin, onClose, onSaved }: {
  admin: PlatformAdmin;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { notice, setNotice } = useNotice();
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (saving) return;
    if (newPassword.length < 8) { setNotice({ kind: 'err', text: 'كلمة المرور 8 خانات على الأقل' }); return; }

    setSaving(true);
    const res = await adminFetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: admin.user_id, newPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice({ kind: 'err', text: json.error || 'فشل تغيير كلمة المرور' });
      setSaving(false);
      return;
    }
    onSaved('تم تحديث كلمة المرور');
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">إعادة تعيين كلمة المرور</h3>
            <p className="text-xs text-slate-400 mt-1">{[admin.name, admin.email].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">كلمة المرور الجديدة</span>
          <input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
          <span className="block text-[11px] text-slate-400 mt-1">8 خانات على الأقل</span>
        </label>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button type="button" onClick={onClose}
            className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
            إلغاء
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            تغيير كلمة المرور
          </button>
        </div>

        <Toast notice={notice} />
      </div>
    </div>
  );
}
