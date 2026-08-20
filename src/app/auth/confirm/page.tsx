'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { EmailOtpType } from '@supabase/supabase-js';

function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'checking' | 'invalid' | 'expired'>('checking');

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type');

    // نتحقق من النوع أولاً قبل أي استدعاء — رابط استعادة كلمة المرور يجب أن يكون type=recovery حصراً
    if (!tokenHash || type !== 'recovery') {
      setStatus('invalid');
      return;
    }

    const verify = async () => {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as EmailOtpType,
      });

      if (error) {
        setStatus('expired');
        return;
      }

      // replace لا push — حتى لا يعود المستخدم بزر الرجوع إلى رابط يحمل الرمز
      router.replace('/update-password');
    };

    verify();
  }, [searchParams, router]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-sans" dir="rtl">
        <p className="text-xs font-bold text-slate-500 animate-pulse">جاري التحقق من الرابط...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans px-4" dir="rtl">
      <div className="w-full max-w-[420px]">
        <div className="bg-white p-9 sm:p-10 rounded-[22px] border border-slate-200/80 shadow-[0_20px_50px_rgba(15,23,42,0.04)] space-y-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center">
            <svg className="w-7 h-7 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-bold text-slate-900">
              {status === 'invalid' ? 'الرابط غير صالح' : 'الرابط منتهي الصلاحية أو مستخدم مسبقاً'}
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              {status === 'invalid'
                ? 'الرابط الذي فتحته لا يحتوي على البيانات اللازمة لاستعادة كلمة المرور.'
                : 'يرجى طلب رابط استعادة جديد للمتابعة.'}
            </p>
          </div>

          {status === 'invalid' ? (
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 active:scale-95 transition-all rounded-xl cursor-pointer"
            >
              العودة لتسجيل الدخول
            </button>
          ) : (
            <button
              onClick={() => router.push('/forgot-password')}
              className="w-full py-3 px-4 text-sm font-semibold text-white bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 active:scale-95 transition-all rounded-xl cursor-pointer"
            >
              طلب رابط جديد
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-sans" dir="rtl">
        <p className="text-xs font-bold text-slate-500 animate-pulse">جاري التحميل...</p>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
