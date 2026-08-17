-- ============================================================================
-- Vitalix.ai — توثيق بنية قاعدة البيانات (Database Schema)
-- ============================================================================
-- هذا الملف توثيقي فقط — لا يُشغَّل تلقائياً على قاعدة البيانات، ولا يحتوي
-- على أي بيانات فعلية (صفر صفوف). الهدف: أن يكون مرجعاً حياً بالـ repo لبنية
-- الجداول والفهارس، بدل الاعتماد فقط على لوحة Supabase الخارجية.
--
-- تم توليده يدوياً من فحص information_schema.columns و pg_indexes بتاريخ
-- 2026-08-17. أي تعديل لاحق على البنية الفعلية بـ Supabase يجب أن يُنعكس هنا
-- يدوياً أيضاً — هذا الملف لا يتزامن تلقائياً مع القاعدة الحية.
--
-- انظر AGENTS.md قسم 3 للسياق الأمني الكامل (عميلا Supabase، طبقات الصلاحيات).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- pharmacies — الحساب الأساسي (الصيدلية)
-- ----------------------------------------------------------------------------
-- id هو نفسه auth.users.id (لا جدول ربط منفصل — راجع AGENTS.md قسم 1).
-- تحتوي بيانات مالية حساسة (total_amount_due, paid_amount) — لا تُعرض هذه
-- الأعمدة في أي route عام.
CREATE TABLE public.pharmacies (
    id uuid NOT NULL,                          -- = auth.users.id
    user_id uuid NOT NULL,
    name text NOT NULL,
    pharmacist_name text NOT NULL,
    phone_number text NOT NULL,
    country text NOT NULL,
    city_address text NOT NULL,
    status text NOT NULL,                      -- active / suspended / archived
    subscription_type text NOT NULL,
    total_amount_due numeric NOT NULL,          -- 💰 بيانات مالية — حساسة
    paid_amount numeric NOT NULL,               -- 💰 بيانات مالية — حساسة
    expiry_date date NOT NULL,
    created_at timestamp with time zone,
    second_payment_date date,
    pharmacy_name character varying(255)        -- عمود قديم/احتياطي — الأولوية دائماً لـ name (راجع AGENTS.md قسم 6)
);
-- فهارس: pharmacies_pkey (id) UNIQUE, pharmacies_phone_number_key (phone_number) UNIQUE


-- ----------------------------------------------------------------------------
-- admin_pharmacies_view — عرض (view) مبسّط للصيدليات لواجهة الأدمن
-- ----------------------------------------------------------------------------
-- ⚠️ ملاحظة أمان/أداء: يُستخدم حالياً عبر select('*') في
-- src/app/api/admin/pharmacy-detail/[id]/route.ts (محمي بـ verifyPlatformAdmin،
-- ليس route عام — راجع الفحص الأمني بتاريخ 2026-08-17). يحتوي بيانات مالية
-- وإيميل ورقم هاتف. تضييق select() لأعمدة محددة تحسين مستحسن لاحقاً.
CREATE VIEW public.admin_pharmacies_view AS SELECT
    id uuid,
    name text,
    pharmacist_name text,
    phone_number text,
    country text,
    city_address text,
    status text,
    total_amount_due numeric,                   -- 💰 بيانات مالية
    paid_amount numeric,                         -- 💰 بيانات مالية
    expiry_date date,
    second_payment_date date,
    created_at timestamp with time zone,
    email character varying(255)
FROM ...; -- تعريف الـ view الكامل غير مستخرج هنا — راجع Supabase Dashboard


-- ----------------------------------------------------------------------------
-- patients — المرضى المسجّلون لدى كل صيدلية
-- ----------------------------------------------------------------------------
-- 🩺 بيانات حساسة (صحية + شخصية). محمية بـ RLS عبر pharmacy_id.
-- diagnosed_conditions: مؤكَّد text[] (udt_name = _text)، تحقق مباشر من
-- information_schema بتاريخ 2026-08-17.
CREATE TABLE public.patients (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,                  -- 🔑 مفهرس (idx_patients_pharmacy، أُضيف 2026-08-17)
    name text NOT NULL,
    phone_number text NOT NULL,
    gender text NOT NULL,
    birth_date date NOT NULL,
    height numeric,
    created_at timestamp with time zone,
    diagnosed_conditions text[]                  -- مؤكَّد: text[]
);
-- فهارس: patients_pkey (id) UNIQUE, idx_patients_pharmacy (pharmacy_id)


-- ----------------------------------------------------------------------------
-- chronic_medications — الأدوية المزمنة ومواعيد التجديد
-- ----------------------------------------------------------------------------
-- راجع AGENTS.md ودالة calcNextRefillWithRemaining في dashboard/chronic/page.tsx
-- لمنطق حساب remaining_pills و next_refill_date.
-- ⚠️ تنبيه موثّق: عتبات تصنيف "أيام الإلحاح" (rose/amber/orange) تختلف عمداً
-- بين مواضع العرض المختلفة بهذه الصفحة — هذا تصميم مقصود وليس خطأ، لأن
-- الأقسام تجيب على أسئلة مختلفة (مخزون الصيدلية على الرف مقابل مخزون المريض
-- نفسه) — راجع نقاش الألوان بتاريخ 2026-08-17 قبل "تصحيح" أي عتبة بدون تأكيد.
CREATE TABLE public.chronic_medications (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,                  -- 🔑 مفهرس (idx_chronic_medications_pharmacy، أُضيف 2026-08-17)
    patient_id uuid NOT NULL,
    medication_name text NOT NULL,
    pills_per_box integer NOT NULL,
    boxes_count integer NOT NULL,
    daily_dosage numeric NOT NULL,
    dosage_unit text NOT NULL,
    last_refill_date date NOT NULL,
    next_refill_date date NOT NULL,
    status text NOT NULL,                       -- active / archived
    created_at timestamp with time zone
);
-- فهارس: chronic_medications_pkey (id) UNIQUE, idx_chronic_medications_pharmacy (pharmacy_id)


-- ----------------------------------------------------------------------------
-- visitations — سجلات الفحوصات الحيوية (زيارات المريض)
-- ----------------------------------------------------------------------------
-- 🩺 بيانات صحية حساسة جداً. هذا الجدول هو المصدر لصفحة المريض العامة
-- src/app/vitals/view/[id]/page.tsx (راجع AGENTS.md قسم 3.3 — الأمان هنا
-- يعتمد على عشوائية الـ UUID في الرابط، وليس على RLS/تسجيل دخول).
-- ملاحظة تسمية: اسم الجدول visitations، بينما مسارات الواجهة والصفحات
-- تستخدم مصطلح "vitals" — لا يوجد جدول باسم vitals فعلياً (تم تأكيد هذا
-- بتاريخ 2026-08-17 بعد خطأ "relation vitals does not exist").
CREATE TABLE public.visitations (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,                  -- 🔑 مفهرس (idx_visitations_pharmacy، أُضيف 2026-08-17)
    patient_id uuid NOT NULL,
    bp_systolic integer,
    bp_diastolic integer,
    is_dual_bp boolean,                          -- قياس ضغط مزدوج (متوسط قراءتين)
    sugar_value integer,
    sugar_test_type text,
    weight numeric,
    symptoms text[],                             -- مؤكَّد: text[] (تحقق 2026-08-17)
    had_stimulants boolean,                      -- الحالة الصيامية تعطّل اختيار المنبّهات (راجع AGENTS.md)
    recent_exertion boolean,
    recent_heavy_meal boolean,
    is_stressed boolean,
    took_medication boolean,
    ai_report_output text,                       -- ناتج Gemini بعد المرحلتين (خام + ضغط)
    created_at timestamp with time zone,
    performed_by text,                           -- اسم الصيدلاني المنفّذ (من نظام تبديل الطاقم)
    heart_rate integer,
    took_bp_medication boolean,
    took_sugar_medication boolean
);
-- فهارس: visitations_pkey (id) UNIQUE, idx_visitations_pharmacy (pharmacy_id)


-- ----------------------------------------------------------------------------
-- weight_plans — خطط إنقاص الوزن (وكيل Gemini منفصل تماماً عن تقارير الفحص)
-- ----------------------------------------------------------------------------
-- راجع AGENTS.md: وكيل التغذية/الوزن مستقل بالكامل عن وكيل تقرير الفحوصات
-- الحيوية — قرار معماري متعمّد، لا تدمجهما.
-- هذا الجدول هو المصدر لصفحة المريض العامة src/app/weight/[planId]/page.tsx.
CREATE TABLE public.weight_plans (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,                  -- 🔑 مفهرس (idx_weight_plans_pharmacy)
    patient_id uuid NOT NULL,                    -- 🔑 مفهرس (idx_weight_plans_patient)
    weight_kg numeric NOT NULL,
    height_cm numeric NOT NULL,
    bmi numeric NOT NULL,
    bmi_category text NOT NULL,                  -- تصنيف BMI (يقابل تدرّج teal→amber→orange→rose بالواجهة)
    ideal_weight_min numeric NOT NULL,
    ideal_weight_max numeric NOT NULL,
    target_loss_kg numeric NOT NULL,
    first_goal_kg numeric NOT NULL,
    nutrition_plan text,                         -- خطة التغذية المولّدة بالذكاء الاصطناعي (توليد خلفي + polling)
    plan_generated_at timestamp with time zone,
    performed_by text,
    created_at timestamp with time zone NOT NULL
);
-- فهارس: weight_plans_pkey (id) UNIQUE,
--         idx_weight_plans_pharmacy (pharmacy_id, created_at DESC),
--         idx_weight_plans_patient (patient_id, created_at DESC)


-- ----------------------------------------------------------------------------
-- refill_tracking_pipeline — خط أنابيب تتبّع التأمين/الدفع للتجديدات
-- ----------------------------------------------------------------------------
CREATE TABLE public.refill_tracking_pipeline (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    patient_id uuid NOT NULL,
    payment_type text NOT NULL,
    pipeline_stage text NOT NULL,                -- مؤكد / مؤجل / مؤرشف (راجع لوحة "خط الأنابيب" بصفحة chronic)
    insurance_status text,
    rejection_reason text,
    total_value numeric,
    copay_percent integer,
    copay_amount numeric,
    reminded_at timestamp with time zone,
    updated_at timestamp with time zone,
    cycle_date date NOT NULL
);
-- فهارس: refill_tracking_pipeline_pkey (id) UNIQUE,
--         idx_refill_tracking_pipeline_pharmacy (pharmacy_id) — أُضيف 2026-08-17
-- (نفس أولوية patients/chronic_medications/visitations لأنه مرتبط مباشرة
-- بلوحة "خط الأنابيب" المُستعلَمة بتكرار من واجهة chronic).


-- ----------------------------------------------------------------------------
-- pharmacy_catalog — كتالوج أجهزة/منتجات الصيدلية (حد أقصى 10 عناصر بالتصميم)
-- ----------------------------------------------------------------------------
CREATE TABLE public.pharmacy_catalog (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    category character varying(50) NOT NULL,
    brand_name character varying(150) NOT NULL,
    price numeric NOT NULL,
    image_url text,
    ai_pitch_prompt text NOT NULL,                -- نص تسويقي مولّد بالذكاء الاصطناعي (زر violet بالواجهة)
    is_active boolean,
    created_at timestamp with time zone NOT NULL
);
-- فهارس: pharmacy_catalog_pkey (id) UNIQUE فقط — لا حاجة لفهرس pharmacy_id
-- حالياً بسبب الحد الأقصى المتعمّد (10 عناصر لكل صيدلية).


-- ----------------------------------------------------------------------------
-- pharmacy_recommendations — توصيات المنتجات المطابقة لحالة المريض
-- ----------------------------------------------------------------------------
-- راجع AGENTS.md: المطابقة بين حالة المريض ومنتجات الكتالوج تتم عبر استعلام
-- قاعدة بيانات حتمي (deterministic)، وليس عبر الذكاء الاصطناعي — قرار معماري
-- متعمّد لتجنّب "اختراع" توصيات غير موثوقة طبياً.
CREATE TABLE public.pharmacy_recommendations (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,
    category character varying(50) NOT NULL,
    product_name character varying(200) NOT NULL,
    price numeric NOT NULL,
    image_url text,
    ai_description text NOT NULL,
    is_active boolean,
    created_at timestamp with time zone NOT NULL
);
-- فهارس: pharmacy_recommendations_pkey (id) UNIQUE فقط


-- ----------------------------------------------------------------------------
-- pharmacy_staff — طاقم الصيدلية (نظام "الصيدلاني النشط")
-- ----------------------------------------------------------------------------
-- يُدار جانب العرض عبر localStorage + CustomEvent، راجع
-- getActivePharmacist/setActivePharmacist في DashboardHeader.tsx (AGENTS.md قسم 6).
CREATE TABLE public.pharmacy_staff (
    id uuid NOT NULL,
    pharmacy_id uuid NOT NULL,                   -- 🔑 مفهرس (idx_pharmacy_staff_pharmacy)
    name text NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);
-- فهارس: pharmacy_staff_pkey (id) UNIQUE, idx_pharmacy_staff_pharmacy (pharmacy_id)


-- ----------------------------------------------------------------------------
-- feedback — صندوق ملاحظات/اقتراحات الصيدليات (نظام violet بالواجهة)
-- ----------------------------------------------------------------------------
CREATE TABLE public.feedback (
    id uuid NOT NULL,
    pharmacy_id uuid,                             -- Nullable — تحقق من سبب الإتاحة قبل تعديل
    pharmacy_name text,
    pharmacist_name text,
    type text NOT NULL,                           -- feature / bug / improvement / other (راجع FeedbackInbox.tsx)
    message text NOT NULL,
    rating integer,
    created_at timestamp with time zone NOT NULL,
    is_read boolean NOT NULL,
    is_archived boolean NOT NULL,
    status text NOT NULL,
    admin_note text,
    handled_by text,
    handled_at timestamp with time zone,
    actions jsonb NOT NULL
);
-- فهارس: feedback_pkey (id) UNIQUE فقط — لا يوجد فهرس على pharmacy_id.


-- ----------------------------------------------------------------------------
-- platform_admins — مسؤولو المنصة (Super Admin / support_admin)
-- ----------------------------------------------------------------------------
-- نوعان مؤكَّدان من الأدوار (راجع لوحة /admin بتاريخ 2026-08-17):
--   - "سوبر أدمن" (Super Admin) — غير قابل للحذف
--   - support_admin ("دعم فني")
-- عمود permissions (ARRAY): وجوده مؤكَّد بالبنية، لكن مدى تفعيله الفعلي في
-- منطق الصلاحيات (تفصيل دقيق داخل كل دور، أو أن role النصي هو الفيصل الوحيد)
-- لم يُؤكَّد بعد — راجع مع Anas قبل الاعتماد عليه في أي منطق جديد.
CREATE TABLE public.platform_admins (
    id uuid NOT NULL,
    user_id uuid NOT NULL,                        -- 🔑 UNIQUE — يربط بـ auth.users.id
    role text NOT NULL,                            -- 'super_admin' / 'support_admin' (تأكيد القيم الدقيقة مطلوب)
    permissions text[],                             -- مؤكَّد النوع: text[] (2026-08-17)، مدى التفعيل الفعلي بالمنطق غير مؤكَّد (راجع الملاحظة أعلاه)
    created_at timestamp with time zone,
    name text
);
-- فهارس: platform_admins_pkey (id) UNIQUE, platform_admins_user_id_key (user_id) UNIQUE


-- ----------------------------------------------------------------------------
-- platform_admins_view — عرض (view) مبسّط لمسؤولي المنصة
-- ----------------------------------------------------------------------------
CREATE VIEW public.platform_admins_view AS SELECT
    id uuid,
    user_id uuid,
    role text,
    created_at timestamp with time zone,
    email character varying(255),
    name text
FROM ...; -- تعريف الـ view الكامل غير مستخرج هنا — راجع Supabase Dashboard


-- ============================================================================
-- ملخص الفهارس المفقودة/المرشّحة للمراجعة (بتاريخ 2026-08-17)
-- ============================================================================
-- ✅ تمت معالجتها بتاريخ 2026-08-17:
--    idx_patients_pharmacy, idx_chronic_medications_pharmacy,
--    idx_visitations_pharmacy, idx_refill_tracking_pipeline_pharmacy
--
-- ⚠️ لم تُفحص/تُعالَج بعد (أقل أولوية — واجهة أدمن داخلية، حجم متوقع أصغر
-- بكثير من الجداول المرتبطة بالمرضى/الزيارات مباشرة، يُضاف لاحقاً عند الحاجة):
--    - feedback.pharmacy_id
--
-- ملاحظة عامة: لا يوجد أي pagination أو .limit() في استعلامات المشروع حالياً
-- (فحص شامل لـ 87 استدعاء .from() بتاريخ 2026-08-17) — الاعتماد الكامل على
-- الفلترة والفرز من جانب المتصفح (client-side). يعمل بأمان مع الحجم الحالي؛
-- يستحق المراجعة إذا كبر عدد مرضى/زيارات صيدلية واحدة بشكل كبير.
-- ============================================================================
