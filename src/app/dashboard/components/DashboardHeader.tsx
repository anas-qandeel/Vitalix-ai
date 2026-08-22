'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPharmacyId, getStaffName, getUserRole } from '@/lib/tenant';

const ROLE_LABELS: Record<string, string> = { owner: 'مالك', pharmacist: 'صيدلاني', assistant: 'مساعد', staff: 'موظف' };

const VitalixLogo = () => (
  <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#2563EB" />
  </svg>
);

function resolvePharmacyName(row: { name?: string | null; pharmacy_name?: string | null } | null): string {
  const raw = row?.name || row?.pharmacy_name || '';
  if (!raw.trim()) return 'صيدليتك';
  return raw.startsWith('صيدلية') ? raw : `صيدلية ${raw}`;
}

function pluralizeDays(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

export function usePharmacyInfo() {
  const [pharmacyName, setPharmacyName] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [pharmacyStatus, setPharmacyStatus] = useState('');
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        // معرّف الصيدلية عبر tenant.ts لا session.user.id مباشرة — لموظف مسجّل دخوله
        // بحساب مصادقة مستقل، session.user.id هو هوية الموظف نفسه وليس هوية الصيدلية
        const pid = await getPharmacyId();
        if (!pid) return;
        const { data } = await supabase
          .from('pharmacies')
          .select('name, pharmacy_name, pharmacist_name, status, expiry_date')
          .eq('id', pid)
          .single();
        setPharmacyName(resolvePharmacyName(data));
        setPharmacistName(data?.pharmacist_name || '');
        setPharmacyStatus(data?.status || '');
        setExpiryDate(data?.expiry_date || null);
      } catch { }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const getDaysLeft = () => {
    if (!expiryDate) return 0;
    return Math.max(0, Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000));
  };

  return { pharmacyName, pharmacistName, pharmacyStatus, expiryDate, daysLeft: getDaysLeft(), loading };
}

const NAV_LINKS = [
  { label: 'الرئيسية', href: '/dashboard', exact: true },
  { label: 'الفحوصات', href: '/dashboard/vitals', exact: false },
  { label: 'المزمنون', href: '/dashboard/chronic', exact: false },
  { label: 'المرضى', href: '/dashboard/patients', exact: false },
];

interface DashboardHeaderProps {
  breadcrumb?: string;
  onBack?: () => void;
}

export default function DashboardHeader({ breadcrumb, onBack }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { pharmacyName, pharmacistName, pharmacyStatus, daysLeft, loading } = usePharmacyInfo();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feature');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);

  // هوية المستخدم الحالي فعلياً (من سجّل دخوله) — لا من مبدّل محلي
  useEffect(() => {
    const load = async () => {
      const [name, role] = await Promise.all([getStaffName(), getUserRole()]);
      setStaffName(name);
      setUserRole(role);
    };
    load();
  }, []);

  // إغلاق قائمة التنقل الموبايل تلقائياً عند تغيير الصفحة
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) setMobileNavOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSendFeedback = async () => {
    if (!feedbackMsg.trim()) return;
    setFeedbackSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const pid2 = await getPharmacyId();
      if (!pid2) return;
      const { data: phData } = await supabase
        .from('pharmacies').select('name, pharmacy_name').eq('id', pid2).single();
      const pharmacyName = phData?.name || phData?.pharmacy_name || '';
      await supabase.from('feedback').insert({
        pharmacy_id: pid2,
        pharmacy_name: pharmacyName,
        pharmacist_name: (await getStaffName()) || null,
        type: feedbackType,
        message: feedbackMsg.trim(),
        rating: feedbackRating || null,
      });
      setFeedbackDone(true);
      setTimeout(() => {
        setFeedbackOpen(false);
        setFeedbackMsg(''); setFeedbackType('feature'); setFeedbackRating(0); setFeedbackDone(false);
      }, 2000);
    } catch { }
    finally { setFeedbackSending(false); }
  };

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await supabase.auth.signOut();
    // إعادة تحميل كاملة لا تنقّل داخلي — تضمن تفريغ كل حالة React المحلية لهذا الحساب
    // (راجع التعليق في redirectBasedOnRole بصفحة تسجيل الدخول لنفس السبب بالتفصيل)
    window.location.href = '/';
  };

  const displayName = staffName || pharmacistName || 'الصيدلي المسؤول';
  const initials = displayName.trim().split(' ').map((w: string) => w[0]).slice(0, 2).join('');
  const roleLabel = ROLE_LABELS[userRole] || '';
  const isExpiringSoon = daysLeft <= 14;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@700;800;900&display=swap');
        body { font-family: 'IBM Plex Sans Arabic', system-ui, sans-serif; }
        .font-brand { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        @keyframes dropdownFade {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-dropdown { animation: dropdownFade 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: top left; }
        .animate-dropdown-r { animation: dropdownFade 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: top right; }
      `}</style>

      <div className="sticky top-0 z-50 h-1 bg-slate-900" />

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-1 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between">

          {/* يمين: اللوجو + التنقل */}
          <div className="flex items-center gap-2 sm:gap-6 shrink-0">
            {/* زر قائمة التنقل — يظهر فقط على الموبايل/التابلت الصغير حيث تُخفى nav الديسكتوب */}
            {!breadcrumb && (
              <button onClick={() => setMobileNavOpen(v => !v)}
                className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
                aria-label="فتح قائمة التنقل" aria-expanded={mobileNavOpen}>
                {mobileNavOpen ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                )}
              </button>
            )}

            <button onClick={() => router.push('/dashboard')}
              className="flex items-center gap-3 cursor-pointer group" aria-label="الرئيسية">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200 shrink-0">
                <VitalixLogo />
              </div>
              <div className="hidden sm:flex flex-col text-right leading-none">
                <span className="text-[15px] font-black tracking-tight font-brand text-slate-900">
                  Vitalix<span className="text-[#2563EB]">.ai</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold mt-1 group-hover:text-slate-700 transition-colors">
                  تابع مرضاك بذكاء
                </span>
              </div>
            </button>

            {!breadcrumb && <div className="hidden md:block w-px h-6 bg-slate-200 ml-2" />}

            {!breadcrumb && (
              <nav className="hidden md:flex items-center gap-1">
                {NAV_LINKS.map((link) => {
                  const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
                  return (
                    <button key={link.href} onClick={() => router.push(link.href)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive ? 'bg-slate-100 text-slate-900 font-bold shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                      }`}>
                      {link.label}
                    </button>
                  );
                })}
              </nav>
            )}

            {breadcrumb && (
              <div className="flex items-center gap-3 shrink-0">
                <div className="hidden md:block w-px h-6 bg-slate-200 mx-1" />
                <button onClick={onBack || (() => router.back())}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                  <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{breadcrumb}</span>
              </div>
            )}
          </div>

          {/* يسار: اسم الصيدلية + اختيار الصيدلاني + Avatar */}
          <div className="flex items-center gap-3 shrink-0">

            {/* بادج اسم الصيدلية — في وضع breadcrumb تُخفى على الجوال لضيق المساحة وتظهر من md فأعلى فقط */}
            <div className={`${breadcrumb ? 'hidden md:flex' : 'hidden sm:flex'} items-center gap-2.5 bg-gradient-to-r from-teal-50/50 to-emerald-50/50 border border-teal-100/60 px-4 py-1.5 rounded-full shadow-[0_2px_10px_-3px_rgba(20,184,166,0.15)]`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                pharmacyStatus === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 animate-pulse'
              }`} />
              {loading ? (
                <span className="inline-block w-24 h-4 bg-teal-100 rounded animate-pulse" />
              ) : (
                <span className="text-sm font-bold text-teal-900 truncate max-w-[200px]">{pharmacyName}</span>
              )}
            </div>

            {/* ── هوية المستخدم الحالي (غير قابلة للنقر) ── */}
            {staffName && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                <div className="w-5 h-5 rounded-md bg-slate-200 flex items-center justify-center text-[10px] font-black text-slate-600 shrink-0">
                  {displayName.charAt(0)}
                </div>
                <span className="max-w-[100px] truncate">{displayName}</span>
                {roleLabel && (
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-md shrink-0">
                    {roleLabel}
                  </span>
                )}
              </div>
            )}

            <div className="w-px h-6 bg-slate-200" />

            {/* Avatar + Dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">
                {loading ? <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" /> : initials}
              </button>

              {dropdownOpen && (
                <div className="absolute top-[calc(100%+10px)] left-0 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 animate-dropdown">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0 shadow-sm">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{pharmacyName}</p>
                      </div>
                    </div>
                    {userRole === 'owner' && (
                      <div className="mt-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-md border ${
                          isExpiringSoon ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isExpiringSoon ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                          اشتراك {pharmacyStatus === 'active' ? 'نشط' : 'تجريبي'} ({pluralizeDays(daysLeft)})
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-1.5">
                    {userRole === 'owner' && (
                      <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        onClick={() => { setDropdownOpen(false); router.push('/dashboard/profile'); }}>
                        <span className="text-base shrink-0">👤</span><span>الملف الشخصي</span>
                      </button>
                    )}
                    {userRole === 'owner' && (
                      <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors mt-0.5"
                        onClick={() => { setDropdownOpen(false); router.push('/dashboard/activity'); }}>
                        <span className="text-base shrink-0">📋</span><span>سجل النشاط</span>
                      </button>
                    )}
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors mt-0.5"
                      onClick={() => { setDropdownOpen(false); router.push('/dashboard/pharmacy-catalog-manager'); }}>
                      <span className="text-base shrink-0">📦</span><span>الكتالوج والمنتجات</span>
                    </button>
                  </div>

                  <div className="p-1.5 border-t border-slate-100">
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-violet-600 rounded-lg hover:bg-violet-50 transition-colors"
                      onClick={() => { setDropdownOpen(false); setFeedbackOpen(true); }}>
                      <span className="text-base shrink-0">💡</span><span>اقتراح أو ملاحظة</span>
                    </button>
                    {userRole === 'owner' ? (
                      <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
                        onClick={() => {
                          setDropdownOpen(false);
                          supabase.auth.getUser().then(({ data }) => {
                            if (data.user?.email) {
                              supabase.auth.resetPasswordForEmail(data.user.email, {
                                redirectTo: `${window.location.origin}/auth/confirm`,
                              }).then(({ error }) => {
                                if (error) {
                                  alert('تعذر إرسال الرابط، حاول مجدداً ❌');
                                  return;
                                }
                                alert('تم إرسال رابط تغيير كلمة المرور إلى بريدك الإلكتروني ✅');
                              });
                            }
                          });
                        }}>
                        <span className="text-base shrink-0">🔑</span><span>تغيير كلمة المرور</span>
                      </button>
                    ) : (
                      // بريد الموظف اصطناعي بلا سجل MX — استعادة الكلمة عبر البريد بلا معنى له، البديل تغيير الرمز مباشرة
                      <Link href="/change-pin"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors">
                        <span className="text-base shrink-0">🔑</span><span>تغيير رمز الدخول</span>
                      </Link>
                    )}
                  </div>

                  <div className="p-1.5 border-t border-slate-100 bg-slate-50/50">
                    <button className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-rose-600 rounded-lg hover:bg-rose-50 hover:text-rose-700 transition-colors"
                      onClick={handleSignOut}>
                      <span className="text-base shrink-0">🚪</span><span>تسجيل الخروج</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* قائمة التنقل — موبايل/تابلت فقط، بديل روابط التنقل المخفية تحت md */}
        {!breadcrumb && mobileNavOpen && (
          <div ref={mobileNavRef} className="md:hidden border-t border-slate-200 bg-white shadow-lg animate-dropdown-r">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = link.exact ? pathname === link.href : pathname.startsWith(link.href);
                return (
                  <button key={link.href} onClick={() => router.push(link.href)}
                    className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                    }`}>
                    {link.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </header>
      {/* ════ Feedback Modal ════ */}
      {feedbackOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setFeedbackOpen(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-slate-200"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">💡 اقتراح أو ملاحظة</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">ساعدنا في تطوير Vitalix بملاحظاتك</p>
              </div>
              <button onClick={() => setFeedbackOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center transition">✕</button>
            </div>

            {feedbackDone ? (
              <div className="px-5 py-12 text-center space-y-2">
                <p className="text-2xl">🎉</p>
                <p className="text-sm font-bold text-slate-900">شكراً لك!</p>
                <p className="text-xs text-slate-500">تم إرسال ملاحظتك بنجاح</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* نوع الاقتراح */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">نوع الملاحظة</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: 'feature',     l: '✨ ميزة جديدة' },
                      { v: 'improvement', l: '⚡ تحسين موجود' },
                      { v: 'bug',         l: '🐛 مشكلة تقنية' },
                      { v: 'other',       l: '💬 أخرى' },
                    ].map(({ v, l }) => (
                      <button key={v} onClick={() => setFeedbackType(v)}
                        className={`py-2 rounded-xl border text-xs font-bold transition ${
                          feedbackType === v
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* تقييم التجربة */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">تقييمك للتجربة الحالية</label>
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(star => (
                      <button key={star} onClick={() => setFeedbackRating(star)}
                        className={`text-2xl transition hover:scale-110 ${star <= feedbackRating ? 'text-amber-400' : 'text-slate-200'}`}>
                        ★
                      </button>
                    ))}
                    {feedbackRating > 0 && (
                      <button onClick={() => setFeedbackRating(0)} className="text-[10px] text-slate-400 mr-2 hover:text-slate-600 transition">مسح</button>
                    )}
                  </div>
                </div>

                {/* النص */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">اكتب ملاحظتك <span className="text-rose-500">*</span></label>
                  <textarea value={feedbackMsg} onChange={e => setFeedbackMsg(e.target.value)}
                    placeholder="اشرح فكرتك أو المشكلة بأكبر قدر من التفاصيل..."
                    rows={4}
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-900 transition resize-none text-slate-900" />
                </div>

                <button onClick={handleSendFeedback}
                  disabled={feedbackSending || !feedbackMsg.trim()}
                  className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition disabled:opacity-50 active:scale-[0.98]">
                  {feedbackSending ? 'جاري الإرسال...' : 'إرسال الملاحظة'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
