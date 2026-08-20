'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppFooter from '../components/AppFooter';

const COOLDOWN_SECONDS = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    if (!EMAIL_REGEX.test(email)) {
      setEmailError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });

    // لا نعرض الخطأ للمستخدم إطلاقاً — رسالة موحّدة دائماً بغض النظر عن نتيجة الطلب،
    // وإلا صار النموذج أداة لتعداد أي البُرد الإلكترونية مسجّلة لدينا فعلاً
    if (error) {
      console.error(error);
    }

    setLoading(false);
    setSent(true);
    startCooldown();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans antialiased selection:bg-[#2563EB] selection:text-[#FFFFFF] px-4" dir="rtl">
      <style>{`
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
              <svg
                className="w-8 h-8 text-white"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z"
                  fill="#2563EB"
                />
              </svg>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-[#0F172A] font-brand">
                Vitalix<span className="text-[#2563EB]">.ai</span>
              </h1>
              <p className="text-xs sm:text-sm font-semibold text-slate-500 tracking-wide leading-relaxed">
                استعادة كلمة المرور
              </p>
            </div>
          </div>

          {sent ? (
            <div className="space-y-6">
              <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-emerald-50 border-emerald-200 text-emerald-700 leading-relaxed">
                إذا كان هذا البريد مسجّلاً لدينا، فسيصلك رابط تغيير كلمة المرور خلال دقائق. تحقّق من صندوق الوارد ومن مجلد البريد غير المرغوب فيه.
              </div>
              <a
                href="/"
                className="w-full inline-block text-center pt-3 pb-3 px-4 text-sm font-semibold text-white bg-[#0F172A] hover:bg-slate-800 active:scale-[0.98] transition-all rounded-xl shadow-md shadow-slate-900/10 cursor-pointer"
              >
                العودة لتسجيل الدخول
              </a>
              {cooldown > 0 && (
                <p className="text-[11px] font-medium text-slate-400 text-center tabular-nums">
                  يمكنك طلب رابط جديد بعد {cooldown} ثانية
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-semibold text-[#0F172A]">
                  البريد الإلكتروني
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-normal shadow-sm"
                  placeholder="name@pharmacy.com"
                />
                {emailError && (
                  <p className="text-[11px] font-semibold text-rose-600">{emailError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full pt-3 pb-3 px-4 text-sm font-semibold text-white bg-[#0F172A] hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 transition-all rounded-xl shadow-md shadow-slate-900/10 flex items-center justify-center cursor-pointer mt-2"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري الإرسال...
                  </span>
                ) : (
                  'إرسال الرابط'
                )}
              </button>

              <a
                href="/"
                className="block text-center text-xs text-slate-500 hover:text-slate-700 font-semibold transition"
              >
                العودة لتسجيل الدخول
              </a>
            </form>
          )}
        </div>

        <AppFooter className="mt-8" />
      </div>
    </div>
  );
}
