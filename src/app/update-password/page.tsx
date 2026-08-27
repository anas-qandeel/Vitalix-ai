'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPharmacyId } from '@/lib/tenant';
import { validatePassword, checkPassword, isPasswordValid } from '@/lib/password';
import AppFooter from '../components/AppFooter';

// نفس نطاقات الأحرف العربية المعرّفة في detectTextDir بـ src/lib/text-direction.ts —
// غير مصدّرة من هناك فأُعيد تعريفها هنا محلياً لمنع كتابة أحرف عربية في كلمة المرور
const ARABIC_LETTER_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;

function IconEye({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconEyeOff({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

function UpdatePasswordContent() {
  const searchParams = useSearchParams();
  const forced = searchParams.get('forced') === '1';

  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const checks = checkPassword(password);

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
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      setPasswordError(passwordCheck.message || 'كلمة المرور غير صحيحة');
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

    // تصفير must_change_password فور نجاح تغيير كلمة المرور — قبل أي signOut، لأن هذا
    // التحديث محمي بسياسة RLS تشترط جلسة نشطة لمالك الصيدلية (current_role_name()='owner').
    // لغير المالك (موظف يغيّر كلمته عبر "نسيت كلمة المرور" مثلاً) لا صلة لهذا العلم بحسابه
    // أصلاً وسياسة RLS ترفض التحديث بصمت، فلا نُفشل العملية بسببه — الفشل حاسم فقط في وضع
    // الإجبار (forced) لأن تجاهله هناك يُعيد المالك لحلقة التوجيه بلا فهم للسبب
    const pharmacyId = await getPharmacyId();
    const { error: flagError } = pharmacyId
      ? await supabase.from('pharmacies').update({ must_change_password: false }).eq('id', pharmacyId)
      : { error: null };

    if (forced && flagError) {
      setFormError('تعذّر إكمال العملية، يرجى المحاولة مجدداً أو التواصل مع الدعم.');
      setLoading(false);
      return;
    }

    // إبطال كل الجلسات الأخرى لهذا الحساب — إن كان أحد قد سرق الحساب يُطرد فوراً بعد تغيير
    // كلمة المرور. لا نُفشل العملية إن فشل هذا الاستدعاء: كلمة المرور تغيّرت فعلاً بنجاح
    await supabase.auth.signOut({ scope: 'others' });

    if (forced) {
      // المالك مُوثَّق بالفعل ويكمل خطوة إجبارية بلا اختيار منه — لا داعٍ لتسجيل خروج/دخول
      // إضافي كما في مسار "نسيت كلمة المرور" الاختياري، ننقله مباشرة إلى لوحة التحكم
      window.location.href = '/dashboard';
      return;
    }

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
            <>
              {forced && (
                <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-blue-50 border-blue-200 text-blue-700 leading-relaxed">
                  لحمايتك، يجب تغيير كلمة المرور الأولى قبل استخدام النظام
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-[#0F172A]">
                  كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(ARABIC_LETTER_RE, ''))}
                    className="w-full px-4 py-3 pl-11 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-normal shadow-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F172A] transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                <ul className="space-y-1 text-[11px]">
                  {[
                    { ok: checks.length, label: '8 أحرف على الأقل' },
                    { ok: checks.hasLetter, label: 'تحوي حرفاً إنجليزياً' },
                    { ok: checks.hasDigit, label: 'تحوي رقماً' },
                    { ok: checks.notSimple, label: 'ليست نمطاً بسيطاً أو كلمة شائعة' },
                  ].map((item, i) => (
                    <li key={i} className={`flex items-center gap-1.5 ${item.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
                      <span>{item.ok ? '✓' : '✗'}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
                {passwordError && (
                  <p className="text-[11px] font-semibold text-rose-600">{passwordError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-[#0F172A]">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value.replace(ARABIC_LETTER_RE, ''))}
                    className="w-full px-4 py-3 pl-11 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-normal shadow-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F172A] transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <IconEyeOff /> : <IconEye />}
                  </button>
                </div>
                {confirmError && (
                  <p className="text-[11px] font-semibold text-rose-600">{confirmError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !isPasswordValid(checks) || password !== confirmPassword}
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
            </>
          )}
        </div>

        <AppFooter className="mt-8" />
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحميل...</p>
      </div>
    }>
      <UpdatePasswordContent />
    </Suspense>
  );
}
