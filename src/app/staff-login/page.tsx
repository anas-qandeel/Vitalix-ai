'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppFooter from '../components/AppFooter';

interface RosterStaff {
  name: string;
  login_slug: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = { pharmacist: 'صيدلاني', assistant: 'مساعد', staff: 'موظف' };
const STORAGE_KEY = 'vitalix_pharmacy_code';

type Step = 'code' | 'roster' | 'pin';

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
        setCodeError(json?.error || 'حدث خطأ، حاول مجدداً');
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

  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] font-sans" dir="rtl">
        <p className="text-sm font-semibold text-slate-500 animate-pulse">جاري التحقق...</p>
      </div>
    );
  }

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
                {step === 'code' && 'دخول الموظف'}
                {step === 'roster' && (pharmacyName || 'اختر اسمك من القائمة')}
                {step === 'pin' && `مرحباً ${selectedStaff?.name || ''}`}
              </p>
            </div>
          </div>

          {/* ── الخطوة ١: كود الصيدلية ── */}
          {step === 'code' && (
            <form onSubmit={handleCodeSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="pharmacyCode" className="block text-xs font-semibold text-[#0F172A]">
                  كود الصيدلية
                </label>
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
                  className="w-full px-4 py-3 text-lg tracking-[0.3em] text-center bg-white border border-slate-200 rounded-xl focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A] focus:outline-none transition-all text-[#0F172A] placeholder:text-slate-400 font-bold shadow-sm"
                  placeholder="XXXXXX"
                />
              </div>

              <button
                type="submit"
                disabled={pharmacyCode.length !== 6 || codeLoading}
                className="w-full pt-3 pb-3 px-4 text-sm font-semibold text-white bg-[#0F172A] hover:bg-slate-800 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-xl shadow-md shadow-slate-900/10 flex items-center justify-center cursor-pointer mt-2"
              >
                {codeLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري التحقق...
                  </span>
                ) : (
                  'متابعة'
                )}
              </button>

              {codeError && (
                <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-rose-50 border-rose-200 text-rose-700">
                  {codeError}
                </div>
              )}
            </form>
          )}

          {/* ── الخطوة ٢: اختيار الموظف ── */}
          {step === 'roster' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleChangePharmacy}
                  className="text-xs text-[#2563EB] hover:underline font-semibold transition cursor-pointer"
                >
                  تغيير الصيدلية
                </button>
              </div>

              <div className="space-y-2.5">
                {staffList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center font-medium py-4">لا يوجد موظفون مفعّلون حالياً</p>
                ) : (
                  staffList.map((member) => (
                    <button
                      key={member.login_slug}
                      type="button"
                      onClick={() => handleSelectStaff(member)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 bg-white border border-slate-200 rounded-2xl hover:border-teal-300 hover:shadow-md active:scale-[0.98] transition-all cursor-pointer text-right"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-900 to-teal-800 text-white flex items-center justify-center text-sm font-black shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{member.name}</p>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
                        {ROLE_LABELS[member.role] || member.role}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── الخطوة ٣: إدخال PIN ── */}
          {step === 'pin' && (
            <div className="space-y-5">
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleBackToRoster}
                  className="text-xs text-[#2563EB] hover:underline font-semibold transition cursor-pointer"
                >
                  ← رجوع
                </button>
              </div>

              {/* مؤشر التقدّم */}
              <div dir="ltr" className="flex items-center justify-center gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                      i < pinDigits.length ? 'bg-slate-900 border-slate-900' : 'border-slate-300'
                    }`}
                  />
                ))}
              </div>

              {lockRemaining > 0 ? (
                <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-rose-50 border-rose-200 text-rose-700">
                  {pinError || 'الحساب مقفل مؤقتاً'} — حاول بعد <span dir="ltr">{lockRemaining}</span> ثانية
                </div>
              ) : pinError ? (
                <div className="p-3.5 rounded-xl text-xs font-medium text-center border bg-rose-50 border-rose-200 text-rose-700">
                  {pinError}
                </div>
              ) : null}

              {/* لوحة الأرقام — dir="ltr" هنا فقط: ترتيب لوحات الأرقام معياري عالمياً ولا ينعكس مع RTL */}
              <div dir="ltr" className="grid grid-cols-3 gap-2 sm:gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    disabled={lockRemaining > 0 || pinLoading}
                    className="h-11 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-2xl font-black text-slate-900 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleBackspace}
                  disabled={lockRemaining > 0 || pinLoading}
                  className="h-11 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-lg font-black text-slate-500 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  ⌫
                </button>
                <button
                  type="button"
                  onClick={() => handleDigit('0')}
                  disabled={lockRemaining > 0 || pinLoading}
                  className="h-11 sm:h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-2xl font-black text-slate-900 active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  0
                </button>
                <div />
              </div>

              <button
                type="button"
                onClick={handleLogin}
                disabled={pinDigits.length !== 6 || lockRemaining > 0 || pinLoading}
                className="w-full pt-3 pb-3 px-4 text-sm font-semibold text-white bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-xl shadow-md shadow-slate-900/10 flex items-center justify-center cursor-pointer"
              >
                {pinLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري الدخول...
                  </span>
                ) : (
                  'دخول'
                )}
              </button>
            </div>
          )}
        </div>

        <AppFooter className="mt-8" />
      </div>
    </div>
  );
}
