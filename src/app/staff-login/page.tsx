'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  LoginCarouselProvider, LoginBackground,
  LoginBrandAside, LoginCaptionMobile, LoginFooter,
} from '../components/login/LoginBrand';
import '../components/login/staff.css';

interface RosterStaff {
  name: string;
  login_slug: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = { pharmacist: 'صيدلاني', assistant: 'مساعد', staff: 'موظف' };
const STORAGE_KEY = 'vitalix_pharmacy_code';

type Step = 'code' | 'roster' | 'pin';

// الغلاف مكوّن واحد على مستوى الملف تستعمله حالة التحقق الأولي والخطوات معاً، فيحتفظ React بعنصر
// البطاقة ولا يعيد إنشاءه — حركة vx-flip تبدأ فور فتح الصفحة ولا تُعاد عند انتهاء الفحص (مظهر فقط)
function StaffShell({ showBack, showCaption, children }: { showBack: boolean; showCaption: boolean; children: React.ReactNode }) {
  return (
    <div className="vx-root vx-staff-root" dir="rtl">
      <LoginBackground />
      <LoginCarouselProvider>
        <div className="vx-shell">
          <main className="vx-form-side">
            <div className="vx-card vx-flip">
              {showBack && (
                <Link href="/" className="vx-staff-back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                  رجوع إلى الدخول بالبريد
                </Link>
              )}
              <div className="vx-staff-brand">
                <svg className="vx-staff-tile" viewBox="0 0 192 192" aria-hidden="true" focusable="false">
                  <rect width="192" height="192" rx="44" fill="#0F172A" />
                  <path d="M37.4 51.2L90.7 156.5L120 102.8" fill="none" stroke="#fff" strokeWidth="20.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M144 41Q149.2 66.8 175 72Q149.2 77.2 144 103Q138.8 77.2 113 72Q138.8 66.8 144 41Z" fill="#0D9488" />
                </svg>
                <div className="vx-staff-word" dir="ltr">Vitalix<b>-ai</b></div>
              </div>
              {children}
            </div>

            {showCaption && <LoginCaptionMobile />}
            <LoginFooter />
          </main>
          <LoginBrandAside />
        </div>
      </LoginCarouselProvider>
    </div>
  );
}

export default function StaffLoginPage() {
  const [step, setStep] = useState<Step>('code');
  const [initialLoading, setInitialLoading] = useState(true);

  // الخطوة ١: كود الصيدلية
  const [pharmacyCode, setPharmacyCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');

  // الخطوة ٢: قائمة الموظفين
  const [pharmacyName, setPharmacyName] = useState('');
  const [staffList, setStaffList] = useState<RosterStaff[]>([]);

  // الخطوة ٣: PIN
  const [selectedStaff, setSelectedStaff] = useState<RosterStaff | null>(null);
  const [pinDigits, setPinDigits] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);

  // جلب القائمة عبر الكود — يُستخدم عند الإرسال اليدوي وعند التخطّي التلقائي من localStorage
  const fetchRoster = async (code: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/staff/roster?code=${encodeURIComponent(code)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 404) {
          // كود مرفوض — قد يكون الكود المحفوظ محلياً صار قديماً بعد تبديله من الصيدلية
          localStorage.removeItem(STORAGE_KEY);
          setPharmacyCode('');
          setCodeError('كود الصيدلية غير صحيح — إن بدّلته صيدليتك مؤخراً، اطلب الكود الجديد منها');
        } else {
          setCodeError(json?.error || 'حدث خطأ، حاول مجدداً');
        }
        return false;
      }
      setPharmacyName(json?.pharmacy?.name || '');
      setStaffList((json?.staff as RosterStaff[]) || []);
      return true;
    } catch {
      setCodeError('تعذّر الاتصال بالخادم');
      return false;
    }
  };

  // تخطّي الخطوة ١ إن وُجد كود محفوظ مسبقاً
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) { setInitialLoading(false); return; }
    setPharmacyCode(saved);
    fetchRoster(saved).then((ok) => {
      if (ok) setStep('roster');
      else localStorage.removeItem(STORAGE_KEY);
      setInitialLoading(false);
    });
  }, []);

  // عدّاد القفل التصاعدي
  useEffect(() => {
    if (lockRemaining <= 0) return;
    const t = setTimeout(() => setLockRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockRemaining]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pharmacyCode.length !== 6) return;
    setCodeLoading(true);
    setCodeError('');
    const ok = await fetchRoster(pharmacyCode);
    if (ok) {
      localStorage.setItem(STORAGE_KEY, pharmacyCode);
      setStep('roster');
    }
    setCodeLoading(false);
  };

  const handleChangePharmacy = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPharmacyCode('');
    setPharmacyName('');
    setStaffList([]);
    setCodeError('');
    setStep('code');
  };

  const handleSelectStaff = (member: RosterStaff) => {
    setSelectedStaff(member);
    setPinDigits('');
    setPinError('');
    setLockRemaining(0);
    setStep('pin');
  };

  const handleBackToRoster = () => {
    setSelectedStaff(null);
    setPinDigits('');
    setPinError('');
    setStep('roster');
  };

  const handleDigit = (d: string) => {
    if (lockRemaining > 0 || pinLoading) return;
    setPinDigits((prev) => (prev.length < 6 ? prev + d : prev));
  };

  const handleBackspace = () => {
    if (lockRemaining > 0 || pinLoading) return;
    setPinDigits((prev) => prev.slice(0, -1));
  };

  const handleLogin = async () => {
    if (pinDigits.length !== 6 || !selectedStaff || lockRemaining > 0) return;
    setPinLoading(true);
    setPinError('');
    try {
      const res = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pharmacy_code: pharmacyCode, slug: selectedStaff.login_slug, pin: pinDigits }),
      });
      const json = await res.json().catch(() => null);

      // تحقّق صريح من شكل كائن الجلسة قبل استعماله — لا افتراض لأسماء حقوله
      const session = json?.session;
      if (res.ok && session && typeof session.access_token === 'string' && typeof session.refresh_token === 'string') {
        await supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
        // تنقّل صريح لا router.push — لضمان بداية نظيفة تماماً بلا حالة React موروثة (نفس تعليل page.tsx)
        window.location.href = '/dashboard';
        return;
      }

      if (res.status === 429) {
        setPinError(json?.error || 'الحساب مقفل مؤقتاً');
        setLockRemaining(Number(json?.retry_after) || 0);
      } else {
        setPinError(json?.error || 'حدث خطأ، حاول مجدداً');
      }
      setPinDigits('');
    } catch {
      setPinError('تعذّر الاتصال بالخادم');
      setPinDigits('');
    } finally {
      setPinLoading(false);
    }
  };

  // دعم الكيبورد واللصق في خطوة PIN — نفس نمط change-pin/page.tsx، التسجيل مضمون دائماً والحراسة داخل كل معالج
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step !== 'pin' || lockRemaining > 0 || pinLoading) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter' && pinDigits.length === 6) {
        handleLogin();
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (step !== 'pin' || lockRemaining > 0 || pinLoading) return;
      const cleaned = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (cleaned.length === 6) {
        e.preventDefault();
        setPinDigits(cleaned);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [step, lockRemaining, pinLoading, pinDigits, selectedStaff, pharmacyCode]);

  const pinLocked = lockRemaining > 0 || pinLoading;

  if (initialLoading) {
    return (
      <StaffShell showBack={false} showCaption>
        <div className="vx-staff-loading" role="status">
          <svg className="vx-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
          <p>جاري التحقق...</p>
        </div>
      </StaffShell>
    );
  }

  return (
    <StaffShell showBack={step !== 'pin'} showCaption={step !== 'pin'}>
      {/* -- الخطوة ١: كود الصيدلية -- */}
      {step === 'code' && (
        <>
          <h1 className="vx-h1">دخول الموظف</h1>
          <form onSubmit={handleCodeSubmit}>
            <div className="vx-lab">
              <label htmlFor="pharmacyCode">كود الصيدلية</label>
            </div>
            <div className="vx-field">
              <input
                id="pharmacyCode"
                name="pharmacyCode"
                type="text"
                dir="ltr"
                autoComplete="off"
                required
                maxLength={6}
                value={pharmacyCode}
                onChange={(e) => {
                  setCodeError('');
                  setPharmacyCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6));
                }}
                className="vx-inp vx-staff-code"
                placeholder="XXXXXX"
              />
            </div>

            <button
              type="submit"
              disabled={pharmacyCode.length !== 6 || codeLoading}
              className="vx-btn vx-staff-btn"
            >
              {codeLoading ? (
                <span className="vx-btn-load">
                  <svg className="vx-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
                  جاري التحقق...
                </span>
              ) : (
                'متابعة'
              )}
            </button>

            {codeError && (
              <div role="alert" className="vx-msg vx-msg-error" style={{ marginTop: 14, marginBottom: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.6v.01" /></svg>
                <span>{codeError}</span>
              </div>
            )}
          </form>
        </>
      )}

      {/* -- الخطوة ٢: اختيار الموظف -- */}
      {step === 'roster' && (
        <div>
          {!pharmacyName && <p className="vx-staff-hint">اختر اسمك من القائمة</p>}
          <div className="vx-staff-bar">
            {pharmacyName && (
              <span className="vx-staff-pill">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                <span>{pharmacyName}</span>
              </span>
            )}
            <button type="button" onClick={handleChangePharmacy} className="vx-staff-link">
              تغيير الصيدلية
            </button>
          </div>

          <div className="vx-staff-list">
            <div className="vx-staff-grid">
              {staffList.length === 0 ? (
                <p className="vx-staff-empty">لا يوجد موظفون مفعّلون حالياً</p>
              ) : (
                staffList.map((member) => (
                  <button
                    key={member.login_slug}
                    type="button"
                    onClick={() => handleSelectStaff(member)}
                    className="vx-staff-card"
                  >
                    <span className="vx-staff-av">{member.name.charAt(0)}</span>
                    <span className="vx-staff-name">{member.name}</span>
                    <span className={`vx-staff-role${member.role === 'pharmacist' ? ' is-pharm' : ''}`}>
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* -- الخطوة ٣: إدخال PIN -- */}
      {step === 'pin' && (
        <div>
          <div className="vx-staff-head">
            <div className="vx-staff-who">
              <span className="vx-staff-av" aria-hidden="true">{selectedStaff?.name.charAt(0)}</span>
              <div className="vx-staff-who-t">
                <h1 className="vx-staff-hello">مرحباً {selectedStaff?.name || ''}</h1>
                {selectedStaff && (
                  <span className={`vx-staff-role${selectedStaff.role === 'pharmacist' ? ' is-pharm' : ''}`}>
                    {ROLE_LABELS[selectedStaff.role] || selectedStaff.role}
                  </span>
                )}
              </div>
            </div>
            <button type="button" onClick={handleBackToRoster} className="vx-staff-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
              رجوع
            </button>
          </div>

          {/* مؤشر التقدّم */}
          <div dir="ltr" className={`vx-staff-dots${pinError ? ' is-err' : ''}`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`vx-staff-dot${i < pinDigits.length ? ' is-on' : ''}`} />
            ))}
          </div>

          {lockRemaining > 0 ? (
            <div role="alert" className="vx-msg vx-msg-error vx-staff-msg">
              <span>{pinError || 'الحساب مقفل مؤقتاً'} — حاول بعد <span dir="ltr">{lockRemaining}</span> ثانية</span>
            </div>
          ) : pinError ? (
            <div role="alert" className="vx-msg vx-msg-error vx-staff-msg">
              <span>{pinError}</span>
            </div>
          ) : null}

          {/* لوحة الأرقام — dir="ltr" هنا فقط: ترتيب لوحات الأرقام معياري عالمياً ولا ينعكس مع RTL */}
          <div dir="ltr" className="vx-staff-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                disabled={pinLocked}
                className="vx-staff-key"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              disabled={pinLocked}
              className="vx-staff-key"
              aria-label="مسح"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 9.75 14.25 12m0 0 2.25 2.25M14.25 12l2.25-2.25M14.25 12 12 14.25m-2.58 4.92-6.374-6.375a1.125 1.125 0 0 1 0-1.59L9.42 4.83c.211-.211.498-.33.796-.33H19.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25h-9.284c-.298 0-.585-.119-.796-.33Z" /></svg>
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              disabled={pinLocked}
              className="vx-staff-key"
            >
              0
            </button>
            <div />
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={pinDigits.length !== 6 || lockRemaining > 0 || pinLoading}
            className="vx-btn vx-staff-btn"
          >
            {pinLoading ? (
              <span className="vx-btn-load">
                <svg className="vx-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" strokeOpacity=".3" /><path d="M12 3a9 9 0 0 1 9 9" /></svg>
                جاري الدخول...
              </span>
            ) : (
              'دخول'
            )}
          </button>
        </div>
      )}
    </StaffShell>
  );
}
