-- سدّ ثغرة: دوال SECURITY DEFINER بلا فحص هوية كانت قابلة للاستدعاء من anon عبر /rest/v1/rpc
-- الدالتان تُستدعيان فقط من مسارات الخادم بمفتاح service_role، فلا يتأثر قسم الإدارة.

revoke execute on function public.get_pharmacy_admin_view() from public, anon, authenticated;
revoke execute on function public.get_platform_admins_view() from public, anon, authenticated;

grant execute on function public.get_pharmacy_admin_view() to service_role;
grant execute on function public.get_platform_admins_view() to service_role;

-- دالة قديمة غير مستخدمة في الكود، بلا فحص هوية، وفيها اسم وبريد افتراضيان مكتوبان
drop function if exists public.get_platform_admins();
