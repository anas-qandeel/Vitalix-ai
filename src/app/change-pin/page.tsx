'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppFooter from '../components/AppFooter';

type Step = 'current' | 'new' | 'confirm';

const STEP_TITLES: Record<Step, string> = {
  current: 'أدخل رمزك الحالي',
  new: 'اختر رمزاً جديداً',
  confirm: 'أعد إدخال الرمز الجديد للتأكيد',
};

export default function ChangePinPage() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [step, setStep] = useState<Step>('current');
  // خطوة البداية الفعلية (قد تكون 'current' أو 'new' حسب must_change_pin) — الشريط التوضيحي يظهر عندها فقط
  const [initialStep, setInitialStep] = useState<Step>('current');
  const [digits, setDigits] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // شاشة إلزامية — بلا جلسة لا معنى لها
  useEffect(() => {
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = '/';
          return;
        }

        // إجبار (أول دخول أو تصفير من المالك) → نبدأ من خطوة الرمز الجديد مباشرة،
        // تغيير طوعي → الرمز الحالي إلزامي أولاً حتى لا يستولي أي شخص على جهاز مفتوح
        const { data: staff } = await supabase
          .from('pharmacy_staff')
          .select('must_change_pin')
          .eq('user_id', session.user.id)
          .single();
        if (staff?.must_change_pin) {
          setStep('new');
          setInitialStep('new');
        }
      } catch {
        // فشل الفحص (شبكة مثلاً) لا يحجب المستخدم — يكمل من خطوة الرمز الحالي، الأكثر تحفّظاً
      } finally {
        setInitialLoading(false);
      }
    };
    check();
  }, []);

  // دعم الكيبورد واللصق إلى جانب اللمس — التسجيل مضمون دائماً، والحراسة سلوكية داخل كل معالج لا بنيوية في تسجيل المستمع
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (initialLoading || success || saving) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter' && digits.length === 6) {
        if (step === 'confirm') handleSave();
        else handleContinue();
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (initialLoading || success || saving) return;
      const cleaned = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (cleaned.length === 6) {
        e.preventDefault();
        setDigits(cleaned);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [initialLoading, success, saving, digits, step, currentPin, newPin]);

  const handleDigit = (d: string) => {
    if (saving) return;
    setDigits((prev) => (prev.length < 6 ? prev + d : prev));
  };

  const handleBackspace = () => {
    if (saving) return;
    setDigits((prev) => prev.slice(0, -1));
  };

  const handleContinue = () => {
    if (digits.length !== 6) return;
    setError('');
    if (step === 'current') {
      setCurrentPin(digits);
      setDigits('');
      setStep('new');
    } else if (step === 'new') {
      setNewPin(digits);
      setDigits('');
      setStep('confirm');
    }
  };

  const handleSave = async () => {
    if (digits.length !== 6 || saving) return;

    if (digits !== newPin) {
      setError('الرمزان غير متطابقين');
      setNewPin('');
      setDigits('');
      setStep('new');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/';
        return;
      }
      const res = await fetch('/api/staff/change-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ current_pin: currentPin, new_pin: digits }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
        return;
      }

      setError(json?.error || 'حدث خطأ، حاول مجدداً');
      if (json?.error === 'الرمز الحالي غير صحيح') {
        setCurrentPin('');
        setDigits('');
        setStep('current');
      } else if (res.status === 400) {
        setNewPin('');
        setDigits('');
        setStep('new');
      } else {
        setDigits('');
      }
    } catch {
      setError('تعذّر الاتصال بالخادم');
      setDigits('');
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحقق...</p>
      </div>
    );
  }

  const isConfirmStep = step === 'confirm';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans antialiased selection:bg-[#2563EB] selection:text-[#FFFFFF] px-4" dir="rtl">

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800;900&display=swap');
        .font-brand {
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
        }
      `}</style>

      <div className="w-full max-w-[420px] py-10">
        <div className="bg-white p-9 sm:p-10 rounded-[22px] border border-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.04)] space-y-9">

          {/* Brand Mark Header */}
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-[#0F172A] flex items-center justify-center shadow-md shadow-slate-900/10 border border-slate-800 transition-transform duration-300 hover:scale-105">
              <svg className="w-8 h-8 text-white" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
                <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#2563EB" />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-[#0F172A] font-brand">
                Vitalix<span className="text-[#2563EB]">.ai</span>
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 tracking-wide leading-relaxed">
                {STEP_TITLES[step]}
              </p>
            </div>
          </div>

          {/* النص تعريفي يُقرأ مرة واحدة — يظهر فقط في الخطوة التي بدأت منها الشاشة، لا في كل خطوة، حتى لا يضيف ارتفاعاً يدفع لوحة الأرقام وزر المتابعة خارج الشاشة */}
          {step === initialStep && (
            <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-blue-50 border-blue-200 text-blue-700 leading-relaxed">
              لأمان حسابك، اختر رمزاً يعرفه أنت وحدك. لن يستطيع أحد غيرك الدخول باسمك.
            </div>
          )}

          {success ? (
            <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-emerald-50 border-emerald-200 text-emerald-700">
              تم تغيير الرمز بنجاح ✅
            </div>
          ) : (
            <div className="space-y-5">
              {/* مؤشر التقدّم */}
              <div dir="ltr" className="flex items-center justify-center gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                      i < digits.length ? 'bg-slate-900 border-slate-900' : 'border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {error && (
                <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-rose-50 border-rose-200 text-rose-700">
                  {error}
                </div>
              )}

              {/* لوحة الأرقام — dir="ltr" هنا فقط: ترتيب لوحات الأرقام معياري عالمياً ولا ينعكس مع RTL */}
              <div dir="ltr" className="grid grid-cols-3 gap-2 sm:gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    disabled={saving}
                    className="h-11 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-2xl font-black text-slate-900 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleBackspace}
                  disabled={saving}
                  className="h-11 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-lg font-black text-slate-500 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  ⌫
                </button>
                <button
                  type="button"
                  onClick={() => handleDigit('0')}
                  disabled={saving}
                  className="h-11 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-2xl font-black text-slate-900 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  0
                </button>
                <div />
              </div>

              <button
                type="button"
                onClick={isConfirmStep ? handleSave : handleContinue}
                disabled={digits.length !== 6 || saving}
                className="w-full pt-3 pb-3 px-4 text-sm font-semibold text-white bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-xl shadow-md shadow-slate-900/10 flex items-center justify-center cursor-pointer"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري الحفظ...
                  </span>
                ) : isConfirmStep ? 'حفظ الرمز' : 'متابعة'}
              </button>
            </div>
          )}
        </div>

        <AppFooter className="mt-8" />
      </div>
    </div>
  );
}
