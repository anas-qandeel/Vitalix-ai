'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { X } from '@phosphor-icons/react';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, ammanTodayISO } from '@/lib/subscriptions';

type Props = {
  subscription: { id: string; final_price: number; paid_amount: number; next_due_on: string | null; label: string };
  currency: string;
  onClose: () => void;
  onSaved: () => void;
};

// تسجيل دفعة على اشتراك واحد — PATCH /api/admin/subscriptions { subscription_id, amount, method, paid_on, note }.
// الخادم يرفض ما يتجاوز المتبقي؛ الفحص هنا للتجربة الفورية فقط.
export default function PaymentModal({ subscription, currency, onClose, onSaved }: Props) {
  const { notice, setNotice } = useNotice();
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(ammanTodayISO());
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [dueOn, setDueOn] = useState(subscription.next_due_on && subscription.next_due_on >= ammanTodayISO() ? subscription.next_due_on : '');
  const [saving, setSaving] = useState(false);

  const remaining = Math.round((Number(subscription.final_price) - Number(subscription.paid_amount)) * 100) / 100;

  const handleSubmit = async () => {
    if (saving) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setNotice({ kind: 'err', text: 'مبلغ الدفعة غير صالح' }); return; }
    if (n > remaining) { setNotice({ kind: 'err', text: `الدفعة تتجاوز المتبقي (${remaining} ${currency})` }); return; }
    if (!method) { setNotice({ kind: 'err', text: 'اختر طريقة الدفع' }); return; }
    if (!paidOn || paidOn > ammanTodayISO()) { setNotice({ kind: 'err', text: 'تاريخ الدفعة لا يكون في المستقبل' }); return; }
    const leftAfter = Math.round((remaining - n) * 100) / 100;
    if (leftAfter > 0 && dueOn && dueOn < ammanTodayISO()) { setNotice({ kind: 'err', text: 'موعد الدفعة التالية لا يكون في الماضي' }); return; }

    setSaving(true);
    const res = await adminFetch('/api/admin/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription_id: subscription.id, amount: n, method, paid_on: paidOn, note, ...(leftAfter > 0 && dueOn ? { next_due_on: dueOn } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setNotice({ kind: 'err', text: json.error || 'فشل تسجيل الدفعة' });
      setSaving(false);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">تسجيل دفعة</h3>
            <p className="text-xs text-slate-400 mt-1">{subscription.label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-[10px] text-slate-500">المستحق</p>
            <p className="text-sm font-bold text-slate-900">{subscription.final_price} {currency}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-[10px] text-slate-500">المدفوع</p>
            <p className="text-sm font-bold text-emerald-700">{subscription.paid_amount} {currency}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-[10px] text-slate-500">المتبقي</p>
            <p className={`text-sm font-bold ${remaining > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{remaining} {currency}</p>
          </div>
        </div>

        <label className="block">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">{`مبلغ الدفعة (${currency})`}</span>
          <input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
        </label>

        {Number(amount) > 0 && Math.round((remaining - Number(amount)) * 100) / 100 > 0 && (
          <label className="block mt-3">
            <span className="block text-[11px] font-semibold text-slate-500 mb-1">تاريخ استحقاق الدفعة التالية</span>
            <input type="date" value={dueOn} min={ammanTodayISO()} onChange={e => setDueOn(e.target.value)}
              className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
            {!dueOn && (
              <span className="block text-[11px] text-slate-400 mt-1">{`المتبقي بعد الدفعة ${(remaining - Number(amount)).toFixed(2)} ${currency} — حدّد موعد سداده`}</span>
            )}
          </label>
        )}

        <label className="block mt-3">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">تاريخ الدفعة</span>
          <input type="date" value={paidOn} max={ammanTodayISO()} onChange={e => setPaidOn(e.target.value)}
            className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
        </label>

        <label className="block mt-3">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">طريقة الدفع</span>
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900">
            <option value="" disabled>اختر الطريقة…</option>
            {PAYMENT_METHODS.map(m => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
            ))}
          </select>
        </label>

        <label className="block mt-3">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">ملاحظة (اختياري)</span>
          <input type="text" value={note} maxLength={200} onChange={e => setNote(e.target.value)}
            className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
        </label>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button type="button" onClick={onClose}
            className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
            إلغاء
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || remaining <= 0}
            className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
            تسجيل الدفعة
          </button>
        </div>

        <Toast notice={notice} />
      </div>
    </div>
  );
}
