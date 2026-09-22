-- توحيد أدوار مديري المنصة: owner (كل شيء) / pharmacist (قوائم الحظر والمرفوضات ومراجعة البطاقات) / support (قراءة).
-- تحويل الأدوار القديمة: super_admin -> owner ، support_admin/admin -> support. لا حذف لأي صف.
-- الافتراضي 'support' كان يخالف القيد القديم (كل إدراج بلا role يفشل) — صار صالحاً.
ALTER TABLE public.platform_admins DROP CONSTRAINT IF EXISTS platform_admins_role_check;
UPDATE public.platform_admins SET role = 'owner'   WHERE role = 'super_admin';
UPDATE public.platform_admins SET role = 'support' WHERE role IN ('support_admin', 'admin');
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_role_check CHECK (role IN ('owner', 'pharmacist', 'support'));
ALTER TABLE public.platform_admins ALTER COLUMN role SET DEFAULT 'support';
