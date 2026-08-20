'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppFooter from '../components/AppFooter';

export default function UpdatePasswordPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setHasSession(!!session);
      setCheckingSession(false);
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setConfirmError(null);
    setFormError(null);

    let hasError = false;
    if (password.length < 8) {
      setPasswordError('كلمة المرور يجب ألا تقل عن 8 خانات');
      hasError = true;
    }
    if (password !== confirmPassword) {
      setConfirmError('كلمتا المرور غير متطابقتين');
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setFormError('تعذّر تحديث كلمة المرور، يرجى المحاولة مجدداً.');
      setLoading(false);
      return;
    }

    // إبطال كل الجلسات الأخرى لهذا الحساب — إن كان أحد قد سرق الحساب يُطرد فوراً بعد تغيير
    // كلمة المرور. لا نُفشل العملية إن فشل هذا الاستدعاء: كلمة المرور تغيّرت فعلاً بنجاح
    await supabase.auth.signOut({ scope: 'others' });

    // ننهي الجلسة الحالية أيضاً حتى يضطر المستخدم لتسجيل الدخول من جديد بكلمته الجديدة —
    // هذا يتأكد فعلياً أنها تعمل ويرسّخها في ذاكرته، بدل الدخول التلقائي للوحة مباشرة
    await supabase.auth.signOut();

    setLoading(false);
    setSuccess(true);

    // تنقّل صريح لا router.push — نفس تعليل صفحة تسجيل الدخول: نضمن بداية نظيفة تماماً
    // بلا أي حالة React أو localStorage عالقة من الجلسة السابقة
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحقق من الجلسة...</p>
      </div>
    );
  }

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
                تعيين كلمة مرور جديدة
              </p>
            </div>
          </div>

          {!hasSession ? (
            <div className="space-y-6 text-center">
              <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-rose-50 border-rose-200 text-rose-700">
                انتهت صلاحية الجلسة، يرجى طلب رابط استعادة جديد.
              </div>
              <a
                href="/forgot-password"
                className="w-full inline-block pt-3 pb-3 px-4 text-sm font-semibold text-white bg-[#0F172A] hover:bg-slate-800 active:scale-[0.98] transition-all rounded-xl shadow-md shadow-slate-900/10 cursor-pointer"
              >
                طلب رابط جديد
              </a>
            </div>
          ) : success ? (
            <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-emerald-50 border-emerald-200 text-emerald-700">
              تم تغيير كلمة المرور بنجاح. سجّل دخولك بكلمتك الجديدة.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-[#0F172A]">
                  كلمة المرور الجديدة
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-normal shadow-sm"
                  placeholder="••••••••"
                />
                {passwordError && (
                  <p className="text-[11px] font-semibold text-rose-600">{passwordError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-[#0F172A]">
                  تأكيد كلمة المرور
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-normal shadow-sm"
                  placeholder="••••••••"
                />
                {confirmError && (
                  <p className="text-[11px] font-semibold text-rose-600">{confirmError}</p>
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
                    جاري الحفظ...
                  </span>
                ) : (
                  'حفظ كلمة المرور'
                )}
              </button>

              {formError && (
                <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-rose-50 border-rose-200 text-rose-700">
                  {formError}
                </div>
              )}
            </form>
          )}
        </div>

        <AppFooter className="mt-8" />
      </div>
    </div>
  );
}
