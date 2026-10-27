'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Toast, { useNotice } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { getPharmacyId, getStaffName, getUserRole } from '@/lib/tenant';
import { useOverdueRequests } from '@/lib/use-overdue-requests';
import { Lightbulb, PlusCircle, Lightning, Bug, ChatCircleDots, CheckCircle, X } from '@phosphor-icons/react';
import { usePharmacyInfo } from './DashboardHeader';

// المنطق هنا منسوخ حرفياً من DashboardHeader.tsx (الهيدر نفسه لا يُمَس): الروابط، الشروط بحسب الدور،
// الخروج، كلمة المرور، الملاحظات. النصوص نصوص الهيدر الحالي لا نصوص لوحات التصميم.

function pluralizeDays(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}

// عدد الطلبات المتأخرة بصياغة عربية سليمة لقارئ الشاشة
function overdueAria(n: number): string {
  if (n === 1) return 'طلب متأخر واحد';
  if (n === 2) return 'طلبان متأخران';
  if (n <= 10) return `${n} طلبات متأخرة`;
  return `${n} طلباً متأخراً`;
}

const NAV_LINKS = [
  { label: 'الرئيسية', href: '/dashboard', exact: true },
  { label: 'الفحوصات', href: '/dashboard/vitals', exact: false },
  { label: 'المزمنون', href: '/dashboard/chronic', exact: false },
  { label: 'طلبات المرضى', href: '/dashboard/requests', exact: false },
  { label: 'سجل الوصفات', href: '/dashboard/prescriptions', exact: false },
  { label: 'المرضى', href: '/dashboard/patients', exact: false },
];

function Ico({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  '/dashboard': <Ico><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></Ico>,
  '/dashboard/vitals': <Ico><path d="M3 12h4l2.2-6 4.6 12 2.4-6H21" /></Ico>,
  '/dashboard/chronic': <Ico><path d="M9.5 3h5" /><path d="M10.5 3v6.2L5.2 18.2A2 2 0 0 0 6.9 21h10.2a2 2 0 0 0 1.7-2.8L13.5 9.2V3" /><path d="M8 15h8" /></Ico>,
  '/dashboard/requests': <Ico><rect x="5" y="4.5" width="14" height="16.5" rx="2.5" /><path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" /><path d="M9 11h6M9 15h6" /></Ico>,
  '/dashboard/prescriptions': <Ico><path d="M7 3h7l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19.5V4.5A1.5 1.5 0 0 1 7 3z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 16.5h3" /></Ico>,
  '/dashboard/patients': <Ico><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.4A6.5 6.5 0 0 1 21.5 20" /></Ico>,
  catalog: <Ico><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></Ico>,
  activity: <Ico><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.8" /></Ico>,
  help: <Ico><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" /></Ico>,
  news: <Ico><path d="M5.5 21V4" /><path d="M5.5 5h11.5l-2.2 4 2.2 4H5.5" /></Ico>,
  idea: <Ico><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2h5.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" /></Ico>,
  user: <Ico><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></Ico>,
  lock: <Ico><rect x="5" y="11" width="14" height="9.5" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Ico>,
  out: <Ico><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10" /><path d="m15.5 8 4 4-4 4M19.5 12H9.5" /></Ico>,
};

const LOGO_TILE = (
  <svg className="vd-tile" viewBox="0 0 192 192" aria-hidden="true" focusable="false">
    <rect width="192" height="192" rx="44" fill="#0F172A" />
    <path d="M37.4 51.2L90.7 156.5L120 102.8" fill="none" stroke="#fff" strokeWidth={20.6} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M144 41Q149.2 66.8 175 72Q149.2 77.2 144 103Q138.8 77.2 113 72Q138.8 66.8 144 41Z" fill="#0D9488" />
  </svg>
);

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
  drawerOpen: boolean;
  onCloseDrawer: (restoreFocus: boolean) => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}

export function DashboardSidebar({ expanded, onToggle, drawerOpen, onCloseDrawer, closeRef }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { pharmacyName, pharmacistName, pharmacyStatus, daysLeft, loading } = usePharmacyInfo();
  const { count: overdueCount } = useOverdueRequests();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { notice, setNotice } = useNotice();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('feature');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  const [staffName, setStaffName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accBtnRef = useRef<HTMLButtonElement>(null);

  // هوية المستخدم الحالي فعلياً (من سجّل دخوله) — لا من مبدّل محلي
  useEffect(() => {
    const load = async () => {
      const [name, role] = await Promise.all([getStaffName(), getUserRole()]);
      setStaffName(name);
      setUserRole(role);
    };
    load();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    // Escape يغلق قائمة الحساب أولاً ثم الدرج
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dropdownOpen) { setDropdownOpen(false); accBtnRef.current?.focus(); }
      else if (drawerOpen) onCloseDrawer(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen, drawerOpen, onCloseDrawer]);

  const handleSendFeedback = async () => {
    if (!feedbackMsg.trim()) return;
    setFeedbackError('');
    setFeedbackSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setFeedbackError('تعذّر إرسال الملاحظة — تحقق من الاتصال وحاول مرة أخرى'); return; }
      const pid2 = await getPharmacyId();
      if (!pid2) { setFeedbackError('تعذّر إرسال الملاحظة — تحقق من الاتصال وحاول مرة أخرى'); return; }
      const { data: phData } = await supabase
        .from('pharmacies').select('name, pharmacy_name').eq('id', pid2).single();
      const pharmacyName = phData?.name || phData?.pharmacy_name || '';
      const { error: insertError } = await supabase.from('feedback').insert({
        pharmacy_id: pid2,
        pharmacy_name: pharmacyName,
        pharmacist_name: (await getStaffName()) || null,
        type: feedbackType,
        message: feedbackMsg.trim(),
        rating: feedbackRating || null,
      });
      if (insertError) {
        console.error('[feedback] insert failed', insertError.message);
        setFeedbackError('تعذّر إرسال الملاحظة — تحقق من الاتصال وحاول مرة أخرى');
        return;
      }
      setFeedbackDone(true);
      setTimeout(() => {
        setFeedbackOpen(false);
        setFeedbackMsg(''); setFeedbackType('feature'); setFeedbackRating(0); setFeedbackDone(false);
      }, 2000);
    } catch (e) {
      console.error('[feedback] send failed', e);
      setFeedbackError('تعذّر إرسال الملاحظة — تحقق من الاتصال وحاول مرة أخرى');
    }
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
  const isExpiringSoon = daysLeft <= 14;
  const isOwner = userRole === 'owner';

  const isActive = (href: string, exact = false) => (exact ? pathname === href : pathname.startsWith(href));
  const go = (href: string) => { router.push(href); onCloseDrawer(false); };

  const navItem = (label: string, href: string, icon: ReactNode, exact = false) => (
    <button key={href} type="button" className="vd-ni" data-tip={label} aria-current={isActive(href, exact) ? 'page' : undefined}
      onClick={() => go(href)}>
      {icon}<span className="vd-lbl">{label}</span>
      {href === '/dashboard/requests' && overdueCount > 0 && (
        <span className="vd-bdg" aria-label={overdueAria(overdueCount)}>{overdueCount}</span>
      )}
    </button>
  );

  const toggleLabel = expanded ? 'طي القائمة الجانبية' : 'توسيع القائمة الجانبية';

  return (
    <>
      <aside id="vd-side" className="vd-side" aria-label="القائمة الرئيسية">
        <div className="vd-sh">
          <Link href="/dashboard" className="vd-brand" aria-label="Vitalix-ai" onClick={() => onCloseDrawer(false)}>
            {LOGO_TILE}
            <span className="vd-lock"><span className="vd-word">Vitalix<b>-ai</b></span><span className="vd-tag">تابع مرضاك بذكاء</span></span>
          </Link>
          <button ref={closeRef} type="button" className="vd-x" aria-label="إغلاق القائمة" onClick={() => onCloseDrawer(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <button type="button" className="vd-tg" aria-label={toggleLabel} title={toggleLabel} aria-expanded={expanded} onClick={onToggle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9.5 6 6 6-6 6" /></svg>
          </button>
        </div>

        <div className="vd-ph" data-tip={loading ? undefined : pharmacyName}>
          <span className="vd-phi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M9.4 4h5.2v5.4H20v5.2h-5.4V20H9.4v-5.4H4V9.4h5.4z" /></svg>
          </span>
          <span className="vd-pht"><span className="vd-phn">{loading ? <span className="vd-skel" /> : pharmacyName}</span></span>
          {/* كنقطة الهيدر: خضراء للحالة active، وعنبرية نابضة لغيرها */}
          <i className={`vd-live${pharmacyStatus === 'active' ? '' : ' is-warn'}`} aria-hidden="true" />
        </div>

        <nav className="vd-nav" aria-label="التنقل الرئيسي">
          {NAV_LINKS.map(l => navItem(l.label, l.href, ICONS[l.href], l.exact))}
          <div className="vd-sep" />
          {navItem('الكتالوج والمنتجات', '/dashboard/pharmacy-catalog-manager', ICONS.catalog)}
          {isOwner && navItem('سجل النشاط', '/dashboard/activity', ICONS.activity)}
          <div className="vd-sep is-end" />
          {navItem('دليل الاستخدام', '/help', ICONS.help)}
          {navItem('ما الجديد', '/whats-new', ICONS.news)}
          <button type="button" className="vd-ni is-sug" data-tip="اقتراح أو ملاحظة"
            onClick={() => { setFeedbackOpen(true); onCloseDrawer(false); }}>
            {ICONS.idea}<span className="vd-lbl">اقتراح أو ملاحظة</span>
          </button>
        </nav>

        <div ref={dropdownRef} className="vd-acc" data-open={dropdownOpen}>
          <button ref={accBtnRef} type="button" className="vd-accb" aria-haspopup="menu" aria-expanded={dropdownOpen} aria-label="قائمة الحساب"
            onClick={() => setDropdownOpen(v => !v)}>
            <span className="vd-ava">{ICONS.user}</span>
            <span className="vd-acct"><div className="vd-an">{displayName}</div><div className="vd-as">{loading ? <span className="vd-skel" /> : pharmacyName}</div></span>
            <svg className="vd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m6 14.5 6-6 6 6" /></svg>
          </button>
          {dropdownOpen && (
            <div className="vd-pop" role="menu">
              <div className="vd-mh">
                <span className="vd-ava">{ICONS.user}</span>
                <div><div className="vd-mn">{displayName}</div><div className="vd-ms">{loading ? <span className="vd-skel" /> : pharmacyName}</div></div>
              </div>
              {isOwner && (
                <div className={`vd-sub${isExpiringSoon ? ' is-warn' : ''}`}>
                  <i />اشتراك {pharmacyStatus === 'active' ? 'نشط' : 'تجريبي'} ({pluralizeDays(daysLeft)})
                </div>
              )}
              {isOwner && isExpiringSoon && (
                <p className="vd-subnote">تنبيه: ينتهي اشتراكك خلال {pluralizeDays(daysLeft)}</p>
              )}
              <div className="vd-sep" />
              {isOwner && (
                <button type="button" className="vd-mi" role="menuitem"
                  onClick={() => { setDropdownOpen(false); router.push('/dashboard/profile'); onCloseDrawer(false); }}>
                  {ICONS.user}الملف الشخصي
                </button>
              )}
              {isOwner ? (
                <button type="button" className="vd-mi" role="menuitem"
                  onClick={() => {
                    setDropdownOpen(false);
                    onCloseDrawer(false);
                    supabase.auth.getUser().then(({ data }) => {
                      if (data.user?.email) {
                        supabase.auth.resetPasswordForEmail(data.user.email, {
                          redirectTo: `${window.location.origin}/auth/confirm`,
                        }).then(({ error }) => {
                          if (error) {
                            const rateLimited = error.status === 429 || /security purposes|rate limit/i.test(error.message);
                            setNotice({ kind: 'err', text: rateLimited
                              ? 'أُرسل رابط قبل قليل — تحقق من بريدك (ومجلد الرسائل غير المرغوبة)، أو انتظر دقيقة ثم أعد المحاولة'
                              : `تعذر إرسال الرابط: ${error.message}` });
                            return;
                          }
                          setNotice({ kind: 'ok', text: 'تم إرسال رابط تغيير كلمة المرور إلى بريدك الإلكتروني' });
                        });
                      }
                    });
                  }}>
                  {ICONS.lock}تغيير كلمة المرور
                </button>
              ) : (
                // بريد الموظف اصطناعي بلا سجل MX — استعادة الكلمة عبر البريد بلا معنى له، البديل تغيير الرمز مباشرة
                <Link href="/change-pin" className="vd-mi" role="menuitem"
                  onClick={() => { setDropdownOpen(false); onCloseDrawer(false); }}>
                  {ICONS.lock}تغيير رمز الدخول
                </Link>
              )}
              <div className="vd-sep" />
              <button type="button" className="vd-mi is-out" role="menuitem" onClick={handleSignOut}>
                {ICONS.out}تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </aside>

      <Toast notice={notice} />

      {/* ════ Feedback Modal ════ */}
      {feedbackOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => { setFeedbackOpen(false); setFeedbackError(''); }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5"><Lightbulb size={16} weight="bold" className="text-amber-500 shrink-0" aria-hidden="true" />اقتراح أو ملاحظة</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">ساعدنا في تطوير Vitalix بملاحظاتك</p>
              </div>
              <button onClick={() => { setFeedbackOpen(false); setFeedbackError(''); }} aria-label="إغلاق"
                className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 flex items-center justify-center transition"><X size={14} weight="bold" aria-hidden="true" /></button>
            </div>

            {feedbackDone ? (
              <div className="px-5 py-12 text-center space-y-2">
                <div className="flex justify-center"><CheckCircle size={40} weight="fill" className="text-teal-600" aria-hidden="true" /></div>
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
                      { v: 'feature',     l: 'ميزة جديدة',  Icon: PlusCircle },
                      { v: 'improvement', l: 'تحسين موجود', Icon: Lightning },
                      { v: 'bug',         l: 'مشكلة تقنية', Icon: Bug },
                      { v: 'other',       l: 'أخرى',        Icon: ChatCircleDots },
                    ].map(({ v, l, Icon }) => (
                      <button key={v} onClick={() => setFeedbackType(v)}
                        className={`py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          feedbackType === v
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}>
                        <Icon size={14} weight="bold" className="shrink-0" aria-hidden="true" />
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

                {feedbackError && (
                  <p className="text-xs font-semibold text-rose-600 mb-2" role="alert">{feedbackError}</p>
                )}

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

export function DashboardTopBar({ onOpen, burgerRef, drawerOpen }: {
  onOpen: () => void;
  burgerRef: RefObject<HTMLButtonElement | null>;
  drawerOpen: boolean;
}) {
  return (
    <header className="vd-mtop">
      <Link href="/dashboard" className="vd-brand" aria-label="Vitalix-ai">
        {LOGO_TILE}
        <span className="vd-lock"><span className="vd-word">Vitalix<b>-ai</b></span></span>
      </Link>
      <button ref={burgerRef} type="button" className="vd-bgb" aria-label="فتح القائمة" aria-expanded={drawerOpen} aria-controls="vd-side" onClick={onOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
    </header>
  );
}
