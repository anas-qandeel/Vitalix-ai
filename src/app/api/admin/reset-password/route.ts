import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// إعادة تعيين كلمة مرور مسؤول منصة — owner فقط، والهدف يجب أن يكون في platform_admins.
// كلمات مرور ملاك الصيدليات لها مسار مستقل لاحقاً (مع أثر في سجل النشاط).

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;

  let body: { userId?: unknown; newPassword?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return NextResponse.json({ error: 'كلمة المرور 8 خانات على الأقل وتحوي حروفاً وأرقاماً' }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin.from('platform_admins').select('id').eq('user_id', userId).maybeSingle();
  if (!target) return NextResponse.json({ error: 'الهدف ليس مسؤول منصة' }, { status: 404 });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    console.error('[admin/reset-password]', error.message);
    return NextResponse.json({ error: 'فشل تغيير كلمة المرور' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
