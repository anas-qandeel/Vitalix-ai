"use client";

import { useEffect, useState, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LoginCarouselProvider, LoginBackground, LoginBrandMark,
  LoginBrandAside, LoginCaptionMobile, LoginFooter,
} from './components/login/LoginBrand';

// الغلاف مكوّن واحد على مستوى الملف تستعمله حالة التحقق والنموذج معاً، فيحتفظ React بعنصر البطاقة
// ولا يعيد إنشاءه (فلا تُعاد حركتها) عند انتهاء الفحص — مظهر فقط ولا علاقة له بمنطق الدخول
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="vx-root" dir="rtl">
      <LoginBackground />
      <LoginCarouselProvider>
        <div className="vx-shell">
          <main className="vx-form-side">
            <div className="vx-card">
              <LoginBrandMark />
              {children}
            </div>
            <LoginCaptionMobile />
            <LoginFooter />
          </main>
          <LoginBrandAside />
        </div>
      </LoginCarouselProvider>
    </div>
  );
}

function LoginLoading({ text }: { text: string }) {
  return (
    <div className="vx-loading" role="status">
      <svg className="vx-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
      <p>{text}</p>
    </div>
  );
}

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  // حالتان للواجهة فقط (إظهار كلمة المرور وشارة Caps Lock) — لا علاقة لهما بمنطق الدخول
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
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
    // رسالة توضيحية إن كان المستخدم قد أُخرج تلقائياً لانتهاء جلسته
    // (يضبطها الاعتراض المركزي في src/lib/supabase.ts عند رفض السيرفر بـ401)
    else if (searchParams.get('expired') === '1') {
      setMessage({ type: 'error', text: 'انتهت جلستك. سجّل الدخول من جديد للمتابعة.' });
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
      <LoginShell>
        <LoginLoading text="جاري التحقق من الجلسة والصلاحيات..." />
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <h1 className="vx-h1">أهلاً بعودتك</h1>

      {/* Login Form */}
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`vx-msg ${message.type === 'error' ? 'vx-msg-error' : 'vx-msg-success'}`}
        >
          {message.type === 'error' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.6v.01" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></svg>
          )}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleLogin}>
        <div>
          <div className="vx-lab">
            <label htmlFor="email">البريد الإلكتروني</label>
          </div>
          <div className="vx-field">
            <span className="vx-ic" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 5.5L20 8" /></svg>
            </span>
            <input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="vx-inp"
              placeholder="name@pharmacy.com"
            />
          </div>
        </div>

        <div className="vx-group2">
          <div className="vx-lab">
            <label htmlFor="password">كلمة المرور</label>
          </div>
          <div className="vx-field">
            <span className="vx-ic" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><rect x="5" y="11" width="14" height="9" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            </span>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={(e) => setCapsOn(e.getModifierState('CapsLock'))}
              onBlur={() => setCapsOn(false)}
              className="vx-inp"
              placeholder="••••••••"
            />
            <button
              type="button"
              className="vx-eye"
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" />
                {showPassword && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
          <div className="vx-forgot-row">
            {capsOn && (
              <div className="vx-caps" role="status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 4 5 12h4v5h6v-5h4z" /><path d="M9 20.5h6" /></svg>
                زر Caps Lock مفعّل
              </div>
            )}
            <Link href="/forgot-password" className="vx-forgot">
              نسيت كلمة المرور؟
            </Link>
          </div>
        </div>

        <button type="submit" disabled={loading} className="vx-btn">
          {loading ? (
            <span className="vx-btn-load">
              <svg className="vx-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
              جاري التحقق...
            </span>
          ) : (
            <>
              <span>تسجيل الدخول</span>
              <svg className="vx-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></svg>
            </>
          )}
        </button>
      </form>

      <div className="vx-or">أو</div>

      <Link href="/staff-login" className="vx-pin">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="1.8" /><circle cx="12" cy="6" r="1.8" /><circle cx="18" cy="6" r="1.8" /><circle cx="6" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="18" cy="12" r="1.8" /><circle cx="6" cy="18" r="1.8" /><circle cx="12" cy="18" r="1.8" /><circle cx="18" cy="18" r="1.8" /></svg>
        دخول الموظفين برمز PIN
      </Link>
    </LoginShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell><LoginLoading text="جاري التحميل..." /></LoginShell>}>
      <LoginContent />
    </Suspense>
  );
}
