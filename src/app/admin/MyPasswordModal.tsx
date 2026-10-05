'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Toast, { useNotice } from '@/components/Toast';
import { X } from '@phosphor-icons/react';

type Props = {
  onClose: () => void;
};

export default function MyPasswordModal({ onClose }: Props) {
  const { notice, setNotice } = useNotice();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (saving) return;

    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setNotice({ kind: 'err', text: 'كلمة المرور 8 خانات على الأقل وتحوي حروفاً وأرقاماً' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ kind: 'err', text: 'كلمتا المرور غير متطابقتين' });
      return;
    }

    setSaving(true);
    // تغيير كلمة مرور المستخدم الحالي بجلسته هو — لا مسار admin هنا، تماماً كما في update-password
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error('[MyPasswordModal]', error.message);
      setNotice({ kind: 'err', text: 'تعذّر تغيير كلمة المرور — تأكد أنها ليست شائعة أو مطابقة للحالية' });
      setSaving(false);
      return;
    }

    setDone(true);
    setSaving(false);
  };

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">تغيير كلمة مروري</h3>
            <p className="text-xs text-slate-400 mt-1">تتغير كلمة مرور حسابك أنت فقط</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {done ? (
          <>
            <h4 className="text-base font-bold text-slate-900 mb-4">تم تغيير كلمة مرورك</h4>
            <button type="button" onClick={onClose}
              className="w-full h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
              إغلاق
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">كلمة المرور الجديدة</span>
                <input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                <span className="block text-[11px] text-slate-400 mt-1">8 خانات على الأقل وتحوي حروفاً وأرقاماً</span>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">تأكيد كلمة المرور</span>
                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>
            </div>

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
          </>
        )}

        <Toast notice={notice} />
      </div>
    </div>
  );
}
