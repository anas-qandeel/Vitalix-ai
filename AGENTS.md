<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vitalix.ai — دليل المشروع للـ Agent

## 1. نظرة عامة

**Vitalix.ai** منصة SaaS باللغة العربية (RTL بالكامل) موجّهة للصيدليات في الأردن لمتابعة "صحتك.. متابعة باستمرار" — تسجيل الفحوصات الحيوية للمرضى (ضغط، سكري، وزن، نبض)، توليد تقرير طبي بالذكاء الاصطناعي (Gemini)، متابعة الأدوية المزمنة ومواعيد التجديد، وإرسال كل ذلك للمريض مباشرة عبر WhatsApp برابط عام لا يحتاج تسجيل دخول.

ثلاث فئات مستخدمين:
- **صيدلية (Pharmacy)** — الحساب الأساسي، يسجّل دخول عبر Supabase Auth، ويعمل ضمن `/dashboard/*`. صف `pharmacies` مفتاحه `id` **هو نفسه** `auth.users.id` (لا جدول ربط منفصل).
- **أدمن المنصة (Platform Admin)** — يدير كل الصيدليات (تفعيل/تعليق/أرشفة/دفعات) من `/admin`. يُتحقق من صلاحيته عبر جدول `platform_admins` (`user_id` ↔ `auth.users.id`).
- **المريض (Patient)** — لا حساب له إطلاقاً. يستقبل رابطاً عاماً (`/vitals/view/[id]`, `/weight/[planId]`) عبر WhatsApp يعرض تقريره — الأمان يعتمد على أن الـ id هو UUID عشوائي غير قابل للتخمين، وليس على RLS أو تسجيل دخول.

## 2. Stack التقني

| الطبقة | التقنية |
|---|---|
| Framework | Next.js 16.2.10 (**App Router + Turbopack**) — راجع القسم أعلاه، الإصدار يحمل تغييرات جذرية عن ما تعرفه، تحقق من `node_modules/next/dist/docs/` قبل أي استخدام لـ API غير مألوف |
| React | 19.2.4 |
| اللغة | TypeScript (`strict: true`) |
| التنسيق | Tailwind CSS v4 (عبر `@tailwindcss/postcss`، لا ملف `tailwind.config` — الإعداد داخل `globals.css` بصيغة `@theme inline`) |
| قاعدة البيانات / Auth | Supabase (Postgres + Supabase Auth) |
| AI | Google Gemini عبر `@google/genai` (`gemini-3.6-flash` مع fallback إلى `gemini-3.5-flash-lite`، قابلة للتجاوز بـ `GEMINI_MODEL` في `.env.local`) |
| توليد PDF | `html2canvas-pro` + `jspdf` (client-side فقط، عبر تحويل عنصر DOM مؤقت إلى صورة ثم PDF) |
| أيقونات | مزيج من `lucide-react`، SVG مخصّصة inline، وإيموجي (❤️📅💡) — راجع قسم Design System |
| التواصل مع المريض | روابط `wa.me` / `api.whatsapp.com` مباشرة (لا SDK لواتساب) |

لا يوجد ORM — كل الوصول لقاعدة البيانات عبر `@supabase/supabase-js` مباشرة من client components أو من route handlers.

## 3. البنية المعمارية والصلاحيات

### 3.1 عميلا Supabase — لا تخلط بينهما
- `src/lib/supabase.ts` → عميل **anon key**، يُستخدم من client components (`'use client'`) مع جلسة المستخدم المسجّل دخوله (صيدلية أو أدمن). يعتمد على RLS في قاعدة البيانات.
- `src/lib/supabase-admin.ts` → عميل **service role key**، يُستخدم **حصراً** داخل route handlers تحت `src/app/api/**` — يتخطى RLS بالكامل. لا تستورده أبداً في كود client-side.

### 3.2 ثلاث طبقات صلاحيات مختلفة تماماً
1. **صفحات الصيدلية** (`/dashboard/**`): محمية بـ `src/app/dashboard/layout.tsx` — حارس client-side يتحقق من `supabase.auth.getSession()` عند التحميل، ويتحقق أيضاً من `pharmacies.status` (يرفض `suspended`/`archived` حتى لو الجلسة محفوظة محلياً). **أي صفحة تُضاف تحت `/dashboard` تصبح تلقائياً محمية بهذا الحارس** — هذا يشمل الصفحات الفرعية بعمق أي مستوى.
2. **صفحات الأدمن** (`/admin/**`): لا يوجد layout حارس مكافئ على الصفحة نفسها؛ الحماية الفعلية على مستوى الـ API فقط — كل route تحت `src/app/api/admin/**` يستدعي `verifyPlatformAdmin(request)` من `src/lib/verify-admin.ts` الذي يتحقق من `Authorization: Bearer <access_token>` عبر `supabaseAdmin.auth.getUser(token)`. استخدم `src/lib/admin-fetch.ts` (`adminFetch`) من الواجهة بدل `fetch` العادي حتى يُرفق التوكن تلقائياً.
3. **صفحات المريض العامة**: أي صفحة يفتحها المريض من رابط WhatsApp **يجب أن تكون خارج `/dashboard` تماماً** (وإلا ورثت حارس تسجيل الدخول الخاص بالصيدلية). النمط المعتمد في المشروع:
   - `src/app/vitals/view/[id]/page.tsx` ← تقرير فحص حيوي واحد
   - `src/app/weight/[planId]/page.tsx` ← خطة إنقاص وزن
   
   كلتاهما `'use client'`, تجلب بياناتها من route عام تحت `src/app/api/**` لا يتحقق من الجلسة إطلاقاً ويستخدم `supabaseAdmin` (service role) للقراءة، مع تعليق صريح في أعلى الملف يوضح أن الأمان يعتمد على عشوائية الـ UUID لا على RLS. **أي صفحة عامة جديدة للمريض يجب أن تتبع هذا النمط بالضبط**: مسار جذر مستقل (ليس تحت `/dashboard`) + API عام مخصص لا يعيد إلا الحقول اللازمة للعرض.

### 3.3 توجيه بعد تسجيل الدخول
`src/app/page.tsx` (صفحة تسجيل الدخول على `/`) تتحقق من `platform_admins` بعد نجاح الدخول: إن وُجد سجل ← `/admin`، وإلا ← `/dashboard`.

## 4. هيكل الملفات

```
src/
  app/
    page.tsx                          # تسجيل الدخول (صيدلية أو أدمن) — يعيد التوجيه حسب الدور
    layout.tsx                        # RootLayout: <html lang="ar" dir="rtl">
    globals.css                       # Tailwind v4 + متغيرات الثيم (خفيف جداً، معظم التصميم inline بـ className)

    admin/
      page.tsx                        # لوحة الأدمن (صيدليات، تجديد اشتراكات، أدمنز، feedback) — ملف كبير جداً
      FeedbackInbox.tsx                # تبويب استقبال ملاحظات الصيدليات
      pharmacies/[id]/page.tsx         # تفاصيل صيدلية واحدة من منظور الأدمن

    dashboard/
      layout.tsx                      # حارس الجلسة + حالة الصيدلية (suspended/archived) — يغلّف كل ما تحت dashboard
      page.tsx                        # الرئيسية: إحصائيات، أعياد ميلاد، تذكيرات أدوية مزمنة
      components/
        DashboardHeader.tsx           # الهيدر المشترك + usePharmacyInfo() + إدارة "الصيدلاني النشط" (localStorage)
      vitals/
        page.tsx                      # تسجيل فحص حيوي جديد لمريض (بحث/إضافة مريض، نموذج القياسات، توليد AI، إرسال واتساب)
      chronic/
        page.tsx                      # إدارة الأدوية المزمنة ومواعيد التجديد
      patients/[id]/page.tsx          # ملف مريض واحد وسجله
      pharmacy-catalog-manager/page.tsx  # كتالوج أجهزة/منتجات الصيدلية (حد أقصى 10) — تُستخدم للتوصيات في تقرير المريض
      profile/page.tsx                # الملف الشخصي للصيدلية

    vitals/view/[id]/page.tsx         # صفحة عامة: تقرير فحص حيوي واحد (رابط المريض عبر واتساب)
    weight/[planId]/page.tsx          # صفحة عامة: خطة إنقاص وزن (رابط المريض عبر واتساب)

    api/
      visit/[id]/route.ts             # GET عام — تفاصيل زيارة + سجل المريض + توصيات الكتالوج (service role)
      weight-plan/route.ts            # عام + محمي حسب الفعل — إدارة خطط الوزن
      generate-ai-report/route.ts     # POST — يبني برومبت طبي ويستدعي Gemini لتوليد تقرير المريض (مع fallback محلي بلا AI)
      generate-ai-pitch/route.ts      # POST — نص تسويقي بالذكاء الاصطناعي لمنتج في الكتالوج
      generate-weight-report/route.ts # POST — يولّد خطة تغذية/وزن بالذكاء الاصطناعي
      admin/
        create-pharmacy/route.ts      # محمي بـ verifyPlatformAdmin
        create-platform-admin/route.ts
        manage-pharmacy/route.ts      # PUT (تحديث) / DELETE (أرشفة + حظر auth) — كلها محمية
        pharmacy-detail/[id]/route.ts

  lib/
    supabase.ts                       # عميل anon (client-side)
    supabase-admin.ts                 # عميل service role (API routes فقط)
    verify-admin.ts                   # verifyPlatformAdmin(request) — يتحقق من Bearer token
    admin-fetch.ts                    # adminFetch() — fetch مع إرفاق access_token تلقائياً

  types/
    html2canvas-pro.d.ts, html2pdf.d.ts   # تصريحات TypeScript لمكتبات بلا types رسمية
```

**ملاحظة مهمة**: أي صفحة "تقرير للمريض" أو أي مسار عام آخر **يجب أن يُنشأ خارج `src/app/dashboard/`** — ضع صفحات المريض العامة كمجلد مستقل تحت `src/app/` مباشرة (مثل `vitals/` و`weight/`)، أبداً تحت `dashboard/`.

## 5. Design System

المشروع لا يستخدم مكتبة UI جاهزة (لا shadcn، لا MUI) — كل شيء Tailwind utility classes inline، مع بعض `<style jsx global>` لاستيراد الخطوط وتعريف كلاسات أنيميشن بسيطة. النمط العام "SaaS نظيف": بطاقات بيضاء بحواف مدوّرة كبيرة على خلفية slate فاتحة جداً.

### 5.1 الخطوط
- **الخط الأساسي لكل الواجهة**: `IBM Plex Sans Arabic` (يُستورد عبر Google Fonts CDN داخل `<style jsx global>` في أعلى كل صفحة/مكوّن رئيسي، ويُطبَّق على `body` عبر `font-family`).
- **خط العلامة التجارية** (اسم "Vitalix.ai" فقط): `Plus Jakarta Sans`، وزن 700–900، عبر كلاس `.font-brand`.
- كل صفحة جديدة تحتاج الخط تكرر استيراده بنفسها (`@import url(...)` داخل `<style jsx global>`) — هذا هو النمط المتبع حالياً وليس خطأً، رغم تكراره عبر الملفات.

### 5.2 اللغة والاتجاه
- `lang="ar" dir="rtl"` على `<html>` دائماً (معرّف في `RootLayout`). الصفحات المستقلة (خارج layout مشترك واضح) تضيف `dir="rtl"` صراحة على الحاوية الجذر أيضاً كطبقة أمان إضافية.
- كل النصوص عربية فصحى بلمسة ودّية (وليست رسمية جامدة)، مع إيموجي وظيفي (🏥 📅 💊 🎉 ⚠️) لتعزيز المعنى لا للزخرفة العشوائية.
- **التواريخ**: دائماً `toLocaleDateString('ar-EG', { numberingSystem: 'latn' })` — أي عربي في الصياغة لكن **أرقام إنجليزية (لاتينية)**، أبداً أرقام هندية عربية. لا تُنسّق تاريخاً بدون `numberingSystem: 'latn'`.
- الأرقام في الواجهة (إحصائيات، قياسات) تأخذ كلاس `tabular-nums` لضمان محاذاة الأرقام.

### 5.3 لوحة الألوان
- **الأساس المحايد**: `slate` (50 → 900) للخلفيات، الحدود، والنصوص الثانوية. `slate-900` هو اللون شبه-الأسود المهيمن على الأزرار الأساسية والشعار.
- **لون العلامة التجارية الأساسي**: `#2563EB` (أزرق) — يظهر في نقطة الشعار وبعض الروابط (صفحة تسجيل الدخول، الهيدر).
- **لون الهوية الثانوي/الطبي**: `teal` (400–800) — يُستخدم بكثافة في صفحات الصيدلية (بادجات، أزرار متدرّجة `from-slate-900 to-teal-800`، حدود بطاقات).
- **ألوان دلالية** (حالة/تنبيه) تتبع دائماً نفس القاعدة: خلفية فاتحة جداً + حد بنفس العائلة + نص غامق من نفس العائلة:
  - نجاح/طبيعي/نشط → `emerald` (`bg-emerald-50 border-emerald-200 text-emerald-700`)
  - تحذير/قريب الانتهاء → `amber` (مع `animate-pulse` على نقطة الحالة عند الحاجة)
  - خطر/خطأ/موقوف → `rose`
  - معلومة عامة/ضغط الدم → `blue`
  - الوزن → `purple`
- لا تستخدم ألوان عشوائية خارج `slate/teal/emerald/amber/rose/blue/purple` — التزم بهذه العائلة.

### 5.4 المكوّنات والأنماط المتكررة
- **البطاقات**: `bg-white border border-slate-200 rounded-2xl` أو `rounded-3xl` للأقسام الرئيسية، `shadow-sm` افتراضياً و`hover:shadow-md` عند القابلية للنقر.
- **الأزرار الأساسية**: تدرّج `bg-gradient-to-l from-slate-900 to-teal-800 hover:from-slate-800 hover:to-teal-700 text-white rounded-xl`، مع `active:scale-95` أو `active:scale-[0.98]` كتأثير ضغط، و`disabled:opacity-50/60 disabled:cursor-not-allowed`.
- **الأزرار الثانوية**: `bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl`.
- **الحقول (inputs)**: `border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none` — تركيز بلون slate-900 وليس أزرق افتراضي المتصفح.
- **الأزرار كلها `cursor-pointer` صراحة** حتى لو كانت `<button>` — لا تنسَ هذا الكلاس.
- **حالات التحميل**: سبينر دائري بسيط (`border-4 border-slate-200 border-t-teal-600 rounded-full animate-spin`) + نص عربي مثل "جاري التحقق...". لا مكتبات تحميل خارجية.
- **المودالات**: `fixed inset-0 bg-slate-900/40 backdrop-blur-sm` كخلفية، البطاقة بيضاء `rounded-2xl shadow-2xl`، على الموبايل غالباً `items-end` (تنزلق من الأسفل) وعلى الديسكتوب `items-center`.
- **الأنيميشن**: كلاسات مخصّصة بسيطة معرّفة داخل `<style jsx global>` لكل صفحة (`saasSlideUp`, `dropdownFade`) — لا مكتبة أنيميشن خارجية (لا framer-motion).
- **أزرار واتساب**: دائماً أيقونة SVG مخصّصة لواتساب (path ثابت مستخدم في كل مكان)، خلفية `bg-slate-900 hover:bg-slate-800` (وليس أخضر واتساب التقليدي) — التزم بهوية العلامة التجارية لا بهوية واتساب.

### 5.5 الشعار
مسار SVG موحّد يتكرر حرفياً في كل مكان يظهر فيه الشعار (تسجيل الدخول، الهيدر، صفحات المريض العامة):
```
<path d="M6 8L14.5 25C14.8 25.6 15.6 25.6 15.9 25L20 17" stroke="..." strokeWidth="3.5" strokeLinecap="round" />
<path d="M24 6C24 9.3 26.7 12 30 12C26.7 12 24 14.7 24 18C24 14.7 21.3 12 18 12C21.3 12 24 9.3 24 6Z" fill="#0D9488 أو #2563EB" />
```
لا تُعِد رسم الشعار من الصفر — انسخ هذا الـ path الثابت.

## 6. قواعد الكود

- **كل صفحة تفاعلية هي `'use client'`** — لا يوجد أي استخدام لـ Server Components أو Server Actions في المشروع حالياً. النمط الثابت: `useEffect` لجلب البيانات عبر `fetch`/`supabase` عند التحميل، `useState` للحالة، لا React Query ولا SWR.
- **Dynamic route params في هذا الإصدار من Next.js تصل كـ `Promise`** — دائماً `params: Promise<{ id: string }>` واستخدم `use(params)` (من React) في client components، أو `await params` في route handlers. هذا نمط ثابت في كل الملفات — لا تكتب `params: { id: string }` مباشرة.
- **التعليقات بالعربية** وتشرح "لماذا" لا "ماذا" — خصوصاً القرارات الأمنية أو الحالات غير البديهية (مثال: لماذا `/api/visit/[id]` عام، لماذا `paid_amount` لا يتجاوز `total_amount_due`). اتبع نفس الأسلوب عند إضافة كود جديد يحتاج تعليقاً.
- **أسماء الحقول القديمة/الجديدة**: بعض الجداول فيها عمود قديم وآخر أحدث لنفس المعنى (مثال: `pharmacies.name` هو الرسمي الحالي، `pharmacies.pharmacy_name` قديم/احتياطي). النمط الثابت: `data.name || data.pharmacy_name || fallback` — الأولوية دائماً للعمود الأحدث. لا تحذف الاعتماد على العمود القديم دون التأكد من عدم وجود بيانات تعتمد عليه فقط.
- **توحيد اسم الصيدلية**: يُعرض دائماً بصيغة "صيدلية X" — إن كان الاسم المخزّن لا يبدأ بكلمة "صيدلية" تُضاف تلقائياً بالكود (`name.startsWith('صيدلية') ? name : `صيدلية ${name}``)، هذا يتكرر في أكثر من مكان (منطق العرض ومنطق الحفظ) — حافظ على نفس السلوك عند التعديل.
- **أرقام الهواتف**: تُطبَّع بصيغتين حسب الاستخدام — محلية أردنية (`07...`) للتخزين/العرض، ودولية (`9627...`) لروابط واتساب (`phone.startsWith('0') ? '962' + phone.substring(1) : phone`). استخدم نفس منطق التطبيع الموجود بدل إعادة اختراعه.
- **لا مكتبة state management خارجية** — الحالة العابرة بين المكوّنات (مثل "الصيدلاني النشط حالياً") تُدار عبر `localStorage` + `CustomEvent` (`window.dispatchEvent`/`addEventListener`) للمزامنة الفورية داخل نفس التبويب، و`storage` event للمزامنة بين تبويبات. راجع `getActivePharmacist`/`setActivePharmacist` في `DashboardHeader.tsx` قبل إضافة أي حالة مشابهة.
- **توليد PDF**: يتم بالكامل في المتصفح (client-side) عبر إنشاء `<div>` مخفي (`position: fixed; top: -99999px`)، تعبئته بـ HTML خام (`innerHTML`)، تحويله لصورة بـ `html2canvas-pro` ثم تجميعه في `jspdf`. لا معالجة PDF على الخادم إطلاقاً.
- **لا تخلط بين `supabase` و`supabaseAdmin`** (راجع قسم 3.1) — هذا هو الخطأ الأمني الأخطر المحتمل في هذا المشروع.
- **الحماية في API routes الخاصة بالأدمن إلزامية** — أي route جديد تحت `src/app/api/admin/**` يجب أن يبدأ بـ `const auth = await verifyPlatformAdmin(request); if (!auth.authorized) return auth.response;` قبل أي منطق آخر.
- **الحقول المعادة من API عام يجب أن تكون محدودة صراحة** — عند كتابة `.select(...)` في route عام (بلا تسجيل دخول)، اذكر أسماء الأعمدة المطلوبة فقط، لا `select('*')` — حتى لا تتسرب حقول حساسة (مثل بيانات مالية للصيدلية) لصفحة يفتحها مريض غير مسجّل.

## 7. متغيرات البيئة (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # سرّي — API routes فقط، لا يُعرَّض للـ client أبداً
GEMINI_API_KEY=
GEMINI_MODEL=                   # اختياري — لتجاوز قائمة النماذج الافتراضية
NEXT_PUBLIC_MSG_EXPIRY_DAYS=
```

## 8. أوامر التطوير

```
npm run dev     # يقتل أي عملية على المنفذ 3000 أولاً ثم next dev -H 0.0.0.0 -p 3000
npm run build   # next build
npm run lint    # eslint
```

## 9. تعليمات إلزامية للـ Agent

- قبل استخدام أي API غير مألوف من Next.js (routing, params, metadata, caching...) — تحقق من `node_modules/next/dist/docs/` أولاً، هذا إصدار بتغييرات جذرية عن المعتاد.
- أي صفحة جديدة يفتحها **مريض** بدون تسجيل دخول يجب أن تُبنى خارج `/dashboard` تماماً، وتُقرأ بياناتها من route عام في `src/app/api/**` يستخدم `supabaseAdmin` ويُعيد فقط الحقول اللازمة — اتبع نمط `vitals/view/[id]` أو `weight/[planId]` حرفياً.
- لا تُنشئ صفحة جديدة تحت `/dashboard` وتفترض أنها ستكون عامة — الحارس في `dashboard/layout.tsx` يشمل كل شيء تحته بلا استثناء.
- التزم بلوحة الألوان ونمط المكوّنات الموصوفين في القسم 5 — لا تُدخل مكتبة UI جديدة أو نظام ألوان مختلف دون طلب صريح من المستخدم.
- حافظ على أسلوب التعليقات العربية المُفسِّرة لـ"لماذا" عند إضافة منطق غير بديهي، خصوصاً في القرارات الأمنية.
- لا تُبدّل `supabase` بـ `supabaseAdmin` أو العكس دون التأكد من السياق (client component مقابل route handler).

## قواعد العمل (Anas)

### قبل أي تعديل
- الوضع دائماً manual. اعرض الكود المقترح واستأذن قبل التطبيق.
- إن لم تجد الكود الموصوف بالضبط، توقّف وأخبرني. لا تخمّن ولا
  تعدّل شيئاً مشابهاً.
- التزم بالكلاسات والألوان الموجودة فعلاً في الملف. إن اختلف
  الوصف عن الموجود، فالكود هو المرجع — أخبرني بالفرق أولاً.

### حدود التعديل
- لا تغيّر منطق العمل (حسابات، استعلامات Supabase، معالجة
  تواريخ، دوال واتساب) إلا بطلب صريح.
- لا تضف أي حزمة npm جديدة.
- لا تلمس صفحات أو ملفات غير المطلوبة.

### نظام التصميم (صارم)
- teal/slate فقط. rounded-2xl للبطاقات.
- خط IBM Plex Sans Arabic. أيقونات Heroicons بـ strokeWidth 1.5.
- الواجهة RTL. النص الإنجليزي داخل dir="ltr" منفصل.
- لا نصوص عامية. فصحى مهنية دائماً.

### بعد التعديل
- أعطني الملف المعدّل، ولخّص التغيير في سطرين.
- شغّل tsc --noEmit وأكّد صفر أخطاء.
- للمراجعة: git diff [الملف] > review.txt

### الحفظ والنشر (مهم)
- بعد كل تعديل ناجح: git add -A ثم git commit — لا push.
- لا تنفّذ git push إطلاقاً إلا بطلب صريح مني. push ينشر
  مباشرة على الموقع الحي.

### توفير التوكنز
- برومبتاتي قد تكون مختصرة. طبّق المطلوب دون شرح مطوّل.
- لا تعِد قراءة ملفات كبيرة إن لم تتغيّر.
- اكتب خططك الطويلة في plan.md (استبدل محتواه)، لا في الطرفية.
