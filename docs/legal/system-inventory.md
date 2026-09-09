# جرد النظام التقني — Vitalix.ai

> هذا الملف مبني آلياً من الكود الفعلي في المستودع بتاريخ إعداده. كل معلومة هنا مستخرجة مباشرة من `package.json`، `git log`، `supabase/migrations/`، و`src/`. أي معلومة لم تُوجد في الكود كُتبت حرفياً "غير موجود في الكود" ولم تُخمَّن.

---

## 1. معلومات المشروع

| الحقل | القيمة |
|---|---|
| اسم المشروع (`package.json` → `name`) | `vitalix-ai` |
| الإصدار (`package.json` → `version`) | `0.1.0` |
| آخر commit — الرمز الكامل | `fe69519612970276a4b441bfe8df9455d70ded88` |
| آخر commit — الرمز المختصر | `fe69519` |
| آخر commit — التاريخ | `2026-09-07 21:36:15 +0000` |

---

## 2. التقنيات

**إطار العمل:** Next.js، الإصدار `16.2.10` (App Router + Turbopack، حسب `AGENTS.md` ومطابق لسكربتات `package.json`).
**اللغة:** TypeScript (إصدار الحزمة `^5` في `devDependencies`).
**React:** `19.2.4` (مع `react-dom` بنفس الإصدار).

### أهم المكتبات (dependencies) — بأرقام الإصدارات كما في `package.json`

| الحزمة | الإصدار |
|---|---|
| `@google/genai` | `^2.13.0` |
| `@phosphor-icons/react` | `^2.1.10` |
| `@supabase/supabase-js` | `^2.110.7` |
| `html2canvas-pro` | `^2.3.2` |
| `jspdf` | `^4.2.1` |
| `jspdf-autotable` | `^5.0.8` |
| `next` | `16.2.10` |
| `react` | `19.2.4` |
| `react-dom` | `19.2.4` |
| `recharts` | `^3.10.1` |

### أدوات التطوير (devDependencies)

| الحزمة | الإصدار |
|---|---|
| `@tailwindcss/postcss` | `^4` |
| `@types/node` | `^20` |
| `@types/react` | `^19` |
| `@types/react-dom` | `^19` |
| `eslint` | `^9` |
| `eslint-config-next` | `16.2.10` |
| `supabase` | `^2.115.0` |
| `tailwindcss` | `^4` |
| `typescript` | `^5` |

**العدد الكلي للمكتبات المصرَّح بها في `package.json`:** 19 (10 في `dependencies` + 9 في `devDependencies`).

---

## 3. قاعدة البيانات

المصدر: `supabase/migrations/` (10 ملفات migration، أولها `20260826061249_remote_schema.sql` يحمل المخطط الأساسي الكامل، والباقي تعديلات لاحقة بإضافة أعمدة).

**العدد الكلي للجداول:** 19، وكلها بحالة **RLS مفعّل** (`ENABLE ROW LEVEL SECURITY` موجود لكل جدول في الملف الأساسي — تحقّق حرفي، لا استنتاج).

| الجدول | الوظيفة (حسب الأعمدة) | RLS مفعّل | سياسات RLS معرَّفة؟ |
|---|---|---|---|
| `activity_log` | سجل أحداث نشاط الموظفين داخل الصيدلية (دخول، فتح تذكير، عدم إرسال) | نعم | نعم — قراءة للمالك فقط لصيدليته |
| `admin_audit_log` | سجل تدقيق لإجراءات مسؤولي المنصة (`actor_id`, `action`, `pharmacy_id`, `details`) | نعم | **لا توجد سياسة معرَّفة** — الوصول عبر service role فقط |
| `birthday_greetings` | تسجيل تهنئة عيد ميلاد أُرسلت لمريض (لمنع تكرارها في نفس اليوم) | نعم | نعم — إدراج/قراءة ضمن الصيدلية نفسها |
| `chronic_medications` | أدوية المريض المزمنة، جرعاتها، ومواعيد التجديد القادمة | نعم | نعم — قراءة/كتابة ضمن الصيدلية نفسها |
| `feedback` | ملاحظات/شكاوى الصيدليات المرسلة لمسؤولي المنصة مع حالة معالجتها | نعم | نعم — الصيدلية ترى ملاحظاتها، الأدمن يرى ويعالج الكل |
| `patients` | بيانات المريض الأساسية: الاسم، الهاتف، الجنس، تاريخ الميلاد، الطول، الأمراض المزمنة المشخّصة | نعم | نعم — قراءة/كتابة ضمن الصيدلية نفسها |
| `pharmacies` | حساب الصيدلية: الاسم، بيانات المالك، حالة الاشتراك، المبالغ المستحقة/المدفوعة، الكود القصير للدخول | نعم | نعم — المالك يقرأ/يعدّل صيدليته، الأدمن يرى الكل |
| `pharmacy_catalog` | كتالوج أجهزة/منتجات الصيدلية المعروضة كتوصيات للمريض | نعم | نعم — قراءة/كتابة ضمن الصيدلية نفسها |
| `pharmacy_devices` | أجهزة/جلسات مسجَّلة للصيدلية عبر `token_hash` مع وقت آخر ظهور وإمكانية الإلغاء | نعم | **لا توجد سياسة معرَّفة** — الوصول عبر service role فقط |
| `pharmacy_groups` | تجميع عدّة صيدليات تحت مجموعة واحدة (اسم المجموعة وبريد المالك) | نعم | **لا توجد سياسة معرَّفة** — الوصول عبر service role فقط |
| `pharmacy_recommendations` | توصيات مكمّلات غذائية مرتبطة بخطط الوزن، مصنَّفة ضمن فئات ثابتة (`b12`, `omega3`, `fiber`...) | نعم | نعم — قراءة ضمن الصيدلية، كتابة للمالك/الصيدلاني فقط |
| `pharmacy_staff` | موظفو الصيدلية: الاسم، الدور (`owner`/`pharmacist`/`assistant`/`staff`)، رابط دخول (`login_slug`)، حالة تفعيل، إلزامية تغيير PIN | نعم | نعم — قراءة ضمن الصيدلية، كتابة للمالك فقط |
| `pharmacy_usage_daily` | إحصائيات استخدام يومية للصيدلية: عدد الأجهزة، الموظفين، المرضى المُضافين، ذروة التزامن | نعم | **لا توجد سياسة معرَّفة** — الوصول عبر service role فقط |
| `platform_admins` | حسابات مسؤولي المنصة، أدوارهم (`super_admin`/`support_admin`/`admin`)، وصلاحياتهم | نعم | نعم — كل مستخدم يرى دوره فقط |
| `refill_tracking_pipeline` | تتبّع مسار تجديد صرف الدواء لكل مريض عبر مراحل (تأمين/نقدي، حالة الرفض، نسبة/قيمة المشاركة) | نعم | نعم — قراءة/كتابة ضمن الصيدلية نفسها |
| `staff_audit_log` | سجل تدقيق لإجراءات الموظفين (`actor_id`, `action`, `target_id`, `details`) | نعم | **لا توجد سياسة معرَّفة** — الوصول عبر service role فقط |
| `staff_login_attempts` | عدّاد محاولات دخول فاشلة وقفل مؤقت (`locked_until`) لكل مستخدم موظف | نعم | **لا توجد سياسة معرَّفة** — الوصول عبر service role فقط |
| `visitations` | سجل الفحوصات الحيوية (ضغط، سكري، وزن، نبض)، عوامل السياق، التصنيفات الطبية المعتمدة، وتقرير الذكاء الاصطناعي | نعم | نعم — قراءة/كتابة ضمن الصيدلية نفسها |
| `weight_plans` | خطط إدارة الوزن المولَّدة بالذكاء الاصطناعي (BMI، الوزن المثالي، خطة التغذية) وتتبّع تقدّم المريض | نعم | نعم — قراءة/كتابة ضمن الصيدلية نفسها |

**ملاحظة أمنية مستخرَجة من الكود:** ستة جداول (`admin_audit_log`, `pharmacy_devices`, `pharmacy_groups`, `pharmacy_usage_daily`, `staff_audit_log`, `staff_login_attempts`) لديها RLS مفعّل لكن بلا أي سياسة `CREATE POLICY` مطابقة لها في ملف المخطط — أي أنها مغلقة بالكامل أمام مفتاحي `anon` و`authenticated`، ولا يمكن الوصول إليها إلا عبر مفتاح service role من route handlers الخادم.

---

## 4. الصفحات والمسارات (`src/app`)

**العدد الكلي:** 19 صفحة (`page.tsx`) + 19 مسار API (`route.ts`) = 38 ملف مسار.

### الصفحات (`page.tsx`)

| المسار | الوصف |
|---|---|
| `/` | تسجيل الدخول (صيدلية أو أدمن)، يتحقق من `platform_admins` بعد الدخول ويوجّه لـ `/admin` أو `/dashboard` |
| `/admin` | لوحة الأدمن: إدارة الصيدليات، تجديد الاشتراكات، إدارة الأدمنز، صندوق الملاحظات |
| `/admin/pharmacies/[id]` | تفاصيل صيدلية واحدة من منظور الأدمن |
| `/auth/confirm` | صفحة تأكيد بعد رابط بريد إلكتروني من Supabase Auth |
| `/change-pin` | تغيير PIN الموظف (يُفرض عند أول دخول أو بعد إعادة تعيين) |
| `/dashboard` | الرئيسية: إحصائيات، أعياد ميلاد، تذكيرات أدوية مزمنة |
| `/dashboard/activity` | سجل نشاط الموظفين داخل الصيدلية |
| `/dashboard/chronic` | إدارة الأدوية المزمنة ومواعيد التجديد |
| `/dashboard/patients` | قائمة مرضى الصيدلية |
| `/dashboard/patients/[id]` | ملف مريض واحد وسجل زياراته |
| `/dashboard/pharmacy-catalog-manager` | إدارة كتالوج أجهزة/منتجات الصيدلية |
| `/dashboard/profile` | الملف الشخصي للصيدلية |
| `/dashboard/vitals` | تسجيل فحص حيوي جديد لمريض وتوليد تقرير AI وإرسال واتساب |
| `/dashboard/vitals/summary/[id]` | ملخص/مراجعة لزيارة فحص حيوي |
| `/forgot-password` | طلب استعادة كلمة مرور صاحب الصيدلية |
| `/staff-login` | تسجيل دخول الموظف عبر كود الصيدلية + اختيار الاسم + PIN |
| `/update-password` | تعيين كلمة مرور جديدة (بعد رابط استعادة أو إجبار أول دخول) |
| `/vitals/view/[id]` | صفحة عامة بلا تسجيل دخول: تقرير فحص حيوي واحد للمريض (رابط واتساب) |
| `/weight/[planId]` | صفحة عامة بلا تسجيل دخول: خطة إنقاص وزن للمريض (رابط واتساب) |

### مسارات API (`route.ts`)

| المسار | الفعل | الوصف |
|---|---|---|
| `/api/activity/log` | POST | تسجيل حدث نشاط محدود لقائمة أفعال مغلقة (`reminder_opened`, `reminder_not_sent`) |
| `/api/admin/admins-list` | GET | قائمة مسؤولي المنصة — محمي بـ `verifyPlatformAdmin` |
| `/api/admin/create-pharmacy` | POST | إنشاء صيدلية جديدة (حساب Auth + صف `pharmacies` + صف مالك في `pharmacy_staff`) — محمي |
| `/api/admin/create-platform-admin` | POST | إنشاء حساب مسؤول منصة جديد — محمي |
| `/api/admin/manage-pharmacy` | PUT / DELETE | تعديل بيانات صيدلية (مع فحص `paid_amount ≤ total_amount_due`) أو أرشفتها وحظر حساب Auth — محمي |
| `/api/admin/pharmacies-list` | GET | قائمة كل الصيدليات — محمي |
| `/api/admin/pharmacy-detail/[id]` | GET | تفاصيل صيدلية واحدة مع البريد الإلكتروني وإحصائيات، عبر service role لتجاوز قيود RLS على الأدمن — محمي |
| `/api/generate-ai-pitch` | POST | توليد نص تسويقي بالذكاء الاصطناعي لمنتج في كتالوج الصيدلية (بلا بيانات مريض) |
| `/api/generate-ai-report` | POST | توليد تقرير طبي بالذكاء الاصطناعي لزيارة فحص حيوي، مع ملخص داخلي للصيدلاني |
| `/api/pharmacy/rotate-code` | POST | توليد كود قصير جديد لدخول الموظفين — للمالك فقط |
| `/api/staff` | POST / GET | إنشاء موظف جديد (حساب Auth + PIN) أو جلب قائمة موظفي الصيدلية — للمالك فقط |
| `/api/staff/[id]` | DELETE | حذف/تعطيل موظف — للمالك فقط |
| `/api/staff/[id]/reset-pin` | PUT | إعادة تعيين PIN موظف — للمالك فقط |
| `/api/staff/[id]/status` | PATCH | تفعيل/تعطيل حساب موظف — للمالك فقط |
| `/api/staff/change-pin` | POST | تغيير الموظف لـ PIN الخاص به بنفسه |
| `/api/staff/login` | POST | تسجيل دخول الموظف عبر (كود الصيدلية + slug + PIN) مع قفل تصاعدي على المحاولات الفاشلة |
| `/api/staff/roster` | GET | مسار عام يعرض أسماء موظفي صيدلية فقط (بلا معرّفات) ليختار الموظف اسمه قبل إدخال PIN |
| `/api/visit/[id]` | GET | مسار عام (service role): تفاصيل زيارة + سجل المريض + توصيات الكتالوج |
| `/api/weight-plan` | POST / PATCH / PUT / GET | إنشاء خطة وزن، توليد خطة تغذية بالذكاء الاصطناعي، حفظ استبعادات الصيدلاني، وجلب الخطة (GET عام بلا مصادقة لصفحة المريض) |

---

## 5. الخدمات الخارجية

مستخلصة من الكود الفعلي وأسماء متغيرات البيئة (القيم نفسها غير مذكورة، حسب القيد المطلوب):

| الخدمة | الدليل في الكود | متغيرات البيئة ذات الصلة (أسماء فقط) |
|---|---|---|
| Supabase (قاعدة بيانات Postgres + Auth) | `@supabase/supabase-js` في `src/lib/supabase.ts` و`src/lib/supabase-admin.ts` وكل route handlers | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Google Gemini (عبر `@google/genai`) | `src/app/api/generate-ai-report/route.ts`, `generate-ai-pitch/route.ts`, `weight-plan/route.ts` | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| WhatsApp | روابط `wa.me` / `api.whatsapp.com` مباشرة (لا SDK ولا API رسمي) في عدة صفحات (`vitals/view/[id]`, `weight/[planId]`, `dashboard/vitals`, `dashboard/chronic`, إلخ) | لا يوجد متغير بيئة مخصّص |
| Google Fonts (CDN) | `@import url('https://fonts.googleapis.com/...')` داخل `<style jsx global>` في معظم الصفحات، لتحميل خطي IBM Plex Sans Arabic وPlus Jakarta Sans | لا يوجد متغير بيئة مخصّص |

متغيرات بيئة إضافية غير مرتبطة بخدمة خارجية (تحكم في سلوك داخلي فقط): `NEXT_PUBLIC_MSG_EXPIRY_DAYS`, `NEXT_PUBLIC_NO_RESPONSE_ARCHIVE_DAYS`, `PLATFORM_ADMIN_EMAILS`.

---

## 6. الذكاء الاصطناعي

### أماكن الاستخدام والموديل

قائمة الموديلات المستخدمة حرفياً كما في الكود (نفس القائمة مكرَّرة في الملفات الثلاثة):
```
GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean)
```
أي: يُستخدم `GEMINI_MODEL` من البيئة إن كان معرَّفاً، وإلا يُجرَّب `gemini-3.6-flash` أولاً ثم `gemini-3.5-flash-lite` عند فشل الأول (404).

| الملف | وظيفة الـ agent |
|---|---|
| `src/app/api/generate-ai-report/route.ts` | يُولّد تقرير المريض الطبي (فقرة نثرية واحدة تشرح قراءات الفحص الحيوي بأسلوب ودود)، عبر طلبين متتاليين لنفس الموديل: توليد خام ثم "تنقيح/ضغط" النص. يُولّد أيضاً — بطلب JSON منفصل بنفس الموديل — ملخصاً سريرياً داخلياً للصيدلاني (`pharmacist_summary`) وتنبيه تداخل دوائي (`medications_alert`) |
| `src/app/api/generate-ai-pitch/route.ts` | يُولّد نصاً تسويقياً قصيراً (40–70 كلمة) لمنتج في كتالوج الصيدلية، مع تحليل صورة المنتج إن وُجدت (Vision) |
| `src/app/api/weight-plan/route.ts` | يُولّد خطة تغذية/إدارة وزن (JSON بنية مكمّلات مقترحة) بناءً على بيانات المريض والتفاعلات الدوائية المطابَقة بالكود مسبقاً (لا يُترك للنموذج استنتاجها) |

### ما يُرسَل للنموذج وما لا يُرسَل

**يُرسَل فعلياً ضمن نص الطلب (prompt) لـ Gemini:**
- `generate-ai-report`: اسم المريض، اسم الصيدلية، الجنس، العمر (وفئته العمرية)، الحالة السريرية المبنية من الأمراض المزمنة المشخَّصة وتأكيد أخذ الدواء، قراءات الضغط/النبض/السكر/الوزن الحالية، مؤشر كتلة الجسم المحسوب، الأعراض، عوامل خارجية (منبهات، مجهود، وجبة دسمة، توتر)، وحتى 3 زيارات سابقة مماثلة للمقارنة.
- `generate-ai-pitch`: فئة المنتج، اسم الماركة، وصورة المنتج إن وُجدت — **لا بيانات مريض إطلاقاً**.
- `weight-plan` (PATCH): اسم المريض، الجنس، العمر، الوزن والطول وBMI الحاليين، الأمراض المزمنة، أسماء الأدوية المزمنة، حقائق التفاعلات الدوائية الغذائية المطابَقة مسبقاً بالكود، بيانات تقدّم الوزن عبر الزيارات، واسم الصيدلية.

**لا يُرسَل لـ Gemini في أي من المسارات الثلاثة (حسب قراءة الحقول الفعلية في كل route):**
- رقم هاتف المريض (`phone_number`) — يصل إلى الخادم ضمن كائن المريض الكامل من الواجهة، لكن route الذكاء الاصطناعي لا يقرأه ولا يُدرجه في نص الطلب.
- عنوان الصيدلية أو بريدها الإلكتروني أو بياناتها المالية.
- `pharmacist_summary` و`medications_alert` المحفوظان مسبقاً (يُعاد توليدهما، لا تُعاد قراءتهما كمدخل).

---

## 7. المصادقة والأمان

### آلية تسجيل الدخول

- **الصيدلية (المالك):** حساب Supabase Auth عادي (`supabase.auth.signInWithPassword`)، حيث `pharmacies.id = auth.users.id` مباشرة (لا جدول ربط). صف `pharmacy_staff` بدور `owner` يُنشأ تلقائياً معه.
- **الموظف:** لا بريد إلكتروني ولا كلمة مرور تقليدية من منظور المستخدم — يُدخل: كود الصيدلية القصير (`pharmacies.short_code`) + اسمه (يختاره من قائمة عبر `login_slug`) + رمز PIN من 6 أرقام. خلف الكواليس (`/api/staff/login`) يُبنى بريد داخلي للموظف ويُستخدم PIN ككلمة مرور Supabase Auth فعلية عبر `signInWithPassword`، مع قفل تصاعدي (`staff_login_attempts.locked_until`) بعد محاولات فاشلة متكررة.
- **مسؤول المنصة (Admin):** حساب Supabase Auth عادي أيضاً، يُميَّز بوجود صف له في جدول `platform_admins`.
- **المريض:** لا حساب إطلاقاً — يصل لبياناته عبر رابط عام يحمل UUID عشوائياً غير قابل للتخمين (`/vitals/view/[id]`, `/weight/[planId]`)، بلا أي تسجيل دخول.

### الأدوار والصلاحيات

الأدوار المعرَّفة في قيد `pharmacy_staff_role_chk`: `owner`, `pharmacist`, `assistant`, `staff`. الدور والانتماء لصيدلية يُخزَّنان في `app_metadata` الخاص بتوكن Supabase Auth (`{ pharmacy_id, role }`) — تُقرآن من التوكن حصراً في كل من: سياسات RLS (عبر دالتي `current_pharmacy_id()` و`current_role_name()`) ومسارات API للموظفين (كل مسار يبدأ بدالة `verifyOwner` تتحقق أن `role === 'owner'`). أدوار مسؤولي المنصة المنفصلة (`super_admin`, `support_admin`, `admin`) مقيَّدة بقيد `platform_admins_role_check` وتُتحقَّق عبر `verifyPlatformAdmin` في `src/lib/verify-admin.ts` باستخدام `Authorization: Bearer <access_token>`.

### عزل بيانات الصيدليات عن بعضها (Multi-tenancy)

العزل يعتمد على طبقتين متوازيتين:
1. **RLS على مستوى قاعدة البيانات:** دالة `current_pharmacy_id()` (SQL، `SECURITY DEFINER`) تعيد `pharmacy_id` فقط إن كان هناك صف نشط (`is_active = true`) في `pharmacy_staff` يطابق `auth.uid()` **و** يطابق `pharmacy_id` المذكور في `app_metadata` للتوكن نفسه — أي تحقق مزدوج (من جدول حقيقي + من التوكن) قبل السماح بأي قراءة/كتابة. كل الجداول ذات البيانات التشغيلية (`patients`, `visitations`, `weight_plans`, `chronic_medications`, `pharmacy_catalog`, `pharmacy_staff`, `pharmacy_recommendations`, `refill_tracking_pipeline`, `birthday_greetings`) مقيَّدة بسياسة `pharmacy_id = current_pharmacy_id()`.
2. **service role في route handlers:** أي مسار API يستخدم `supabaseAdmin` (يتجاوز RLS بالكامل) يجب أن يُصفّي يدوياً بـ `pharmacy_id` المستخرج من التوكن (مسارات الموظفين) أو `verifyPlatformAdmin` (مسارات الأدمن) — لا يوجد فرض تلقائي من قاعدة البيانات في هذه الحالة، الاعتماد على منطق الكود نفسه.

المسارات العامة (`/api/visit/[id]`, `/api/weight-plan` GET, `/api/staff/roster`) لا تتحقق من صيدلية المستخدم إطلاقاً لأنها بلا مستخدم أصلاً — الأمان فيها يعتمد بدلاً من ذلك على أن المعرّف (UUID أو كود قصير) غير قابل للتخمين، وعلى تحديد صريح للحقول المُعادة (لا `select('*')`).

---

## 8. التخزين

**Storage bucket واحد فقط موجود في الكود:** `catalog-images` — مستخدَم حصراً في `src/components/ImageUploadField.tsx` (`supabase.storage.from('catalog-images')`) لرفع وعرض صور منتجات/أجهزة كتالوج الصيدلية (`pharmacy_catalog.image_url`).

لم يُعثر في الكود على أي bucket آخر أو نوع ملفات آخر مخزَّن في Supabase Storage. توليد ملفات PDF (تقارير/فواتير) يتم بالكامل على المتصفح (client-side عبر `html2canvas-pro` + `jspdf`) ولا يُخزَّن الناتج على الخادم أو في أي bucket — غير موجود في الكود.
