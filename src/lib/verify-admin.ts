import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// المرجع الوحيد لصلاحيات الإدارة: جدول platform_admins (owner / pharmacist / support).
// PLATFORM_ADMIN_EMAILS قفل طوارئ فقط: بريد فيه وغير موجود في الجدول يُعامَل owner كي لا يُقفل المالك خارج نظامه.

export const ADMIN_ROLES = ['owner', 'pharmacist', 'support'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export interface AuthResult {
  authorized: boolean;
  user: any;
  role: AdminRole | null;
  response: NextResponse;
}

const deny = (error: string, status: number): AuthResult =>
  ({ authorized: false, user: null, role: null, response: NextResponse.json({ error }, { status }) });

export async function verifyPlatformAdmin(request: Request, requiredRoles?: readonly AdminRole[]): Promise<AuthResult> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return deny('مطلوب رمز التوثيق', 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return deny('رمز التوثيق غير صالح', 401);

    let role: AdminRole | null = null;
    const { data: row } = await supabaseAdmin
      .from('platform_admins')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();
    if (row && (ADMIN_ROLES as readonly string[]).includes(row.role)) role = row.role as AdminRole;

    if (!role) {
      const emergency = (process.env.PLATFORM_ADMIN_EMAILS || '')
        .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (emergency.includes((user.email || '').toLowerCase())) role = 'owner';
    }

    if (!role) {
      console.error('platform admin denied:', user.email);
      return deny('غير مصرّح', 403);
    }
    if (requiredRoles && !requiredRoles.includes(role)) {
      console.error('platform admin role denied:', user.email, role, 'needs', requiredRoles.join('/'));
      return deny('هذه العملية تتطلب صلاحية أعلى', 403);
    }

    return { authorized: true, user, role, response: null as unknown as NextResponse };
  } catch {
    return deny('خطأ في التوثيق', 500);
  }
}

export const verifyAdmin = verifyPlatformAdmin;
