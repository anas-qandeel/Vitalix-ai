-- =====================================================================
-- المرحلة ٢: دوال قراءة الهوية من التوكن
-- =====================================================================

begin;

-- ١) pharmacy_id من التوكن
create or replace function public.current_pharmacy_id()
returns uuid
language sql stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid;
$$;

-- ٢) الدور من التوكن
create or replace function public.current_role_name()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'none');
$$;

-- ٣) فحص أدمن المنصّة
--    security definer إلزامي: يمنع الاستدعاء الدائري مع RLS على platform_admins
create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

commit;