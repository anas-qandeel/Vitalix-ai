"use client";

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppFooter from './components/AppFooter';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const searchParams = useSearchParams();

  // دالة توجيه ذكية بناءً على الصلاحيات — تعمّدنا استخدام تنقّل صريح (window.location.href) بدل
  // router.push: التنقّل الداخلي لـ Next.js قد يُعيد استخدام شجرة مكوّنات /dashboard المخبّأة من
  // جلسة سابقة بلا إعادة تركيب فعلية، فتبقى حالة React محليّة (مثل اسم الصيدلاني النشط في
  // localStorage) عالقة من الحساب السابق حتى يعمل المستخدم تحديثاً يدوياً للصفحة. إعادة تحميل
  // كاملة عند كل تسجيل دخول تضمن بداية نظيفة تماماً لكل حساب، بلا أي حالة موروثة من حساب آخر
  const redirectBasedOnRole = async (userId: string) => {
    const { data: adminRecord } = await supabase
      .from('platform_admins')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (adminRecord) {
      window.location.href = '/admin';
    } else {
      window.location.href = '/dashboard';
    }
  };

  useEffect(() => {
    // رسالة توضيحية إن كان المستخدم قد أُخرج تلقائياً بسبب توقيف حسابه
    if (searchParams.get('blocked') === 'suspended') {
      setMessage({ type: 'error', text: 'تم إيقاف هذا الحساب مؤقتاً. يرجى التواصل مع مسؤول المنصة لمزيد من التفاصيل.' });
    }

    const checkExistingSession = async () => {
      // قالب بريد الاستعادة الافتراضي في Supabase يوجّه إلى Site URL (هذه الصفحة) مع الرمز في
      // hash الرابط، لا إلى صفحة مخصّصة — لا يمكن تعديل القالب حالياً لأنه يشترط SMTP خاص.
      // بإعداد detectSessionInUrl الافتراضي، العميل ينشئ جلسة تلقائياً من هذا الرمز، فيصير
      // الرابط مفتاح دخول دائم بدل أداة استعادة لمرة واحدة. نعترض هذه الحالة هنا قبل أي
      // توجيه آخر ونحوّل المستخدم لتعيين كلمة مرور جديدة بدل الدخول للوحة مباشرة
      const hash = window.location.hash;
      if (hash.includes('type=recovery')) {
        window.history.replaceState(null, '', window.location.pathname);
        window.location.href = '/update-password';
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await redirectBasedOnRole(session.user.id);
      } else {
        setCheckingAuth(false);
      }
    };
    checkExistingSession();
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage({ type: 'error', text: 'بيانات الدخول غير صحيحة، يرجى المحاولة مجدداً.' });
      setLoading(false);
    } else if (data?.session) {
      setMessage({ type: 'success', text: 'تم تسجيل الدخول بنجاح! جاري التوجيه...' });
      await redirectBasedOnRole(data.session.user.id);
    }
  };


  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحقق من الجلسة والصلاحيات...</p>
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
                تابع مرضاك بذكاء
              </p>
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
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
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-semibold text-[#0F172A]">
                  كلمة المرور
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-[#2563EB] hover:underline font-semibold transition cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-normal shadow-sm"
                placeholder="••••••••"
              />
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
                  جاري التحقق...
                </span>
              ) : (
                'تسجيل الدخول'
              )}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] font-medium text-slate-400">أو</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          <Link
            href="/staff-login"
            className="w-full pt-3 pb-3 px-4 text-sm font-semibold text-[#0F172A] bg-white hover:bg-slate-50 active:scale-[0.98] transition-all rounded-xl border border-slate-200 shadow-sm flex items-center justify-center cursor-pointer"
          >
            دخول الموظفين برمز PIN
          </Link>

          {message && (
            <div
              className={`p-3.5 rounded-xl text-xs font-medium text-center border ${
                message.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <AppFooter className="mt-8" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحميل...</p>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}