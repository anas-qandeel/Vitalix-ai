import type { Metadata } from 'next';
import Link from 'next/link';
import AppFooter from '@/app/components/AppFooter';
import { waLink, PHONE_DISPLAY, SALES_EMAIL } from '@/lib/contact';
import {
  Notebook, Prescription, ArrowsClockwise, Heartbeat, Scales, ShieldWarning, ClockCounterClockwise,
  CalendarX, Hourglass, Files, EyeSlash, Browser, LockKey, Translate, Database, UsersThree, Eye, Stethoscope,
  Phone, EnvelopeSimple, WhatsappLogo, CaretDown, Gift, ArrowDown,
} from '@phosphor-icons/react/ssr';
import Reveal from './Reveal';
import { VitalixMark, WaButton, SectionHead, HeroCards, RequestsMock, PrescriptionsMock } from './parts';

export const metadata: Metadata = {
  title: 'Vitalix-ai | نظام إدارة الصيدلية بالذكاء الاصطناعي',
  description: 'Vitalix-ai نظام لإدارة الصيدلية بدعم الذكاء الاصطناعي: متابعة المرضى المزمنين وقياساتهم وطلباتهم ووصفاتهم في مكان واحد. صُمّم في عمّان لصيدليات الأردن المستقلة.',
  openGraph: {
    title: 'Vitalix-ai | نظام إدارة الصيدلية بالذكاء الاصطناعي',
    description: 'متابعة المرضى المزمنين وقياساتهم وطلباتهم ووصفاتهم في مكان واحد، لصيدليات الأردن المستقلة.',
    type: 'website',
    locale: 'ar',
    siteName: 'Vitalix-ai',
  },
};

const PROBLEMS = [
  { icon: CalendarX, text: 'مريض مزمن ينسى موعد تجديد دوائه ولا أحد يذكّره' },
  { icon: Hourglass, text: 'طلب دواء لمريض ينتظر المستودع ولا أحد يتابعه' },
  { icon: Files, text: 'وصفات متناثرة وأنت تنتظر زيارة لجنة التفتيش' },
  { icon: EyeSlash, text: 'أحداث تجري في الصيدلية ولا تعرف من فعلها ومتى' },
];

const FEATURES = [
  { icon: Notebook, title: 'طلبات المرضى', isNew: true, span: 'lg:col-span-3', text: 'سجّل طلب الدواء غير المتوفر، وينبّهك النظام عند تأخره بحسب دوام المستودعات وعطلة الجمعة، مع رسالة واتساب جاهزة للمريض بضغطة واحدة.' },
  { icon: Prescription, title: 'سجل الوصفات الطبية', isNew: true, span: 'lg:col-span-3', text: 'توثيق يومي لكل وصفة مع صورتها، وربط اختياري بملف المريض، وتصدير PDF مرتب بالأيام جاهز لزيارة لجنة التفتيش.' },
  { icon: ArrowsClockwise, title: 'متابعة المرضى المزمنين', span: 'lg:col-span-2', text: 'تعرف من اقترب موعد تجديد دوائه، ورسالة تذكير جاهزة تفتح واتساب بضغطة واحدة.' },
  { icon: Heartbeat, title: 'قياسات المريض وتحليل بالذكاء الاصطناعي', span: 'lg:col-span-2', text: 'ضغط وسكر ووزن ونبض، وتقرير تحليل وإرشاد بالذكاء الاصطناعي يصل المريض برابط يفتحه دون تسجيل.' },
  { icon: Scales, title: 'خطة إدارة الوزن', span: 'lg:col-span-2', text: 'أهداف ومؤشر كتلة الجسم وخطة متابعة يستلمها المريض برابط خاص عندما ترى الصيدلانية أنها مناسبة له.' },
  { icon: ShieldWarning, title: 'سلامة الدواء', span: 'lg:col-span-3', text: 'تحذيرات تداخل بين الأدوية وبين الدواء والغذاء، وفحص للحساسية.' },
  { icon: ClockCounterClockwise, title: 'سجل نشاط لمالك الصيدلية', span: 'lg:col-span-3', text: 'من فعل ماذا ومتى، ويراه المالك وحده.' },
];

const STEPS = [
  'سجّل صيدليتك وابدأ التجربة.',
  'أضف مرضاك، وسجّل زياراتهم وطلباتهم ووصفاتهم.',
  'أرسل للمريض رابط نتائجه برسالة واتساب جاهزة.',
];

const SECURITY = [
  { icon: Database, text: 'بيانات كل صيدلية معزولة عن غيرها على مستوى قاعدة البيانات' },
  { icon: UsersThree, text: 'أدوار مختلفة: مالك وصيدلاني ومساعد وكادر، لكل منها صلاحياته' },
  { icon: Eye, text: 'سجل النشاط للمالك فقط' },
  { icon: Stethoscope, text: 'التقارير للتوعية والمتابعة وليست تشخيصاً طبياً' },
];

const FAQ = [
  { q: 'هل أحتاج لتثبيت برنامج؟', a: 'لا، يعمل من المتصفح على الجوال والحاسوب، ويمكن تثبيته كتطبيق على الشاشة الرئيسية.' },
  { q: 'هل يرسل واتساب تلقائياً؟', a: 'لا. يجهّز لك الرسالة كاملة وتضغط إرسال بنفسك، فتبقى المحادثة من رقم صيدليتك.' },
  { q: 'هل يشخّص المرض؟', a: 'لا. التقارير تحليل وإرشاد للتوعية والمتابعة ولا تغني عن الطبيب أو الصيدلاني.' },
  { q: 'هل بيانات صيدليتي ظاهرة لغيرها؟', a: 'لا، كل صيدلية معزولة عن غيرها.' },
  { q: 'هل يناسب صيدلية صغيرة مستقلة؟', a: 'نعم، هذا هو الهدف الذي صُمّم له.' },
  { q: 'كم الكلفة؟', a: 'تفاصيل الأسعار وعرض الإطلاق نشرحها لك عبر واتساب.' },
];

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  // المصدر يدخل نص رسالة واتساب، فنقبل صيغة قصيرة آمنة فقط ونتجاهل أي قيمة أخرى
  const raw = Array.isArray(sp.src) ? sp.src[0] : sp.src;
  const src = raw && /^[a-z0-9_-]{1,20}$/i.test(raw) ? raw : 'web';
  const wa = (pos: string, topic?: string) => waLink(`${src}-${pos}`, topic);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased pb-24 md:pb-0 overflow-x-clip" dir="rtl">
      <style>{`@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }`}</style>

      {/* ── 1) الواجهة ── */}
      <header className="relative bg-slate-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-900/70" aria-hidden="true" />
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-teal-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-5 pt-6 pb-14 sm:pb-20">
          <div className="flex items-center gap-3">
            <VitalixMark dark />
            <span className="text-lg font-black tracking-tight" dir="ltr">Vitalix<span className="text-teal-400">-ai</span></span>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center mt-12 sm:mt-16">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.25]">
                صيدليتك تعرف مرضاها... <span className="text-teal-400">وتتابعهم بذكاء</span>
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-relaxed text-slate-300 max-w-xl">
                Vitalix-ai نظام لإدارة الصيدلية بدعم الذكاء الاصطناعي: متابعة المرضى المزمنين وقياساتهم وطلباتهم ووصفاتهم في مكان واحد. صُمّم في عمّان لصيدليات الأردن المستقلة.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <WaButton href={wa('hero')} label="اسأل عبر واتساب" className="w-full sm:w-auto" />
                <a href="#features" className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold cursor-pointer bg-white/10 hover:bg-white/15 border border-white/20 transition-all active:scale-[0.98] w-full sm:w-auto">
                  اكتشف المزايا <ArrowDown size={18} weight="bold" aria-hidden="true" />
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-2.5">
                {[
                  { icon: Browser, t: 'يعمل من المتصفح بلا تثبيت' },
                  { icon: LockKey, t: 'بيانات كل صيدلية معزولة' },
                  { icon: Translate, t: 'بالعربية بالكامل' },
                ].map(({ icon: Icon, t }) => (
                  <li key={t} className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-200 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5">
                    <Icon size={16} weight="bold" className="text-teal-400" aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <HeroCards />
          </div>
        </div>
      </header>

      <main>
        {/* ── 2) المشكلة ── */}
        <section className="bg-white py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5">
            <SectionHead title="ما الذي يضيع في صيدليتك كل يوم؟" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PROBLEMS.map(({ icon: Icon, text }, i) => (
                <Reveal key={text} delay={i * 80}>
                  <div className="h-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                    <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-4">
                      <Icon size={24} weight="duotone" className="text-rose-600" aria-hidden="true" />
                    </div>
                    <p className="font-bold text-slate-800 leading-relaxed">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3) المزايا ── */}
        <section id="features" className="scroll-mt-4 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5">
            <SectionHead eyebrow="المزايا" title="ما يقدمه Vitalix-ai" />
            <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-4">
              {FEATURES.map(({ icon: Icon, title, text, isNew, span }, i) => (
                <Reveal key={title} delay={(i % 3) * 80} className={span}>
                  <div className={`h-full bg-white border rounded-2xl shadow-sm hover:shadow-md transition-shadow ${isNew ? 'border-teal-200 p-7 sm:p-8 ring-1 ring-teal-100' : 'border-slate-200 p-6'}`}>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className={`rounded-xl flex items-center justify-center ${isNew ? 'w-14 h-14 bg-teal-600' : 'w-11 h-11 bg-teal-50 border border-teal-100'}`}>
                        <Icon size={isNew ? 30 : 24} weight={isNew ? 'bold' : 'duotone'} className={isNew ? 'text-white' : 'text-teal-700'} aria-hidden="true" />
                      </div>
                      {isNew && <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1">جديد</span>}
                    </div>
                    <h3 className={`font-black text-slate-900 ${isNew ? 'text-xl' : 'text-lg'}`}>{title}</h3>
                    <p className="mt-2 text-slate-600 leading-relaxed text-[15px]">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4) شاهدها كما ستراها ── */}
        <section className="bg-white py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5">
            <SectionHead title="شاهدها كما ستراها" />
            <div className="grid md:grid-cols-2 gap-6">
              <Reveal><RequestsMock /></Reveal>
              <Reveal delay={100}><PrescriptionsMock /></Reveal>
            </div>
            <p className="text-center text-sm text-slate-400 mt-6">أمثلة توضيحية ببيانات وهمية</p>
          </div>
        </section>

        {/* ── 5) كيف يعمل ── */}
        <section className="bg-[#F8FAFC] py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5">
            <SectionHead title="كيف يعمل؟" />
            <ol className="grid md:grid-cols-3 gap-4">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <Reveal delay={i * 100} className="h-full">
                    <div className="h-full bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex md:flex-col items-start gap-4">
                      <span className="w-12 h-12 shrink-0 rounded-2xl bg-slate-900 text-white text-xl font-black flex items-center justify-center tabular-nums" aria-hidden="true">{i + 1}</span>
                      <p className="font-bold text-slate-800 leading-relaxed text-lg">{s}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 6) الأمان ── */}
        <section className="bg-white py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5">
            <SectionHead title="بياناتك لك وحدك" />
            <div className="grid sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
              {SECURITY.map(({ icon: Icon, text }) => (
                <Reveal key={text}>
                  <div className="h-full flex items-start gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                      <Icon size={24} weight="duotone" className="text-teal-700" aria-hidden="true" />
                    </div>
                    <p className="font-bold text-slate-800 leading-relaxed pt-1">{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="text-center mt-8">
              <Link href="/privacy" className="text-sm font-bold text-teal-700 hover:underline">سياسة الخصوصية</Link>
            </p>
          </div>
        </section>

        {/* ── 7) عرض الإطلاق ── */}
        <section id="offer" className="scroll-mt-4 bg-[#F8FAFC] py-16 sm:py-24">
          <div className="max-w-6xl mx-auto px-5">
            <Reveal>
              <div className="relative overflow-hidden rounded-3xl bg-slate-900 text-white px-6 py-12 sm:px-14 sm:py-16 text-center shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-800/50 via-transparent to-transparent" aria-hidden="true" />
                <div className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-teal-500/20 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-600 flex items-center justify-center mb-6">
                    <Gift size={30} weight="bold" aria-hidden="true" />
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black leading-tight">عرض الإطلاق لأول 100 صيدلية</h2>
                  <p className="mt-4 text-slate-300 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
                    امتيازات حصرية للصيدليات الأولى المشتركة تشمل أشهراً مجانية وتدريباً لفريقك.
                  </p>
                  <p className="mt-6 text-teal-300 font-bold">اسأل عن تفاصيل العرض عبر واتساب</p>
                  <WaButton href={wa('offer', 'عرض الإطلاق')} label="اسأل عبر واتساب" variant="light" className="mt-4 w-full sm:w-auto" />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── 8) أسئلة شائعة ── */}
        <section className="bg-white py-16 sm:py-24">
          <div className="max-w-3xl mx-auto px-5">
            <SectionHead title="أسئلة شائعة" />
            <div className="space-y-3">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group bg-white border border-slate-200 rounded-2xl shadow-sm open:shadow-md open:border-teal-200 transition-shadow">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none p-5 font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
                    {q}
                    <CaretDown size={18} weight="bold" className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="px-5 pb-5 text-slate-600 leading-relaxed">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 9) التواصل ── */}
        <section id="contact" className="scroll-mt-4 bg-[#F8FAFC] pt-16 sm:pt-24 pb-10">
          <div className="max-w-6xl mx-auto px-5 text-center">
            <h2 className="text-3xl sm:text-4xl font-black leading-tight">لنتحدث عن صيدليتك</h2>
            <div className="mt-8 flex flex-col items-center gap-4">
              <WaButton href={wa('contact')} label="اسأل عبر واتساب" className="w-full sm:w-auto sm:min-w-72 !py-5 !text-lg" />
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <a href={`tel:${PHONE_DISPLAY}`} className="inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl px-5 py-3.5 cursor-pointer transition-colors">
                  <Phone size={20} weight="bold" aria-hidden="true" />
                  <span dir="ltr" className="tabular-nums">{PHONE_DISPLAY}</span>
                </a>
                <a href={`mailto:${SALES_EMAIL}`} className="inline-flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-2xl px-5 py-3.5 cursor-pointer transition-colors">
                  <EnvelopeSimple size={20} weight="bold" aria-hidden="true" />
                  <span dir="ltr">{SALES_EMAIL}</span>
                </a>
              </div>
            </div>
          </div>
          <AppFooter className="mt-14" />
        </section>
      </main>

      {/* شريط الجوال السفلي — fixed bottom-0 فقط (لا inset-0) كي لا يقفل globals.css التمرير */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3">
        <a
          href={wa('sticky')}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2.5 w-full bg-teal-600 active:bg-teal-700 text-white rounded-2xl py-3.5 font-bold cursor-pointer"
        >
          <WhatsappLogo size={22} weight="fill" aria-hidden="true" />
          اسأل عبر واتساب
        </a>
      </div>
    </div>
  );
}
