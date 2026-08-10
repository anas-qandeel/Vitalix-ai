'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

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

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      const { data: pharmacy } = await supabase
        .from('pharmacies')
        .select('status')
        .eq('id', session.user.id)
        .single();

      // الحسابات الموقوفة أو المؤرشفة تُخرَج فوراً — الأرشفة تحظر الدخول من الأساس عادة،
      // لكن هذا الفحص يغطي أيضاً حالة وجود جلسة محفوظة محلياً من قبل الحظر
      if (pharmacy?.status === 'suspended' || pharmacy?.status === 'archived') {
        await supabase.auth.signOut();
        router.push('/?blocked=suspended');
        return;
      }

      setChecking(false);
    };

    checkAccess();
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center font-sans" dir="rtl">
        <p className="text-xs font-bold text-slate-500 animate-pulse">جاري التحقق من حالة الحساب...</p>
      </div>
    );
  }

  return <>{children}</>;
}
