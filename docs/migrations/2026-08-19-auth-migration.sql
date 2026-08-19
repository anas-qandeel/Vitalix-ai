-- ============================================================================
-- Vitalix.ai — هجرة نظام هوية الموظفين (Auth Migration)
-- ============================================================================
-- نُفّذت هذه الكتل يدوياً عبر Supabase SQL Editor بتاريخ 2026-08-19، بمناسبة
-- الانتقال من "الصيدلاني النشط" (localStorage + CustomEvent) إلى حسابات
-- مصادقة مستقلة لكل موظف (pharmacy_staff.user_id + app_metadata).
--
-- هذا الملف مرجع تاريخي وسجل تنفيذ — لم يُشغَّل تلقائياً، ولا يُشغَّل هذا
-- الملف نفسه تلقائياً على أي قاعدة. اقرأ قسم "ملاحظات" في آخر الملف قبل
-- إعادة تشغيل أي كتلة منه على قاعدة غير هذه.
-- ترتيب الكتل هنا هو ترتيب التنفيذ الفعلي، وله أهمية (الكتلة ٢ تعتمد ضمنياً
-- على أن الكتلة ١ نُفّذت قبلها).
-- ============================================================================


-- ١) تنظيف سجلات موظفين بلا حسابات مصادقة
-- صفوف من مرحلة ما قبل نظام الهوية: أسماء نصية بلا user_id
-- كانت ستظهر في شاشة الدخول ولا يمكن الدخول بها
delete from pharmacy_staff
where user_id is null and role <> 'owner';


-- ٢) مجموعة لكل صيدلية (فرع واحد لكل مجموعة)
-- توحيد النموذج: لا فرق بنيوي بين صيدلية مفردة وسلسلة فروع.
-- تفاصيل القرار في docs/branches-model.md
insert into pharmacy_groups (name)
select p.name from pharmacies p where p.group_id is null;

update pharmacies p
set group_id = g.id
from pharmacy_groups g
where p.group_id is null and g.name = p.name;


-- ٣) حد أقصى لعدد الموظفين لكل صيدلية
-- كان ثابتاً في كود الواجهة فقط، أي قابلاً للتجاوز بطلب مباشر.
-- عمود قابل للتعديل لكل صيدلية على حدة استعداداً للباقات
alter table pharmacies
add column if not exists max_staff integer not null default 8;


-- ٤) تصحيح انحراف الدور بين الجدول والتوكن
-- عطل في POST /api/staff كان يثبّت role على 'staff' في
-- app_metadata بغض النظر عن الدور المُرسل
update auth.users u
set raw_app_meta_data = u.raw_app_meta_data
  || jsonb_build_object('role', s.role)
from pharmacy_staff s
where s.user_id = u.id
  and s.login_slug is not null
  and u.raw_app_meta_data->>'role' is distinct from s.role;


-- ٥) سياسات RLS على pharmacies
-- الجدول كان لا يزال على معادلة user_id = auth.uid() التي
-- تسبق هجرة المصادقة، فلم يكن الموظف يرى صف صيدليته إطلاقاً.
-- فُصلت القراءة عن التعديل: القراءة لكل من في الصيدلية،
-- التعديل للمالك وحده
create policy "Tenant members can read their pharmacy"
on pharmacies for select
using (id = current_pharmacy_id());

create policy "Owners can update their pharmacy"
on pharmacies for update
using (id = current_pharmacy_id() and current_role_name() = 'owner')
with check (id = current_pharmacy_id() and current_role_name() = 'owner');

drop policy "Users can manage their own pharmacies" on pharmacies;


-- ============================================================================
-- ملاحظات
-- ============================================================================
-- - سياسة "Platform admins can view all pharmacies" تستعمل
--   auth.uid() عمداً: تفحص هوية الشخص في platform_admins لا
--   هوية الصيدلية، وهذا استعمال صحيح
-- - الكتلتان ١ و٢ تعتمدان على بيانات وقت التنفيذ (الربط
--   بالاسم في ٢ آمن فقط لأن الجدول كان فارغاً والأسماء فريدة)
--   ولا يصح تشغيلهما على قاعدة تحتوي بيانات إنتاج
-- ============================================================================
