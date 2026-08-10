import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'platform_admin', name },
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, user: data.user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ أثناء إنشاء الحساب' }, { status: 400 });
  }
}
