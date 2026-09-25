'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPharmacyId, getUserRole } from '@/lib/tenant';
import { SubscriptionContext } from '@/lib/subscription-state';

/**
 * طبقة حماية موحّدة تُطبَّق تلقائياً على كل الصفحات ضمن /dashboard/* (بما فيها الصفحات
 * الفرعية مثل /dashboard/vitals). قبل هذا الملف، كان "تعطيل" صيدلية من لوحة الأدمن
 * يُغيّر تسمية فقط في الجدول، دون أي أثر فعلي — الصيدلية الموقوفة كانت تستطيع تسجيل
 * الدخول واستخدام النظام بشكل طبيعي تماماً. هذه الطبقة تُغلق تلك الفجوة مركزياً في
 * مكان واحد، بدل تكرار نفس الفحص داخل كل صفحة على حدة.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [subBanner, setSubBanner] = useState<{ status: 'grace' | 'expired'; until: string | null; name: string } | null>(null);
  const [subStatus, setSubStatus] = useState<string>('');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      // معرّف الصيدلية عبر tenant.ts لا session.user.id مباشرة — لموظف مسجّل دخوله بحساب
      // مصادقة مستقل، session.user.id هو هوية الموظف نفسه لا هوية الصيدلية
      const pid = await getPharmacyId();
      if (!pid) { router.push('/'); return; }

      const { data: pharmacy } = await supabase
        .from('pharmacies')
        .select('status, must_change_password, expiry_date, name')
        .eq('id', pid)
        .single();

      // الحسابات الموقوفة أو المؤرشفة تُخرَج فوراً — الأرشفة تحظر الدخول من الأساس عادة،
      // لكن هذا الفحص يغطي أيضاً حالة وجود جلسة محفوظة محلياً من قبل الحظر
      if (pharmacy?.status === 'suspended' || pharmacy?.status === 'archived') {
        await supabase.auth.signOut();
        router.push('/?blocked=suspended');
        return;
      }

      setSubStatus(pharmacy?.status ?? '');
      if (pharmacy?.status === 'grace' || pharmacy?.status === 'expired') {
        setSubBanner({ status: pharmacy.status, until: pharmacy.expiry_date ?? null, name: pharmacy.name ?? '' });
      } else {
        setSubBanner(null);
      }

      // إجبار المالك على تغيير كلمة مروره الأولى قبل أي استخدام للنظام — نظير must_change_pin
      // أدناه الخاص بالموظف. /update-password خارج شجرة /dashboard تماماً (src/app/update-password
      // لا src/app/dashboard/update-password) فلا يمر عبر هذا الـ layout إطلاقاً، ولا خطر حلقة توجيه
      if ((await getUserRole()) === 'owner' && pharmacy?.must_change_password) {
        router.replace('/update-password?forced=1');
        return;
      }

      // صفحة الملف الشخصي (الاشتراك، بيانات الصيدلية، إدارة الموظفين) للمالك وحده
      if (pathname.startsWith('/dashboard/profile')) {
        const role = await getUserRole();
        if (role !== 'owner') { router.push('/dashboard'); return; }
      }

      // إجبار الموظف (لا المالك — لا يملك PIN أصلاً) على تغيير رمزه عند أول دخول أو
      // بعد تصفير المالك له، حتى لا يبقى المالك عارفاً برمز موظفه إلى الأبد
      const role = await getUserRole();
      if (role !== 'owner') {
        const { data: staff, error: staffError } = await supabase
          .from('pharmacy_staff')
          .select('must_change_pin')
          .eq('user_id', session.user.id)
          .single();

        // خطأ الاستعلام لا يحجب الموظف — حجبه بسبب عطل شبكة أسوأ من تأخير تغيير الرمز
        if (!staffError && staff?.must_change_pin) {
          router.replace('/change-pin');
          return;
        }
      }

      setChecking(false);
    };

    checkAccess();
  }, [router, pathname]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-sans" dir="rtl">
        <p className="text-xs font-bold text-slate-500 animate-pulse">جاري التحقق من حالة الحساب...</p>
      </div>
    );
  }

  const waNumber = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/[^0-9]/g, '');
  const waHref = waNumber && subBanner ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`أرغب في تجديد اشتراك ${subBanner.name || 'صيدليتي'} في Vitalix`)}` : null;
  return (
    <>
      {subBanner && (
        <div dir="rtl" className={`w-full px-4 py-2.5 text-xs font-bold flex flex-wrap items-center justify-center gap-x-4 gap-y-1 ${subBanner.status === 'expired' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-900'}`} role="status">
          <span>
            {subBanner.status === 'expired'
              ? 'انتهى اشتراك الصيدلية — الحساب للقراءة فقط حتى التجديد. بياناتك محفوظة بالكامل.'
              : `انتهى اشتراك الصيدلية${subBanner.until ? ` بتاريخ ${subBanner.until}` : ''} — مهلة قصيرة قبل التحويل إلى القراءة فقط. جدّد للمتابعة.`}
          </span>
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-80">
              تواصل للتجديد
            </a>
          )}
        </div>
      )}
      <SubscriptionContext.Provider value={{ status: subStatus, readOnly: subStatus === 'expired' }}>
        {children}
      </SubscriptionContext.Provider>
    </>
  );
}
