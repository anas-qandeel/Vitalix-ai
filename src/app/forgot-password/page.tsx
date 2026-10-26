'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LoginCarouselProvider, LoginBackground, LoginBrandAside, LoginCaptionMobile, LoginFooter,
} from '../components/login/LoginBrand';
import '../components/login/forgot.css';

const COOLDOWN_SECONDS = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// غلاف الصفحة (الخلفية + البطاقة الزجاجية + لوحة العلامة) — مكوّن واحد على مستوى الملف حتى لا
// يُعاد إنشاء البطاقة عند التبديل بين النموذج وشاشة النجاح. مظهر فقط. رابط الخصوصية يبقى ظاهراً هنا
function ForgotShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="vx-root vx-forgot-page-root" dir="rtl">
      <LoginBackground />
      <LoginCarouselProvider>
        <div className="vx-shell">
          <main className="vx-form-side">
            <div className="vx-card">
              <div className="vx-forgot-page-brand">
                <svg className="vx-forgot-page-tile" viewBox="0 0 192 192" aria-hidden="true" focusable="false">
                  <rect width="192" height="192" rx="44" fill="#0F172A" />
                  <path d="M37.4 51.2L90.7 156.5L120 102.8" fill="none" stroke="#fff" strokeWidth="20.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M144 41Q149.2 66.8 175 72Q149.2 77.2 144 103Q138.8 77.2 113 72Q138.8 66.8 144 41Z" fill="#0D9488" />
                </svg>
                <div className="vx-forgot-page-word" dir="ltr">Vitalix<b>-ai</b></div>
              </div>
              <h1 className="vx-forgot-page-h1">استعادة كلمة المرور</h1>
              {children}
            </div>
            <LoginCaptionMobile />
            <LoginFooter showPrivacy />
          </main>
          <LoginBrandAside />
        </div>
      </LoginCarouselProvider>
    </div>
  );
}

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

  const sendResetLink = async () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    if (!EMAIL_REGEX.test(email)) {
      setEmailError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    await sendResetLink();
  };

  const handleResend = async () => {
    await sendResetLink();
  };

  return (
    <ForgotShell>
      {sent ? (
        <div>
          <div className="vx-forgot-page-check" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </div>
          <div role="status" className="vx-msg vx-msg-success vx-forgot-page-note">
            <span>إذا كان هذا البريد مسجّلاً لدينا، فسيصلك رابط تغيير كلمة المرور خلال دقائق. تحقّق من صندوق الوارد ومن مجلد البريد غير المرغوب فيه.</span>
          </div>
          <a href="/" className="vx-btn vx-forgot-page-btn">
            العودة لتسجيل الدخول
          </a>
          {cooldown > 0 ? (
            <p className="vx-forgot-page-cool">
              يمكنك طلب رابط جديد بعد {cooldown} ثانية
            </p>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="vx-pin vx-forgot-page-resend"
            >
              {loading ? (
                <span className="vx-btn-load">
                  <svg className="vx-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
                  جاري الإرسال...
                </span>
              ) : (
                'إعادة إرسال الرابط'
              )}
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
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
          {emailError && (
            <div role="alert" className="vx-msg vx-msg-error vx-forgot-page-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.6v.01" /></svg>
              <span>{emailError}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="vx-btn vx-forgot-page-btn">
            {loading ? (
              <span className="vx-btn-load">
                <svg className="vx-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
                جاري الإرسال...
              </span>
            ) : (
              <>
                <span>إرسال الرابط</span>
                <svg className="vx-forgot-page-send" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
              </>
            )}
          </button>

          <a href="/" className="vx-forgot-page-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
            العودة لتسجيل الدخول
          </a>
        </form>
      )}
    </ForgotShell>
  );
}
