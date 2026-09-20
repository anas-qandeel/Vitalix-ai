import type { Metadata } from 'next';
import Link from 'next/link';
import AppFooter from '@/app/components/AppFooter';

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

export const metadata: Metadata = {
  title: 'سياسة الخصوصية — Vitalix-ai',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased" dir="rtl">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-16">
        <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
          ← الرئيسية
        </Link>

        <div className="mt-6 bg-white border border-slate-200/80 rounded-[22px] shadow-[0_20px_50px_rgba(15,23,42,0.04)] p-8 sm:p-10 space-y-8">
          <div className="flex items-center gap-3">
            <VitalixMark />
            <div>
              <h1 className="text-2xl font-black text-slate-900">سياسة الخصوصية</h1>
              <p className="text-xs text-slate-400 mt-1">Vitalix-ai</p>
            </div>
          </div>

          <Section title="من نحن">
            <p>
              Vitalix-ai منصة تقنية تُقدَّم للصيدليات المستقلة في الأردن لمساعدتها على متابعة مرضى الأمراض
              المزمنة، تسجيل الفحوصات، وإدارة كتالوج المنتجات الداعمة.
            </p>
            <p className="mt-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-slate-700">
              الصيدلية التي تستخدم Vitalix-ai هي الجهة التي تتعامل مباشرة مع المريض وتُدخل بياناته في النظام
              بموافقته. Vitalix-ai لا تتواصل مع المريض مباشرة ولا تجمع بياناته بنفسها — هي أداة تقنية تُشغِّلها
              الصيدلية. مسؤولية الحصول على موافقة المريض تقع على الصيدلية، بصفتها الجهة التي تملك علاقة الرعاية معه.
            </p>
          </Section>

          <Section title="ما هي البيانات التي نجمعها">
            <p className="font-bold text-slate-800 mb-1">عن الصيدلية وموظفيها</p>
            <p>اسم الصيدلية، اسم الصيدلاني المسؤول، رقم الهاتف، العنوان، بيانات الاشتراك والدفع، وأسماء الموظفين المسجَّلين في النظام.</p>
            <p className="font-bold text-slate-800 mt-4 mb-1">عن المريض (تُدخلها الصيدلية)</p>
            <p>الاسم، رقم الهاتف، الجنس، تاريخ الميلاد، الطول، التشخيصات المزمنة، حساسية الأدوية والأطعمة، حالة الحمل أو الرضاعة، الأدوية المزمنة وجرعاتها ومواعيد تجديدها، وقراءات الفحوصات.</p>
            <p className="mt-3 text-slate-500">نحن لا نجمع هذه البيانات مباشرة من المريض؛ الصيدلاني هو من يُدخلها بعد حصوله على موافقة المريض.</p>
          </Section>

          <Section title="كيف نستخدم البيانات">
            <ul className="list-disc list-inside space-y-1.5">
              <li>لتمكين الصيدلاني من متابعة مرضاه وتقديم الرعاية الصيدلانية لهم.</li>
              <li>لتشغيل خصائص المتابعة والتنبيه الخاصة بالصيدلية.</li>
              <li>لإعداد مخرجات مساندة يراجعها الصيدلاني ويعتمدها قبل مشاركتها.</li>
              <li>لمشاركة هذه المخرجات مع المريض عبر روابط يرسلها الصيدلاني بنفسه.</li>
            </ul>
            <p className="mt-3 font-bold text-slate-800">
              نحن لا نستخدم بيانات المريض للتسويق، ولا نبيعها، ولا نشاركها مع أي جهة خارج ما هو مذكور في هذه السياسة.
            </p>
          </Section>

          <Section title="المعالجة الذكية">
            <p>
              تعتمد Vitalix-ai منظومة معالجة متعددة الطبقات طوّرها فريق صيدلاني. تمرّ البيانات أولاً عبر محرّك قواعد
              حتمي يصنّفها وفق معايير محدّدة مسبقاً، ثم تُصاغ المخرجات بواسطة نموذج لغوي يعمل حصراً ضمن الضوابط
              والقيود التي تفرضها المنظومة، تليها طبقة صياغة ومراجعة ثانية.
            </p>
            <p className="mt-3 font-bold text-slate-800">
              لا يعمل النموذج اللغوي منفرداً ولا يتخذ أي قرار، ولا يُعتمد أي مُخرَج إلا بعد مراجعة الصيدلاني وتوقيعه.
              المنصة لا تشخّص ولا تصف علاجاً.
            </p>
          </Section>

          <Section title="مشاركة البيانات مع أطراف أخرى">
            <p className="mb-3">لتشغيل المنصة، نعتمد على خدمات تقنية من أطراف ثالثة:</p>
            <ul className="space-y-3">
              <li><span className="font-bold text-slate-800">Supabase</span> (استضافة قاعدة البيانات) — خوادم في أيرلندا، الاتحاد الأوروبي، الخاضعة لمعايير GDPR.</li>
              <li><span className="font-bold text-slate-800">Vercel</span> (تشغيل المنصة) — خوادم في الولايات المتحدة؛ قد تمرّ بيانات المريض لحظياً عبرها أثناء الاستخدام دون تخزين دائم هناك.</li>
              <li><span className="font-bold text-slate-800">Google Gemini</span> (نموذج لغوي) — يُستخدم كمكوّن صياغة ضمن منظومة المعالجة الموضّحة أعلاه؛ تُرسَل إليه البيانات ذات الصلة عبر اتصال مشفّر، فقط عند طلب الصيدلاني ذلك صراحة.</li>
              <li><span className="font-bold text-slate-800">واتساب</span> — الرسائل تُرسَل من جهاز الصيدلاني مباشرة عبر رابط واتساب، لا من خوادمنا.</li>
            </ul>
          </Section>

          <Section title="أمان البيانات">
            <p>كل صيدلية تصل فقط إلى بيانات مرضاها؛ لا تستطيع أي صيدلية رؤية بيانات صيدلية أخرى. الوصول محمي بكلمة مرور ورمز دخول للموظف، ويُسجَّل من قام بأي إضافة أو تعديل أو حذف في سجل نشاط داخلي.</p>
          </Section>

          <Section title="حذف البيانات">
            <p>
              لا تتوفر حالياً أداة في الواجهة لحذف بيانات مريض ذاتياً. للتواصل بخصوص حذف بياناتك، راسلنا على{' '}
              <a href="mailto:info@vitalix-ai.com" className="font-bold text-teal-700 hover:underline">info@vitalix-ai.com</a>
              {' '}وسنُنفّذ الطلب خلال مدة معقولة، ما لم يمنع ذلك التزام قانوني آخر.
            </p>
          </Section>

          <Section title="التواصل معنا">
            <p>
              لأي استفسار بخصوص هذه السياسة أو بياناتك:{' '}
              <a href="mailto:info@vitalix-ai.com" className="font-bold text-teal-700 hover:underline">info@vitalix-ai.com</a>
            </p>
          </Section>

          <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">آخر تحديث: سبتمبر 2026</p>
        </div>

        <AppFooter className="mt-10" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-black text-slate-900 mb-2">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}
