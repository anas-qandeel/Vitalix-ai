import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * حارس مسارات API التي يستدعيها طاقم الصيدلية.
 * يتحقق من رمز الجلسة (Authorization: Bearer)، ثم من جدول pharmacy_staff أن صاحبه
 * موظف نشط في صيدليته — لأن المسارات تعمل بصلاحية الخادم وتتجاوز سياسات RLS،
 * فبطاقة الجلسة وحدها لا تكفي (موظف عُطّل حسابه قد تبقى بطاقته صالحة حتى انتهائها).
 * الدور يؤخذ من الجدول لا من البطاقة — المصدر الأحدث.
 * المسارات العامة بطبيعتها (صفحات المريض برابط، تسجيل دخول الموظفين) لا تستخدمه.
 */
export type StaffRole = 'owner' | 'pharmacist' | 'assistant' | 'staff';

export interface AuthedStaff { ok: true; userId: string; pharmacyId: string; role: StaffRole; staffId: string }
export interface AuthFailure { ok: false; error: string; status: 401 | 403 }

export async function requireStaff(req: Request, allowedRoles?: StaffRole[]): Promise<AuthedStaff | AuthFailure> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, error: 'مطلوب توثيق', status: 401 };
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return { ok: false, error: 'مطلوب توثيق', status: 401 };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { ok: false, error: 'رمز التوثيق غير صالح أو منتهٍ', status: 401 };

  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  const pharmacyId = typeof meta.pharmacy_id === 'string' ? meta.pharmacy_id : undefined;
  if (!pharmacyId) return { ok: false, error: 'الحساب غير مرتبط بصيدلية', status: 403 };

  const { data: staffRow } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('id, role, is_active')
    .eq('user_id', user.id)
    .eq('pharmacy_id', pharmacyId)
    .maybeSingle();
  if (!staffRow || staffRow.is_active !== true) return { ok: false, error: 'الحساب معطّل أو غير مرتبط بهذه الصيدلية', status: 403 };

  const role = staffRow.role as StaffRole;
  if (allowedRoles && !allowedRoles.includes(role)) return { ok: false, error: 'هذه العملية غير مسموحة لدورك', status: 403 };

  return { ok: true, userId: user.id, pharmacyId, role, staffId: staffRow.id as string };
}
