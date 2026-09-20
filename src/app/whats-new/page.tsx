'use client';

import Link from 'next/link';
import AppFooter from '@/app/components/AppFooter';
import type { Icon } from '@phosphor-icons/react';
import { Palette, Pill, Package, Users, DeviceMobile, ShieldCheck } from '@phosphor-icons/react';

// نفس شعار Vitalix المستخدم في src/app/help/page.tsx — لا يُعاد رسمه من الصفر
function VitalixMark() {
  return (
    <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
      <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#0D9488" />
      </svg>
    </div>
  );
}

interface ReleaseSection {
  heading: string;
  icon: Icon;
  items: string[];
}

interface Release {
  version: string;
  date: string;
  title: string;
  sections: ReleaseSection[];
}

// الإصدارات كبيانات فقط والصفحة ترسمها — الأحدث أولاً، ولإضافة إصدار جديد يكفي إضافة عنصر واحد في أعلى المصفوفة
const RELEASES: Release[] = [
  {
    version: 'v1.0.0',
    date: 'سبتمبر 2026',
    title: 'الإطلاق الأول',
    sections: [
      {
        heading: 'تجربة استخدام أوضح',
        icon: Palette,
        items: [
          'أزرار موحّدة الشكل واللون في كل الشاشات.',
          'أيقونات مرسومة نظيفة بدل الرموز التعبيرية.',
          'رسائل التنبيه والتأكيد تظهر داخل المنصة بدل نوافذ المتصفح.',
          'خط عربي موحّد وأوضح للقراءة.',
          'مراحل واضحة أثناء تجهيز الملخّص الذكي وخطة الوزن.',
        ],
      },
      {
        heading: 'المزمنون',
        icon: Pill,
        items: [
          'حساب أدق لموعد نفاد الدواء مع احتساب الحبات المتبقية من العلبة السابقة.',
          'عدّاد "بدون رد" أصبح أدق ولا يتأثر بتعديل الملاحظات.',
          'تنبيه عند تحديد دواء ما زال كافياً قبل تجديده.',
          'مخزون "جهّز مخزونك" محفوظ في حساب الصيدلية ويظهر على كل أجهزتك.',
        ],
      },
      {
        heading: 'الكتالوج',
        icon: Package,
        items: [
          'حماية تمنع إضافة الأدوية إلى الكتالوج؛ الكتالوج مخصّص للمنتجات غير الدوائية.',
          'تغييرات المنتجات تُسجَّل في سجل النشاط.',
        ],
      },
      {
        heading: 'فريق العمل',
        icon: Users,
        items: [
          'رموز دخول الموظفين أصبحت أكثر أماناً.',
          'تصفير رمز الموظف من شاشة فريق العمل، ويُطلب منه اختيار رمز جديد عند أول دخول.',
          'رسائل الخطأ تظهر بوضوح أينما كنت في الصفحة.',
        ],
      },
      {
        heading: 'المنصة على هاتفك',
        icon: DeviceMobile,
        items: [
          'يمكن تثبيت Vitalix-ai على الشاشة الرئيسية لهاتفك وفتحها كتطبيق.',
        ],
      },
      {
        heading: 'المساعدة والخصوصية',
        icon: ShieldCheck,
        items: [
          'دليل استخدام تفاعلي مع بحث فوري.',
          'صفحة سياسة الخصوصية.',
        ],
      },
    ],
  },
];

export default function WhatsNewPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased" dir="rtl">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
            ← لوحة التحكم
          </Link>
          <VitalixMark />
        </div>

        <div className="mt-6">
          <h1 className="text-2xl font-black text-slate-900">ما الجديد</h1>
          <p className="text-xs text-slate-400 mt-1">آخر التحديثات والتحسينات في Vitalix-ai</p>
        </div>

        <div className="mt-6 space-y-4">
          {RELEASES.map(release => (
            <article
              key={release.version}
              className="bg-white border border-slate-200/80 rounded-[22px] shadow-[0_20px_50px_rgba(15,23,42,0.04)] p-6 sm:p-8"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span dir="ltr" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black border bg-teal-50 text-teal-700 border-teal-200 tabular-nums">
                  {release.version}
                </span>
                <span className="text-xs text-slate-400 font-medium">{release.date}</span>
              </div>
              <h2 className="text-lg font-black text-slate-900 mt-3">{release.title}</h2>

              <div className="mt-5 space-y-6">
                {release.sections.map(section => {
                  const SectionIcon = section.icon;
                  return (
                    <section key={section.heading}>
                      <h3 className="flex items-center gap-2.5 text-sm font-black text-slate-800">
                        <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                          <SectionIcon size={16} weight="bold" className="text-slate-700" aria-hidden="true" />
                        </span>
                        {section.heading}
                      </h3>
                      <ul className="list-disc list-inside space-y-1.5 mt-3 text-sm text-slate-600 leading-relaxed">
                        {section.items.map(item => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
        </div>

        <AppFooter className="mt-10" />
      </div>
    </div>
  );
}
