'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { X } from '@phosphor-icons/react';
import { ammanTodayISO } from '@/lib/subscriptions';

type Props = {
  subscription: { id: string; next_due_on: string | null; label: string };
  onClose: () => void;
  onSaved: () => void;
};

// تعديل موعد استحقاق الدفعة التالية لاشتراك واحد — PUT /api/admin/subscriptions { subscription_id, next_due_on }.
// null يمسح الموعد. الخادم يتحقق من الصيغة ومن أن الموعد ليس في الماضي ولا قبل بداية الاشتراك.
export default function DueDateModal({ subscription, onClose, onSaved }: Props) {
  const { notice, setNotice } = useNotice();
  const [dueOn, setDueOn] = useState(subscription.next_due_on ?? '');
  const [saving, setSaving] = useState(false);

  const send = async (value: string | null) => {
    if (saving) return;
    setSaving(true);
    const res = await adminFetch('/api/admin/subscriptions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: subscription.id, next_due_on: value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice({ kind: 'err', text: json.error || 'فشل تحديث الموعد' });
      setSaving(false);
      return;
    }
    onSaved();
    onClose();
  };

  const handleSave = () => {
    if (!dueOn) { setNotice({ kind: 'err', text: 'اختر تاريخاً' }); return; }
    if (dueOn < ammanTodayISO()) { setNotice({ kind: 'err', text: 'الموعد لا يكون في الماضي' }); return; }
    send(dueOn);
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">موعد الدفعة التالية</h3>
            <p className="text-xs text-slate-400 mt-1">{subscription.label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">تاريخ استحقاق الدفعة التالية</span>
          <input type="date" value={dueOn} min={ammanTodayISO()} onChange={e => setDueOn(e.target.value)}
            className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
        </label>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            حفظ الموعد
          </button>
          <button type="button" onClick={() => send(null)} disabled={saving || !subscription.next_due_on}
            className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            مسح الموعد
          </button>
        </div>

        <Toast notice={notice} />
      </div>
    </div>
  );
}
