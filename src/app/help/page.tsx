'use client';

import { useState } from 'react';
import Link from 'next/link';
import AppFooter from '@/app/components/AppFooter';
import type { Icon } from '@phosphor-icons/react';
import {
  Key, House, Heartbeat, Pill, Users, Storefront, Eye,
  ClockCounterClockwise, UserCircle, LockKeyOpen, DeviceMobile,
  CaretDown, MagnifyingGlass, Warning,
} from '@phosphor-icons/react';

// نفس شعار Vitalix المستخدم في src/app/privacy/page.tsx — لا يُعاد رسمه من الصفر
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

// صندوق "نقطة قد تُربك" — بنفس تنسيق تنبيهات bg-amber-50 المستخدمة في dashboard/vitals/page.tsx
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <Warning className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" weight="bold" />
      <div className="text-[13px] text-amber-900 leading-relaxed space-y-1.5">{children}</div>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-black text-slate-800 mt-5 mb-2">{children}</h3>;
}

interface HelpSection {
  id: string;
  title: string;
  keywords: string[];
  icon: Icon;
  content: React.ReactNode;
}

const SECTIONS: HelpSection[] = [
  {
    id: 'login',
    title: 'تسجيل الدخول',
    keywords: ['كود الصيدلية', 'PIN', 'رمز الدخول', 'staff-login', 'قفل الحساب', 'دخول الموظف'],
    icon: Key,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> الصيدلاني يحتاج طريقة دخول سريعة لا تتطلب حفظ بريد إلكتروني وكلمة مرور لكل موظف.</p>
        <p className="mt-3"><span className="font-bold text-slate-900">ماذا تفعل:</span> شاشة الدخول (<code className="text-[12px] bg-slate-100 px-1.5 py-0.5 rounded">/staff-login</code>) تمر بثلاث خطوات:</p>
        <ol className="list-decimal list-inside space-y-1.5 mt-2">
          <li><span className="font-bold">كود الصيدلية</span> — حقل من 6 خانات (أحرف وأرقام)، تضغط &quot;متابعة&quot;.</li>
          <li><span className="font-bold">اختيار اسمك</span> — تظهر بطاقات بأسماء كل الموظفين المفعّلين في الصيدلية (مع تصنيف الدور: مالك/صيدلاني/مساعد/موظف)، تضغط على اسمك.</li>
          <li><span className="font-bold">رمز الدخول (PIN)</span> — لوحة أرقام لإدخال رمز من 6 أرقام، ثم &quot;دخول&quot;.</li>
        </ol>
        <p className="mt-3"><span className="font-bold text-slate-900">ما الذي يحدث بعدها:</span> تدخل مباشرة إلى لوحة التحكم.</p>
        <div className="mt-4 space-y-2.5">
          <Callout>
            <p>إذا كان الجهاز قد استُخدم من قبل لنفس الصيدلية، <span className="font-bold">لن تظهر خطوة كود الصيدلية أصلاً</span> — تنتقل الشاشة تلقائياً لاختيار الاسم. للتبديل إلى صيدلية أخرى من نفس الجهاز، يوجد رابط &quot;تغيير الصيدلية&quot; أعلى قائمة الأسماء.</p>
          </Callout>
          <Callout>
            <p>إدخال رمز الدخول خطأً عدة مرات متتالية يقفل الحساب مؤقتاً، وتظهر رسالة &quot;الحساب مقفل مؤقتاً&quot; مع عدّاد تنازلي بالثواني — لا داعي للتواصل مع أحد، ينتظر الموظف انتهاء العدّاد ويحاول مجدداً.</p>
          </Callout>
          <Callout>
            <p>تغيير رمز الدخول لاحقاً يكون من القائمة العلوية (الصورة الرمزية) → &quot;تغيير رمز الدخول&quot; — هذا الخيار يظهر فقط للموظفين، أما &quot;مالك&quot; الحساب فيرى بدلاً منه &quot;تغيير كلمة المرور&quot; (عبر رابط يُرسَل إلى بريده الإلكتروني).</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'home',
    title: 'الرئيسية',
    keywords: ['لوحة التحكم', 'إحصائيات', 'أعياد ميلاد', 'اتصل اليوم', 'القائمة العلوية', 'الاشتراك'],
    icon: House,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> الصيدلاني يفتح النظام صباحاً ويريد أن يعرف بنظرة واحدة: من يحتاج متابعة اليوم؟</p>
        <p className="mt-3 font-bold text-slate-900">ماذا يعرض:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1">
          <li><span className="font-bold">بطاقة &quot;اتصل اليوم&quot;</span> — قائمة مرضى تنتهي أدويتهم المزمنة خلال ٣ أيام قادمة ولم يُرسَل لهم تذكير بعد. لكل مريض زر واتساب دائري (أسود) لإرسال تذكير فوري، وزر &quot;إدارة المزمنين&quot; ينقلك لشاشة المزمنين الكاملة. إن لم يوجد أحد، تظهر رسالة &quot;لا يوجد مرضى بحاجة للتذكير اليوم&quot;.</li>
          <li><span className="font-bold">بطاقة &quot;أعياد ميلاد اليوم&quot;</span> — تظهر فقط إن وُجد مريض عيد ميلاده اليوم، مع زر &quot;تهنئة&quot; يفتح واتساب برسالة تهنئة جاهزة، ويتحول الزر بعدها إلى وسم &quot;تمّت التهنئة&quot;.</li>
          <li><span className="font-bold">لوحة إحصائيات</span> (٥ أرقام): إجمالي المرضى، لهم فحوصات (من إجمالي المرضى)، فحوصات الشهر، إجمالي الفحوصات، مزمنون متابَعون.</li>
          <li><span className="font-bold">بطاقات التنقل الثلاث</span>: &quot;الفحوصات والتحليل الذكي&quot; (تعرض عدد الزيارات)، &quot;إدارة الأدوية المزمنة&quot;، &quot;كتالوج المنتجات&quot; — كل بطاقة تنقل للشاشة المقابلة.</li>
        </ul>

        <div className="mt-4">
          <Callout>
            <p>الضغط على زر واتساب الخاص بتذكير دواء لا يعتبر الإرسال ناجحاً تلقائياً — بعد فتح واتساب يظهر مربع تأكيد &quot;هل تم الإرسال بنجاح؟&quot; ويجب اختيار &quot;نعم، تم الإرسال ✓&quot; لنقل المريض فعلياً إلى قائمة &quot;تم الإرسال&quot; في شاشة المزمنين؛ اختيار &quot;لم يُرسَل&quot; يبقيه كما هو.</p>
          </Callout>
        </div>

        <SubHeading>القائمة العلوية (تظهر في كل شاشات لوحة التحكم)</SubHeading>
        <p>الضغط على أيقونة الصورة الرمزية أعلى يمين الشاشة يفتح قائمة تضم:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li><span className="font-bold">الملف الشخصي</span> و<span className="font-bold">سجل النشاط</span> (لدور &quot;مالك&quot; فقط)</li>
          <li><span className="font-bold">الكتالوج والمنتجات</span> (لكل الأدوار)</li>
          <li><span className="font-bold">اقتراح أو ملاحظة</span> — نموذج لإرسال ملاحظة أو طلب ميزة لفريق Vitalix، مع تقييم نجوم اختياري</li>
          <li><span className="font-bold">تغيير كلمة المرور</span> (مالك) أو <span className="font-bold">تغيير رمز الدخول</span> (موظف)</li>
          <li><span className="font-bold">تسجيل الخروج</span></li>
        </ul>
        <p className="mt-2.5">تظهر هنا أيضاً حالة الاشتراك (نشط/تجريبي وعدد الأيام المتبقية) لدور &quot;مالك&quot; فقط، مع تنبيه إن تبقّى ١٤ يوماً أو أقل.</p>
      </>
    ),
  },
  {
    id: 'vitals',
    title: 'الفحوصات',
    keywords: ['ضغط الدم', 'سكري', 'وزن', 'BMI', 'الملخص الذكي', 'واتساب', 'تقرير', 'قراءة مزدوجة'],
    icon: Heartbeat,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> الصيدلاني يقيس ضغط/سكري/وزن مريض ويريد توثيقها، وتفسيراً طبياً مبسطاً يُرسَل للمريض مباشرة.</p>
        <p className="mt-3 font-bold text-slate-900">الخطوات كما تظهر في الشاشة:</p>
        <ol className="list-decimal list-inside space-y-2 mt-1.5">
          <li><span className="font-bold">بحث عن المريض</span> — بالاسم أو رقم الهاتف. رقم غير موجود يُظهر زر &quot;تسجيل مريض جديد&quot; (نموذج: الاسم، الهاتف، الجنس، تاريخ الميلاد، التشخيصات المزمنة اختيارية، حساسية دواء/طعام، حمل/رضاعة، ملاحظة اختيارية).</li>
          <li><span className="font-bold">اختيار الفحوصات المُجراة</span> — ثلاثة أزرار: ضغط الدم / سكري الدم / الوزن (يمكن اختيار أكثر من واحد لنفس الزيارة).</li>
          <li>
            <span className="font-bold">إدخال القراءات:</span>
            <ul className="list-disc list-inside space-y-1.5 mt-1.5 mr-4">
              <li><span className="font-bold">ضغط الدم</span>: يدعم &quot;قراءة مزدوجة&quot; (بشكل افتراضي مفعّلة) — قراءتان متتاليتان يُحسب متوسطهما تلقائياً، مع اختيار أعراض (صداع، دوخة...) وعوامل مؤثرة (قهوة/شاي، مجهود بدني، توتر) وهل أخذ المريض دواء الضغط اليوم.</li>
              <li><span className="font-bold">سكري الدم</span>: القيمة، نوع الفحص، وعوامل مؤثرة مشابهة.</li>
              <li><span className="font-bold">الوزن</span>: يتطلب أن يكون طول المريض مسجّلاً — إن لم يكن مسجّلاً يظهر تنبيه &quot;لم يُدخَل — مطلوب لحساب BMI&quot; مع زر &quot;+ إدخال الطول&quot; مباشرة في نفس الشاشة.</li>
            </ul>
          </li>
          <li>زر &quot;توليد الملخّص الذكي وحفظ الزيارة&quot; — يحفظ القراءات ويطلب من الذكاء الاصطناعي كتابة ملخص وتوصيات. أثناء الانتظار تظهر شاشة &quot;تفكير&quot; مؤقتة.</li>
          <li>بعد الحفظ تظهر بطاقة التقرير: حالة عامة (طبيعي/تنبيه/خطر بألوان)، القراءات، تصنيفها الطبي، وزر &quot;▼ عرض نص المريض للمراجعة قبل الإرسال&quot; لإظهار النص الكامل الذي سيصل للمريض. إن اقترح النظام منتجات من كتالوج الصيدلية، يمكن استبعاد أي منها بعلامة اختيار قبل الإرسال (زر &quot;حفظ الاستثناءات&quot;).</li>
          <li><span className="font-bold">قبل الإرسال إلزامياً</span>: يجب تفعيل مربع &quot;راجعتُ نتائج التحليل بخبرتي وأعتمدها للمريض&quot; — بدونه يبقى زر &quot;إرسال للمريض&quot; (الأخضر، عبر واتساب) وزر تحميل PDF معطّلين.</li>
          <li>زر &quot;عرض صفحة المريض&quot; يفتح نفس الرابط الذي سيراه المريض، للمراجعة قبل الإرسال.</li>
        </ol>
        <p className="mt-3">
          <span className="font-bold text-slate-900">إن كان هناك قياس وزن</span> (بمفرده أو مع فحوصات أخرى)، تُبنى بالتوازي &quot;خطة وزن&quot; منفصلة (قائمة غذائية + توصيات) تصل خلال لحظات، ولها زر &quot;إرسال للمريض&quot; مستقل، بالإضافة لخيار &quot;إرسال الرابطين معاً&quot; إن وُجد تقريران في نفس الزيارة — وهذا الزر لا يُفعَّل إلا بعد تأكيد مراجعة القسمين.
        </p>

        <div className="mt-4 space-y-2.5">
          <Callout>
            <p>إن تعذّر توليد الملخص بالذكاء الاصطناعي (خلل اتصال مثلاً)، يظهر تنبيه أصفر &quot;تعذّر توليد الملخّص الذكي&quot; ويُستبدل تلقائياً بملخص مختصر مبني على القراءات مباشرة — <span className="font-bold">القراءة تبقى محفوظة</span> رغم ذلك.</p>
          </Callout>
          <Callout>
            <p>زر &quot;فحص جديد&quot; (لبدء زيارة أخرى) يظهر فقط بعد حفظ زيارة كاملة للمريض الحالي. لا يمكن حفظ نفس الزيارة مرتين.</p>
          </Callout>
          <Callout>
            <p>إن كانت القراءة (ضغط، سكري، نبض، أو وزن) خارج المعتاد بشكل ملحوظ، يطلب النظام تأكيداً إضافياً قبل الحفظ (&quot;هل أنت متأكد من صحة الإدخال؟&quot;). وإن كانت القراءة مستحيلة فيزيائياً، يرفض النظام الحفظ تماماً ويطلب إعادة القياس — هذا لحماية سجل المريض من خطأ كتابي (مثل رقم زائد بالخطأ)، لا رأياً طبياً من المنصة.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'chronic',
    title: 'المزمنون',
    keywords: ['قارب النفاذ', 'تم الإرسال', 'بدون رد', 'تم التجديد', 'جهّز مخزونك', 'تجديد الدواء', 'مخزون'],
    icon: Pill,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> متابعة كل مريض مزمن قبل أن ينفد دواؤه، بدل أن يذهب لصيدلية أخرى.</p>
        <p className="mt-3">الشاشة مقسّمة إلى <span className="font-bold">٤ تبويبات</span> بعناوينها الفعلية:</p>
        <div className="mt-2 space-y-2">
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5"><span className="font-bold text-slate-900">قارب النفاذ</span> — دواء المريض على وشك الانتهاء ولم يُرسَل له شيء بعد.</div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5"><span className="font-bold text-slate-900">تم الإرسال</span> — أُرسل تذكير وننتظر رد المريض.</div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5"><span className="font-bold text-slate-900">بدون رد</span> — مرّت مدة على التذكير الأول (تُحسب تلقائياً حسب فترة صلاحية الرسالة المضبوطة في المشروع) بلا استجابة.</div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5"><span className="font-bold text-slate-900">تم التجديد</span> — المريض جدّد دواءه فعلاً.</div>
        </div>
        <p className="mt-3 text-[13px] text-slate-500">ملاحظة: العنوان الظاهر فعلياً في هذه الشاشة هو &quot;قارب النفاذ&quot; وليس &quot;اتصل اليوم&quot; — عبارة &quot;اتصل اليوم&quot; هي عنوان بطاقة التذكير في الرئيسية فقط (نفس المرضى، تسمية مختلفة حسب مكان العرض).</p>

        <p className="mt-4 font-bold text-slate-900">أزرار كل تبويب:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li><span className="font-bold">قارب النفاذ</span>: &quot;أرسل تذكيراً بالواتساب&quot; و&quot;تأكيد التجديد الآن&quot;.</li>
          <li><span className="font-bold">تم الإرسال</span>: &quot;راجع وجدّد&quot;، &quot;نقل إلى بدون رد&quot;، وإن مرّت ٣ أيام فأكثر منذ الرسالة الأولى يظهر أيضاً &quot;إرسال الرسالة الثانية&quot;.</li>
          <li><span className="font-bold">بدون رد</span>: &quot;اتصال هاتفي&quot; (يفتح تطبيق الهاتف مباشرة)، &quot;راجع وجدّد&quot;، و&quot;فقدنا تواصله&quot; (لإغلاق المتابعة).</li>
          <li><span className="font-bold">تم التجديد</span>: &quot;تعديل الأدوية&quot; فقط، مع عرض تاريخ آخر تجديد وموعد النفاذ القادم لكل دواء.</li>
        </ul>

        <p className="mt-3"><span className="font-bold text-slate-900">إضافة/متابعة مريض:</span> زر &quot;متابعة مريض&quot; أعلى الشاشة يفتح نافذة بحث (بالاسم أو الهاتف أو حتى اسم الدواء). إن وُجد المريض تظهر بطاقته وأدويته الحالية مع خيار &quot;تجديد أو تعديل الأدوية&quot; أو &quot;إضافة دواء جديد لملف المريض&quot;. إن لم يوجد، يظهر نموذج تسجيل مريض جديد مطابق تماماً لنموذج شاشة الفحوصات.</p>

        <SubHeading>جهّز مخزونك</SubHeading>
        <p><span className="font-bold text-slate-900">المشكلة:</span> معرفة مسبقاً أي الأدوية سينفد المخزون منها قريباً عند عدة مرضى مجتمعين، قبل أن يصل أول مريض ويجد الدواء غير متوفر.</p>
        <p className="mt-2"><span className="font-bold text-slate-900">ماذا تفعل:</span> زر &quot;جهّز مخزونك&quot; أعلى شاشة المزمنين يفتح جدولاً يجمع كل الأدوية التي تحتاجها الصيدلية خلال ١٤ يوماً القادمة (مجمّعة حسب اسم الدواء، وليس حسب المريض)، مع عمود &quot;الكمية&quot; المطلوبة تلقائياً. لكل دواء زران محتملان:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li><span className="font-bold">&quot;موجود&quot;</span> — تأكيد أن الدواء متوفر فعلاً على رف الصيدلية.</li>
          <li><span className="font-bold">&quot;كمية جزئية&quot;</span> — إن كان متوفراً بكمية أقل من المطلوب، تُدخل العدد يدوياً.</li>
        </ul>
        <p className="mt-2">يوجد فلترة (الكل / عاجل / مؤكَّد) وبحث باسم الدواء، وزر &quot;تصدير PDF&quot; لطباعة القائمة وأخذها لمورّد الأدوية.</p>

        <div className="mt-4">
          <Callout>
            <p>الضغط على &quot;موجود&quot; لا يعني إنقاص المخزون تلقائياً من نظام محاسبي خارجي — هو مجرد تأكيد داخلي في Vitalix يجعل الصف يظهر باللون الهادئ بدل التنبيه. للتراجع عن هذا التأكيد (مثلاً لو بيع الدواء قبل وصول المريض المزمن) يوجد زر &quot;تراجع&quot;.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'patients',
    title: 'المرضى',
    keywords: ['ملف المريض', 'بحث عن مريض', 'سجل الزيارات', 'حذف مريض', 'تعديل بيانات المريض'],
    icon: Users,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> الوصول لملف مريض سابق بسرعة (سجل زياراته، بياناته، أدويته).</p>
        <p className="mt-3"><span className="font-bold text-slate-900">شاشة القائمة</span>: بحث بالاسم أو الهاتف، وزر &quot;مريض جديد&quot; لفتح نفس نموذج التسجيل المعتاد. كل بطاقة مريض تعرض الاسم والهاتف والعمر وتنقل لملفه بالضغط عليها.</p>

        <div className="mt-3">
          <Callout>
            <p>لغير &quot;مالك&quot; الحساب (أي موظف/صيدلاني/مساعد)، <span className="font-bold">لا تظهر قائمة كل المرضى تلقائياً</span> — الشاشة تطلب البحث أولاً (&quot;ابحث باسم المريض أو رقم هاتفه للوصول إلى ملفه&quot;). هذا مقصود (مبدأ عدم عرض بيانات كل المرضى دفعة واحدة لكل موظف)، وليس خللاً.</p>
          </Callout>
        </div>

        <p className="mt-4"><span className="font-bold text-slate-900">ملف المريض</span> يعرض:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li>بيانات المريض مع زر &quot;✎ تعديل&quot; لتحديث الاسم/الهاتف/الجنس/تاريخ الميلاد/التشخيصات/الحساسيات، وزر تفاعلي لإدخال/تعديل الطول مباشرة.</li>
          <li>إحصاءات سريعة: إجمالي الزيارات، تاريخ آخر زيارة، الطول.</li>
          <li>الأدوية المزمنة الحالية (إن وُجدت).</li>
          <li>سجل كل الزيارات مع زر لإعادة إرسال أي زيارة سابقة عبر واتساب (نتائج التحليل، أو خطة الوزن، أو الاثنين معاً في رسالة واحدة إن وُجدا لنفس الزيارة).</li>
          <li>زر اتصال هاتفي مباشر وزر واتساب عام لفتح محادثة مع المريض.</li>
        </ul>

        <div className="mt-4">
          <Callout>
            <p>لا يوجد أي زر لحذف مريض من الشاشة — الحذف غير متاح إطلاقاً من واجهة الصيدلاني.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'catalog',
    title: 'الكتالوج',
    keywords: ['منتج', 'بطاقة الأمان', 'مكملات', 'أجهزة', 'حذف منتج', 'إضافة منتج'],
    icon: Storefront,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> بناء قائمة منتجات (مكملات/أجهزة) تقترحها الشاشات الأخرى تلقائياً على المرضى المناسبين، مع &quot;بطاقة أمان&quot; تمنع اقتراح منتج لمريض لديه حساسية أو تعارض معه.</p>
        <p className="mt-3"><span className="font-bold text-slate-900">الوصول:</span> من القائمة العلوية (الصورة الرمزية) → &quot;الكتالوج والمنتجات&quot;، أو من بطاقة &quot;كتالوج المنتجات&quot; في الرئيسية.</p>

        <p className="mt-3"><span className="font-bold text-slate-900">إضافة منتج</span> (زر &quot;إضافة منتج&quot;، متاح فقط لدوري مالك/صيدلاني — الموظف والمساعد يريان الكتالوج للاطلاع فقط بلا أزرار تعديل):</p>
        <ol className="list-decimal list-inside space-y-1.5 mt-1.5">
          <li>اسم المنتج، صورة اختيارية، السعر.</li>
          <li>زر &quot;بناء بطاقة الأمان بالذكاء الاصطناعي&quot; — يقرأ اسم المنتج (والصورة إن وُجدت) ويقترح تلقائياً: النوع والفئة المناسبين، والمكونات الفعالة، ومحاذير الحمل/الرضاعة/العمر/السكر/الصوديوم/الكافيين، وأي تعارض مع تشخيصات معينة.</li>
          <li>تراجع/تعديل يدوي على أي حقل في البطاقة المقترحة.</li>
          <li>مربع إلزامي &quot;راجعتُ بطاقة الأمان بخبرتي وأعتمدها باسمي&quot; — بدونه يبقى زر &quot;تأكيد بطاقة الأمان وحفظ المنتج&quot; معطّلاً.</li>
          <li>بديل: &quot;حفظ بلا بطاقة أمان الآن&quot; — يحفظ المنتج لكنه يظهر بوسم &quot;بحاجة مراجعة&quot; حتى تُبنى بطاقته لاحقاً.</li>
        </ol>

        <div className="mt-4 space-y-2.5">
          <Callout>
            <p>إن كان اسم المنتج يطابق اسم دواء فعلي (وليس مكمّلاً/جهازاً)، يرفض النظام الحفظ برسالة صريحة أن Vitalix لا يعرض أدوية ولا يقترح علاجاً. تكرار اسم منتج موجود مسبقاً في نفس الصيدلية يُرفض أيضاً برسالة تطلب تعديل المنتج الموجود بدل إضافته من جديد.</p>
          </Callout>
          <Callout>
            <p>الحذف نهائي ولا رجعة فيه (تأكيد صريح بمربع حوار قبل التنفيذ). لا يوجد حد أقصى لعدد المنتجات في الكتالوج حالياً — يمكن إضافة أي عدد.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'patient-view',
    title: 'ماذا يرى المريض',
    keywords: ['رابط المريض', 'صفحة المريض', 'خطة الوزن', 'نتائج الفحص', 'weight', 'vitals view'],
    icon: Eye,
    content: (
      <>
        <p>لا حساب للمريض إطلاقاً — يفتح رابطاً يرسله الصيدلاني عبر واتساب، بلا تسجيل دخول.</p>

        <SubHeading>أ. رابط نتائج الفحص</SubHeading>
        <p>يعرض: هوية الصيدلية في الأعلى (وليس شعار Vitalix)، اسم المريض وحالته العامة، القراءات (الضغط/النبض/السكري) مع تصنيفها الطبي بلغة مبسطة، رسم بياني لتاريخ القراءات السابقة، النص الذي كتبه الذكاء الاصطناعي (أو الصيدلاني بعد مراجعته)، ثم منتجات مقترحة من كتالوج الصيدلية (إن وُجدت) — لكل منتج زر &quot;طلب عبر WhatsApp&quot; يفتح محادثة جاهزة مع الصيدلية. أسفل الصفحة زر لطلب السجل الطبي الكامل بصيغة PDF عبر واتساب، ورابط لخطة الوزن إن وُجدت لنفس الزيارة، وتنويه طبي عام في الأسفل (لا تُغني عن استشارة الطبيب).</p>

        <SubHeading>ب. رابط خطة الوزن</SubHeading>
        <p>نفس مبدأ هوية الصيدلية في الأعلى. إن كانت الخطة ما زالت قيد الإعداد بالذكاء الاصطناعي، تظهر شاشة انتظار متحركة تتحدّث تلقائياً كل ٤ ثوانٍ دون أن يحتاج المريض لإعادة تحميل الصفحة. بعد اكتمالها تظهر: بيانات المريض، قوائم وجبات مقترحة (إفطار/غداء/عشاء/وجبات خفيفة)، قسم &quot;مقترحات من [اسم الصيدلية]&quot; لمنتجات الكتالوج المناسبة لحالته مع زر واتساب للاستفسار عن كل منتج على حدة أو استشارة عامة، وفحوصات مخبرية يُنصح بإجرائها إن وُجدت، ورابط لقراءات الضغط/السكري من نفس الزيارة إن وُجدت.</p>

        <div className="mt-4">
          <Callout>
            <p>إذا فتح المريض الرابط فور إرساله وكانت خطة الوزن لم تكتمل بعد (الذكاء الاصطناعي ما زال يعالج البيانات)، هذا وضع طبيعي متوقع — الصفحة نفسها تعرض &quot;مستشار التغذية يُعد خطتك الشخصية... ستظهر هنا تلقائياً خلال لحظات&quot; ولا حاجة لإعادة الإرسال.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'activity',
    title: 'سجل النشاط',
    keywords: ['activity', 'من فعل ماذا', 'فلاتر', 'الموظفين', 'حركات'],
    icon: ClockCounterClockwise,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> &quot;مالك&quot; الصيدلية يريد معرفة من فعل ماذا بالضبط داخل حساب الصيدلية (خصوصاً حين يكون هناك أكثر من موظف).</p>
        <p className="mt-3"><span className="font-bold text-slate-900">الوصول:</span> القائمة العلوية (الصورة الرمزية) → &quot;سجل النشاط&quot;. هذه الشاشة لدور &quot;مالك&quot; فقط — أي دور آخر يفتح الرابط يرى رسالة &quot;هذه الصفحة للمالك فقط&quot; بلا أي بيانات.</p>
        <p className="mt-3"><span className="font-bold text-slate-900">ماذا تعرض:</span> قائمة زمنية (الأحدث أولاً، حتى ١٠٠ حركة) لكل حركة يقوم بها أي موظف في الصيدلية، مثل: إضافة/تعديل/حذف مريض، إضافة/تعديل/حذف دواء مزمن، إضافة/تعديل/إخفاء/حذف منتج في الكتالوج، إرسال أو فتح رسالة تذكير تجديد، إرسال تهنئة عيد ميلاد، ونقل مريض بين مراحل المتابعة في شاشة المزمنين (تظهر كـ&quot;نقل المريض من كذا إلى كذا&quot; — وإن نقله النظام تلقائياً بسبب انتهاء مهلة الرد، تُنسَب الحركة إلى &quot;Vitalix&quot; لا لأي موظف).</p>

        <p className="mt-3 font-bold text-slate-900">فلاتر متاحة:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li><span className="font-bold">الفترة</span>: آخر ٧ أيام / آخر ٣٠ يوماً (الافتراضي) / آخر ٣ أشهر / الكل.</li>
          <li><span className="font-bold">الموظف</span>: قائمة تُبنى تلقائياً من أسماء من قاموا بحركات ظاهرة فعلاً في النتائج الحالية.</li>
          <li><span className="font-bold">نوع الحركة</span>: كل الحركات / الأدوية / المرضى / الكتالوج / المكملات / التذكيرات / التهاني / دخول الموظفين.</li>
        </ul>

        <div className="mt-4">
          <Callout>
            <p>فلتر &quot;الموظف&quot; لا يجلب موظفين جدداً من القاعدة عند تغييره — هو مبني فقط من الأسماء الموجودة أصلاً ضمن النتائج التي جلبتها فلاتر &quot;الفترة&quot; و&quot;نوع الحركة&quot;؛ فإن غيّرت الفترة إلى مدى أقصر قد يختفي اسم موظف من قائمة الفلتر لأنه لم يعد له حركات ظاهرة في تلك الفترة تحديداً.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'profile',
    title: 'الملف الشخصي',
    keywords: ['كود الصيدلية', 'فريق العمل', 'تصفير الرمز', 'الاشتراك', 'كلمة المرور', 'إضافة موظف'],
    icon: UserCircle,
    content: (
      <>
        <p><span className="font-bold text-slate-900">المشكلة:</span> &quot;مالك&quot; الصيدلية يحتاج مكاناً واحداً لمتابعة اشتراكه، تعديل بيانات صيدليته، وإدارة حسابات موظفيه.</p>
        <p className="mt-3"><span className="font-bold text-slate-900">الوصول:</span> القائمة العلوية (الصورة الرمزية) → &quot;الملف الشخصي&quot; (يظهر فقط لدور &quot;مالك&quot;).</p>
        <p className="mt-2">الشاشة مقسّمة إلى أربع بطاقات:</p>

        <SubHeading>حالة الاشتراك</SubHeading>
        <p>عرض فقط (لا تعديل من هنا): تاريخ الانتهاء (مع تنبيه أصفر إن اقترب)، إجمالي قيمة الاشتراك، المبلغ المدفوع، المتبقي (إن وُجد)، وتاريخ التسجيل.</p>

        <SubHeading>بيانات الصيدلية</SubHeading>
        <p>عرض افتراضي لاسم الصيدلية، الاسم بالإنجليزية، اسم الصيدلاني، الهاتف، الدولة، المدينة/العنوان، البريد الإلكتروني، و<span className="font-bold">كود الصيدلية</span> (الذي يحتاجه الموظفون لتسجيل الدخول) مع زرَّي &quot;نسخ&quot; و&quot;تبديل&quot;. زر &quot;تعديل&quot; يفتح نموذجاً لتغيير: اسم الصيدلاني، الهاتف، المدينة/العنوان، الاسم بالإنجليزية (اختياري، يُستخدم في التقارير والرسائل الإنجليزية).</p>
        <div className="mt-3">
          <Callout>
            <p>الضغط على &quot;تبديل&quot; لتغيير كود الصيدلية يُظهر تحذيراً صريحاً بأن الكود القديم سيتوقف فوراً عن العمل، وأن على المالك إرسال الكود الجديد يدوياً لكل موظفيه — لا إشعار تلقائي لهم، والإجراء لا يمكن التراجع عنه.</p>
          </Callout>
        </div>

        <SubHeading>فريق العمل</SubHeading>
        <p>يعرض عداد &quot;المستخدَم / الحد الأقصى&quot; لعدد الصيادلة/الموظفين. الصيدلاني الرئيسي (صاحب حساب تسجيل الدخول الأصلي) يظهر أولاً ومُعلَّماً &quot;رئيسي&quot; — <span className="font-bold">لا يمكن حذفه</span>. بقية الفريق (المفعَّلون أولاً، والمعطَّلون مطويّون تحت &quot;موظفون سابقون&quot;) لكل واحد منهم قائمة إجراءات (⋯):</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li><span className="font-bold">تصفير الرمز</span> — يولّد PIN جديداً ويعرضه في نافذة منبثقة فيها زر &quot;نسخ التعليمات&quot; (رسالة جاهزة بكود الصيدلية والرمز، لإرسالها للموظف يدوياً عبر أي وسيلة).</li>
          <li><span className="font-bold">تعطيل / تفعيل</span> — يمنع أو يعيد السماح بتسجيل الدخول دون حذف الحساب أو سجله.</li>
          <li><span className="font-bold">حذف نهائي</span> — يطلب تأكيداً صريحاً في نافذة منفصلة، ولا يمكن التراجع عنه.</li>
        </ul>
        <p className="mt-2">لإضافة موظف جديد: اسم (إلزامي)، هاتف (اختياري)، والدور (موظف / مساعد / صيدلاني) من قائمة منسدلة، ثم &quot;+ إضافة&quot; — يظهر فوراً نفس مربع الرمز والتعليمات الجاهزة للمشاركة. إن وصل عدد الفريق الحد الأقصى المسموح للاشتراك، يختفي نموذج الإضافة وتظهر رسالة &quot;تم الوصول للحد الأقصى&quot;.</p>

        <SubHeading>كلمة المرور</SubHeading>
        <p>زر واحد &quot;إرسال رابط التغيير&quot; يرسل رابط تغيير كلمة مرور المالك إلى بريده الإلكتروني المسجَّل (نفس آلية &quot;تغيير كلمة المرور&quot; في القائمة العلوية).</p>

        <div className="mt-4">
          <Callout>
            <p>خيارا &quot;تصفير الرمز&quot; و&quot;إضافة موظف جديد&quot; يفتحان نفس نافذة عرض الرمز — فإن أُغلقت النافذة بالخطأ قبل نسخ الرمز أو مشاركته، لا توجد طريقة لاسترجاع نفس الرمز لاحقاً؛ يجب تصفير الرمز مجدداً لإصدار رمز جديد.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'change-pin',
    title: 'تغيير رمز الدخول',
    keywords: ['PIN', 'change-pin', 'رمز جديد', 'تصفير الرمز'],
    icon: LockKeyOpen,
    content: (
      <>
        <p><span className="font-bold text-slate-900">متى تُستخدم:</span> هذه الشاشة خاصة بالموظفين (وليس مالك الحساب، الذي يغيّر كلمة مروره عبر رابط بريده الإلكتروني). تظهر في حالتين:</p>
        <ul className="list-disc list-inside space-y-1.5 mt-1.5">
          <li>الموظف يغيّر رمزه بنفسه طوعاً من القائمة العلوية → &quot;تغيير رمز الدخول&quot;.</li>
          <li>الموظف <span className="font-bold">مُجبَر</span> على تغيير رمزه فور تسجيل الدخول — إما لأنها أول مرة يدخل فيها بعد إنشاء حسابه، أو لأن &quot;مالك&quot; الصيدلية ضغط &quot;تصفير الرمز&quot; له من شاشة الملف الشخصي.</li>
        </ul>

        <p className="mt-3 font-bold text-slate-900">الخطوات:</p>
        <ol className="list-decimal list-inside space-y-1.5 mt-1.5">
          <li><span className="font-bold">في حالة التغيير الطوعي فقط</span>: يُطلب أولاً إدخال الرمز الحالي (٦ أرقام) للتأكد من الهوية قبل أي تعديل — هذه الخطوة لا تظهر في حالة الإجبار (أول دخول أو تصفير من المالك)، تبدأ الشاشة مباشرة من الخطوة التالية.</li>
          <li>إدخال رمز جديد من ٦ أرقام.</li>
          <li>إعادة إدخال نفس الرمز الجديد للتأكيد.</li>
          <li>زر &quot;حفظ الرمز&quot; — عند النجاح تظهر رسالة &quot;تم تغيير الرمز بنجاح&quot; ثم تنقل تلقائياً إلى الرئيسية.</li>
        </ol>

        <div className="mt-4 space-y-2.5">
          <Callout>
            <p>إن لم يتطابق الرمز الجديد مع تأكيده، تعود الشاشة تلقائياً لخطوة &quot;اختر رمزاً جديداً&quot; مع رسالة &quot;الرمزان غير متطابقين&quot; — لا حاجة لإعادة إدخال الرمز الحالي من جديد.</p>
          </Callout>
          <Callout>
            <p>إدخال الرمز الحالي بشكل خاطئ (في حالة التغيير الطوعي) يعيد الشاشة لخطوته الأولى مع رسالة خطأ صريحة.</p>
          </Callout>
        </div>
      </>
    ),
  },
  {
    id: 'install',
    title: 'تثبيت المنصة على الهاتف',
    keywords: ['آيفون', 'أندرويد', 'الشاشة الرئيسية', 'PWA', 'تطبيق', 'iPhone', 'Android'],
    icon: DeviceMobile,
    content: (
      <>
        <p><span className="font-bold text-slate-900">الفائدة:</span> تثبيت Vitalix-ai على الشاشة الرئيسية للهاتف يجعله يفتح كأنه تطبيق مستقل — بلا شريط عنوان المتصفح وبلا أزرار التنقل المعتادة للمتصفح، فقط واجهة المنصة بملء الشاشة.</p>

        <SubHeading>آيفون (عبر Safari فقط)</SubHeading>
        <ol className="list-decimal list-inside space-y-1.5">
          <li>افتح المنصة من متصفح <span className="font-bold">Safari</span> (لا تعمل هذه الخطوات من كروم أو أي متصفح آخر على آيفون).</li>
          <li>اضغط زر <span className="font-bold">المشاركة</span> (المربع وبداخله سهم لأعلى) في شريط الأدوات.</li>
          <li>اختر <span className="font-bold">&quot;إضافة إلى الشاشة الرئيسية&quot;</span> من القائمة.</li>
          <li>أكّد بالضغط على <span className="font-bold">&quot;إضافة&quot;</span> أعلى يمين الشاشة.</li>
        </ol>

        <SubHeading>أندرويد (عبر Chrome)</SubHeading>
        <ol className="list-decimal list-inside space-y-1.5">
          <li>افتح المنصة من متصفح <span className="font-bold">Chrome</span>.</li>
          <li>غالباً يظهر تلقائياً خيار <span className="font-bold">&quot;Install app&quot;</span> عند فتح الموقع — اضغطه مباشرة.</li>
          <li>إن لم يظهر تلقائياً: اضغط زر <span className="font-bold">القائمة</span> (النقاط الثلاث الرأسية) أعلى يمين الشاشة، ثم اختر <span className="font-bold">&quot;Add to Home screen&quot;</span>.</li>
          <li>أكّد التثبيت عند ظهور رسالة التأكيد.</li>
        </ol>

        <div className="mt-4">
          <Callout>
            <p>بعد التثبيت، يظهر أيقونة Vitalix-ai كأي تطبيق آخر على الشاشة الرئيسية — فتحه من هذه الأيقونة (وليس من رابط المتصفح المحفوظ) هو ما يمنحك تجربة بلا شريط عنوان.</p>
          </Callout>
        </div>
      </>
    ),
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? SECTIONS.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.keywords.some(k => k.toLowerCase().includes(q))
      )
    : SECTIONS;

  const toggle = (id: string) => setOpenId(prev => (prev === id ? null : id));

  const jumpTo = (id: string) => {
    setOpenId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased" dir="rtl">
      <div className="max-w-5xl mx-auto px-5 py-12 sm:py-16">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
            ← لوحة التحكم
          </Link>
          <VitalixMark />
        </div>

        <div className="mt-6">
          <h1 className="text-2xl font-black text-slate-900">دليل الاستخدام</h1>
          <p className="text-xs text-slate-400 mt-1">كل ما تحتاج معرفته لاستخدام Vitalix-ai</p>
        </div>

        {/* شريط البحث */}
        <div className="relative mt-6">
          <MagnifyingGlass className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" weight="bold" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث في الدليل..."
            dir="rtl"
            className="w-full pr-11 pl-4 py-3 text-sm bg-white border border-slate-200/80 rounded-xl shadow-[0_20px_50px_rgba(15,23,42,0.04)] focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition text-slate-900"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">

          {/* فهرس جانبي — الشاشات الكبيرة فقط */}
          <aside className="hidden lg:block sticky top-8 self-start">
            <nav className="bg-white border border-slate-200/80 rounded-[22px] shadow-[0_20px_50px_rgba(15,23,42,0.04)] p-3 space-y-0.5">
              {SECTIONS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => jumpTo(s.id)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-[12.5px] font-bold transition-colors ${
                    openId === s.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {i + 1}. {s.title}
                </button>
              ))}
            </nav>
          </aside>

          {/* الأقسام القابلة للطي */}
          <div className="space-y-3 min-w-0">
            {filtered.length === 0 ? (
              <div className="bg-white border border-slate-200/80 rounded-[22px] shadow-[0_20px_50px_rgba(15,23,42,0.04)] py-12 text-center">
                <p className="text-sm font-bold text-slate-500">لا نتائج مطابقة لبحثك</p>
              </div>
            ) : (
              filtered.map(s => {
                const isOpen = openId === s.id;
                const SectionIcon = s.icon;
                return (
                  <div
                    key={s.id}
                    id={s.id}
                    className="bg-white border border-slate-200/80 rounded-[22px] shadow-[0_20px_50px_rgba(15,23,42,0.04)] overflow-hidden scroll-mt-6"
                  >
                    <button
                      onClick={() => toggle(s.id)}
                      className="w-full flex items-center justify-between gap-3 p-5 sm:p-6 text-right cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <SectionIcon className="w-[18px] h-[18px] text-slate-700" weight="bold" />
                        </div>
                        <h2 className="text-base font-black text-slate-900 truncate">{s.title}</h2>
                      </div>
                      <CaretDown
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                        weight="bold"
                      />
                    </button>
                    {isOpen && (
                      <div className="px-5 sm:px-6 pb-6 sm:pb-8 text-sm text-slate-600 leading-relaxed">
                        {s.content}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <AppFooter className="mt-10" />
      </div>
    </div>
  );
}
