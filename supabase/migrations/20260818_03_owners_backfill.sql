-- =====================================================================
-- المرحلة ٣: تنظيف التكرار + إنشاء صفوف المالكين
-- =====================================================================

begin;

-- ١) حذف أعمدة مكرّرة أُضيفت خطأً في المرحلة ١
--    city ← city_address · is_active ← status · plan ← subscription_type
alter table public.pharmacies
  drop column if exists city,
  drop column if exists is_active,
  drop column if exists plan;

-- ٢) تصحيح الفهرس الفريد
--    كان على user_id وحده ← يمنع مالك الفروع من أن يكون في فرعين
drop index if exists public.idx_staff_user;

create unique index if not exists idx_staff_pharmacy_user
  on public.pharmacy_staff(pharmacy_id, user_id)
  where user_id is not null;

-- ٣) إنشاء صف مالك لكل صيدلية من pharmacist_name
--    المالك موظف أيضاً: يجب أن يظهر في «من سجّل هذه الزيارة»
insert into public.pharmacy_staff
  (pharmacy_id, user_id, name, role, login_slug, is_active, must_change_pin)
select
  p.id,
  p.user_id,
  coalesce(nullif(trim(p.pharmacist_name), ''), 'المالك'),
  'owner',
  null,
  true,
  false
from public.pharmacies p
where not exists (
  select 1 from public.pharmacy_staff s
  where s.pharmacy_id = p.id and s.role = 'owner'
);

commit;

-- ملاحظة: حقن app_metadata نُفّذ بسكربت Node عبر Auth API
-- (لا يمكن من SQL — يجب المرور بـ auth.admin.updateUserById)