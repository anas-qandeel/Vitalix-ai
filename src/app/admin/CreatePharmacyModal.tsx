'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import Toast, { useNotice } from '@/components/Toast';
import { X } from '@phosphor-icons/react';
import SubscriptionModal from './SubscriptionModal';

type Props = {
  onClose: () => void;
  onSaved: () => void;
};

// توحيد اسم الصيدلية: نفس قاعدة الخادم في create-pharmacy/route.ts — تُستخدم هنا للعرض فقط
const displayName = (name: string) => {
  const trimmed = name.trim();
  return trimmed.startsWith('صيدلية') ? trimmed : `صيدلية ${trimmed}`;
};

export default function CreatePharmacyModal({ onClose, onSaved }: Props) {
  const { notice, setNotice } = useNotice();

  const [pharmacyName, setPharmacyName] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cityAddress, setCityAddress] = useState('عمان');
  const [country, setCountry] = useState('الأردن');
  const [trialDays, setTrialDays] = useState('');
  const [defaultTrialDays, setDefaultTrialDays] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const res = await adminFetch('/api/admin/settings');
      // مسار الإعدادات للمالك فقط، والدعم يصله 403 — تجاهل بصمت، الحقل اختياري أصلاً
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (json.data?.default_trial_days != null) setDefaultTrialDays(json.data.default_trial_days);
    };
    loadSettings();
  }, []);

  const handleSubmit = async () => {
    if (saving) return;

    const name = pharmacyName.trim();
    const pharmacist = pharmacistName.trim();
    const phone = phoneNumber.trim();
    const mail = email.trim();

    if (!name) { setNotice({ kind: 'err', text: 'اسم الصيدلية مطلوب' }); return; }
    if (!pharmacist) { setNotice({ kind: 'err', text: 'اسم الصيدلاني المسؤول مطلوب' }); return; }
    if (!phone) { setNotice({ kind: 'err', text: 'رقم الهاتف مطلوب' }); return; }
    if (!mail) { setNotice({ kind: 'err', text: 'البريد الإلكتروني مطلوب' }); return; }
    if (!password) { setNotice({ kind: 'err', text: 'كلمة المرور مطلوبة' }); return; }

    if (!/^\S+@\S+\.\S+$/.test(mail)) {
      setNotice({ kind: 'err', text: 'صيغة البريد الإلكتروني غير صحيحة' });
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setNotice({ kind: 'err', text: 'كلمة المرور 8 خانات على الأقل وتحوي حروفاً وأرقاماً' });
      return;
    }

    let trialDaysValue: number | null = null;
    if (trialDays.trim() !== '') {
      const n = Number(trialDays);
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        setNotice({ kind: 'err', text: 'أيام التجربة بين 0 و365' });
        return;
      }
      trialDaysValue = n;
    }

    setSaving(true);
    const res = await adminFetch('/api/admin/create-pharmacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: mail,
        password,
        pharmacy_name: name,
        pharmacist_name: pharmacist,
        phone_number: phone,
        country: country.trim(),
        city_address: cityAddress.trim(),
        trial_days: trialDaysValue,
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      setNotice({ kind: 'err', text: json.error || 'فشل إنشاء الصيدلية' });
      setSaving(false);
      return;
    }

    setCreated(json.pharmacy_id);
    onSaved();
    setSaving(false);
  };

  if (assigning && created) {
    // بلا غلاف إضافي — تجنباً لتراكب z-[70] مع غلاف هذا المكوّن
    return (
      <SubscriptionModal
        pharmacy={{ id: created, name: displayName(pharmacyName), expiry_date: null, status: 'trial' }}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">إضافة صيدلية جديدة</h3>
            <p className="text-xs text-slate-400 mt-1">تبدأ الصيدلية بفترة تجريبية، ويمكن إسناد خطة بعد الإنشاء مباشرة</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق"
            className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={16} weight="bold" aria-hidden="true" />
          </button>
        </div>

        {created ? (
          <>
            <h4 className="text-base font-bold text-slate-900 mb-1">تم إنشاء {displayName(pharmacyName)}</h4>
            <p className="text-xs text-slate-500 mb-5">بدأت الفترة التجريبية. يمكنك إسناد خطة الآن أو لاحقاً من بطاقة الصيدلية.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={onClose}
                className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
                لاحقاً
              </button>
              <button type="button" onClick={() => setAssigning(true)}
                className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer transition-all">
                إسناد خطة الآن
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">اسم الصيدلية</span>
                <input type="text" value={pharmacyName} onChange={e => setPharmacyName(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                <span className="block text-[11px] text-slate-400 mt-1">تُضاف كلمة صيدلية تلقائياً إن لم تُكتب</span>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">الصيدلاني المسؤول</span>
                <input type="text" value={pharmacistName} onChange={e => setPharmacistName(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">رقم الهاتف</span>
                <input type="tel" inputMode="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">البريد الإلكتروني للدخول</span>
                <input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">كلمة المرور الأولية</span>
                <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                <span className="block text-[11px] text-slate-400 mt-1">8 خانات على الأقل وتحوي حروفاً وأرقاماً</span>
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">المدينة والعنوان</span>
                <input type="text" value={cityAddress} onChange={e => setCityAddress(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">الدولة</span>
                <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
              </label>

              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">أيام التجربة</span>
                <input type="number" min={0} max={365} value={trialDays} onChange={e => setTrialDays(e.target.value)}
                  className="w-full h-9 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 transition text-slate-900" />
                <span className="block text-[11px] text-slate-400 mt-1">
                  اتركه فارغاً لاعتماد الافتراضي من إعدادات المنصة{defaultTrialDays != null ? ` (${defaultTrialDays} يوماً حالياً)` : ''}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <button type="button" onClick={onClose}
                className="h-10 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer">
                إلغاء
              </button>
              <button type="button" onClick={handleSubmit} disabled={saving}
                className="h-10 flex items-center justify-center rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                إنشاء الصيدلية
              </button>
            </div>
          </>
        )}
      </div>

      <Toast notice={notice} />
    </div>
  );
}
