-- =====================================================================
-- Vitalix.ai — المرحلة ٤: سياسات RLS مبنية على التوكن
-- نُفّذت على ثلاث دفعات (٩أ · ٩ب · ٩ج) واختُبرت بحسابين حقيقيين
--
-- المبدأ: pharmacy_id يُقرأ من app_metadata داخل JWT، لا من auth.uid()
-- السبب:  auth.uid() = pharmacy_id يصحّ للمالك فقط. بعد إنشاء حسابات
--         الموظفين، مُعرّف سارة ≠ مُعرّف الصيدلية، فينكسر كل عزل قديم.
--
-- كل الأسماء المحذوفة منقولة حرفياً من pg_policies قبل التنفيذ.
-- =====================================================================


-- =====================================================================
-- ٩أ — patients
-- =====================================================================

begin;

drop policy if exists "View own patients only"                    on public.patients;
drop policy if exists "Insert own patients only"                  on public.patients;
drop policy if exists "Update own patients only"                  on public.patients;
drop policy if exists "Delete own patients only"                  on public.patients;
drop policy if exists "Pharmacies can manage their own patients"  on public.patients;

create policy patients_tenant_rw on public.patients
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

commit;


-- =====================================================================
-- ٩ب — ستة جداول بنمط العزل ذاته
-- =====================================================================

begin;

-- visitations --------------------------------------------------------
drop policy if exists "View own visitations only"                    on public.visitations;
drop policy if exists "Insert own visitations only"                  on public.visitations;
drop policy if exists "Update own visitations only"                  on public.visitations;
drop policy if exists "Delete own visitations only"                  on public.visitations;
drop policy if exists "Pharmacies can manage their own visitations"  on public.visitations;

create policy visitations_tenant_rw on public.visitations
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- chronic_medications ------------------------------------------------
drop policy if exists "View own medications only"                            on public.chronic_medications;
drop policy if exists "Insert own medications only"                          on public.chronic_medications;
drop policy if exists "Update own medications only"                          on public.chronic_medications;
drop policy if exists "Delete own medications only"                          on public.chronic_medications;
drop policy if exists "Pharmacies can manage their own chronic medications"  on public.chronic_medications;

create policy chronic_medications_tenant_rw on public.chronic_medications
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- refill_tracking_pipeline -------------------------------------------
drop policy if exists "View own pipeline only"                                    on public.refill_tracking_pipeline;
drop policy if exists "Insert own pipeline only"                                  on public.refill_tracking_pipeline;
drop policy if exists "Update own pipeline only"                                  on public.refill_tracking_pipeline;
drop policy if exists "Delete own pipeline only"                                  on public.refill_tracking_pipeline;
drop policy if exists "Pharmacies can manage their own refill tracking pipeline"  on public.refill_tracking_pipeline;

create policy refill_tracking_pipeline_tenant_rw on public.refill_tracking_pipeline
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- pharmacy_catalog ---------------------------------------------------
drop policy if exists "Pharmacies manage their catalog" on public.pharmacy_catalog;

create policy pharmacy_catalog_tenant_rw on public.pharmacy_catalog
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- pharmacy_recommendations -------------------------------------------
drop policy if exists "Pharmacies can manage their own recommendations" on public.pharmacy_recommendations;

create policy pharmacy_recommendations_tenant_rw on public.pharmacy_recommendations
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

-- weight_plans -------------------------------------------------------
-- ملاحظة: صفحة المريض العامة تمرّ عبر app/api/weight-plan/route.ts
-- باستخدام supabaseAdmin، فهي تتجاوز RLS ولا تتأثّر بهذه السياسة.
drop policy if exists "pharmacy_owns_weight_plans" on public.weight_plans;

create policy weight_plans_tenant_rw on public.weight_plans
  for all to authenticated
  using      (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

commit;


-- =====================================================================
-- ٩ج — feedback و pharmacy_staff (منطق مختلف)
-- =====================================================================

begin;

-- ===== feedback =====
-- السياسة القديمة feedback_insert كان شرطها auth.uid() IS NOT NULL فقط،
-- أي أن أي مستخدم مصادَق يكتب صفاً باسم أي صيدلية. تُغلق هنا.
drop policy if exists feedback_select       on public.feedback;
drop policy if exists feedback_insert       on public.feedback;
drop policy if exists feedback_admin_update on public.feedback;
drop policy if exists feedback_admin_delete on public.feedback;

-- قراءة: الصيدلية ترى ملاحظاتها · أدمن المنصّة يرى الكل
create policy feedback_select on public.feedback
  for select to authenticated
  using (
    pharmacy_id = public.current_pharmacy_id()
    or public.is_platform_admin()
  );

-- إدخال: لصيدليتك فقط
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (pharmacy_id = public.current_pharmacy_id());

-- تعديل/حذف: أدمن المنصّة فقط
-- FeedbackInbox.tsx يستخدم مفتاح anon، فهذه السياسات هي ما يشغّله فعلياً
create policy feedback_admin_update on public.feedback
  for update to authenticated
  using      (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy feedback_admin_delete on public.feedback
  for delete to authenticated
  using (public.is_platform_admin());


-- ===== pharmacy_staff =====
drop policy if exists pharmacy_staff_own on public.pharmacy_staff;

-- قراءة: كل من في الصيدلية يرى زملاءه
-- ضرورية لعرض «من سجّل هذه الزيارة» عبر visitations.recorded_by
create policy pharmacy_staff_read on public.pharmacy_staff
  for select to authenticated
  using (pharmacy_id = public.current_pharmacy_id());

-- كتابة: المالك وحده يضيف/يعدّل/يعطّل الموظفين
create policy pharmacy_staff_owner_write on public.pharmacy_staff
  for all to authenticated
  using (
    pharmacy_id = public.current_pharmacy_id()
    and public.current_role_name() = 'owner'
  )
  with check (
    pharmacy_id = public.current_pharmacy_id()
    and public.current_role_name() = 'owner'
  );

commit;


-- =====================================================================
-- تحقّق
-- =====================================================================

-- ١) عدد السياسات لكل جدول
--    المتوقّع: ٧ جداول بسياسة واحدة · feedback = ٤ · pharmacy_staff = ٢
select tablename, count(*) as policies, string_agg(policyname, ', ' order by policyname) as names
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

-- ٢) لا جدول بلا RLS — المتوقّع: صفر صفوف
select tablename from pg_tables
where schemaname = 'public' and not rowsecurity;

-- ٣) الاختبار الحقيقي يكون من التطبيق بحسابين من صيدليتين مختلفتين.
--    SQL Editor يعمل بصلاحية تتجاوز RLS ولن يُظهر أي خرق.


-- =====================================================================
-- ملاحظات تشغيلية
-- =====================================================================
-- • أي جلسة أُصدرت قبل حقن app_metadata لا تحمل pharmacy_id ← تسجيل
--   خروج ودخول إلزامي بعد التطبيق، وإلا ظهرت الشاشات فارغة.
--
-- • الكود ما زال يمرّر pharmacy_id من session.user.id في ~٦٠ موضعاً.
--   يعمل اليوم لأن pharmacies.id = pharmacies.user_id = auth.uid().
--   يجب استبداله بقراءة من app_metadata قبل إنشاء أي حساب موظف.
-- =====================================================================