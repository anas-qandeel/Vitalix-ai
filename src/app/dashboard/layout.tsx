'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getPharmacyId, getUserRole } from '@/lib/tenant';

/**
 * طبقة حماية موحّدة تُطبَّق تلقائياً على كل الصفحات ضمن /dashboard/* (بما فيها الصفحات
 * الفرعية مثل /dashboard/vitals). قبل هذا الملف، كان "تعطيل" صيدلية من لوحة الأدمن
 * يُغيّر تسمية فقط في الجدول، دون أي أثر فعلي — الصيدلية الموقوفة كانت تستطيع تسجيل
 * الدخول واستخدام النظام بشكل طبيعي تماماً. هذه الطبقة تُغلق تلك الفجوة مركزياً في
 * مكان واحد، بدل تكرار نفس الفحص داخل كل صفحة على حدة.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
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
        .select('status, must_change_password')
        .eq('id', pid)
        .single();

      // الحسابات الموقوفة أو المؤرشفة تُخرَج فوراً — الأرشفة تحظر الدخول من الأساس عادة،
      // لكن هذا الفحص يغطي أيضاً حالة وجود جلسة محفوظة محلياً من قبل الحظر
      if (pharmacy?.status === 'suspended' || pharmacy?.status === 'archived') {
        await supabase.auth.signOut();
        router.push('/?blocked=suspended');
        return;
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

  return <>{children}</>;
}
