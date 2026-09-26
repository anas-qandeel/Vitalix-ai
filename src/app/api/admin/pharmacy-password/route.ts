import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// إعادة تعيين كلمة مرور مالك صيدلية — owner و support. الهدف صيدلية (مسؤولو المنصة لهم مسار reset-password).
// بعد التغيير يُرفع must_change_password فيُجبَر المالك على اختيار كلمة خاصة به عند أول دخول،
// ويُكتب أثر في admin_audit_log بنمط rotate-code (بلا كلمة المرور نفسها).

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'support']);
  if (!auth.authorized) return auth.response;

  let body: { pharmacy_id?: unknown; new_password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const pharmacyId = typeof body.pharmacy_id === 'string' ? body.pharmacy_id : '';
  const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
  if (!UUID.test(pharmacyId)) return NextResponse.json({ error: 'معرّف الصيدلية غير صالح' }, { status: 400 });
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return NextResponse.json({ error: 'كلمة المرور 8 خانات على الأقل وتحوي حروفاً وأرقاماً' }, { status: 400 });
  }

  const { data: pharmacy } = await supabaseAdmin.from('pharmacies').select('id, user_id, name, status').eq('id', pharmacyId).maybeSingle();
  if (!pharmacy) return NextResponse.json({ error: 'الصيدلية غير موجودة' }, { status: 404 });
  if (pharmacy.status === 'archived') return NextResponse.json({ error: 'الصيدلية مؤرشفة' }, { status: 409 });
  if (!pharmacy.user_id) return NextResponse.json({ error: 'لا حساب دخول مرتبط بهذه الصيدلية' }, { status: 409 });

  // حماية: إن كان حساب الصيدلية مسؤول منصة أيضاً فلا يُغيَّر من هنا (وإلا استطاع الدعم تغيير كلمة مرور المالك)
  const { data: isAdmin } = await supabaseAdmin.from('platform_admins').select('id').eq('user_id', pharmacy.user_id).maybeSingle();
  if (isAdmin) return NextResponse.json({ error: 'حساب هذه الصيدلية مسؤول منصة — استخدم مسار مسؤولي المنصة' }, { status: 409 });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(pharmacy.user_id, { password: newPassword });
  if (error) {
    console.error('[admin/pharmacy-password]', error.message);
    return NextResponse.json({ error: 'فشل تغيير كلمة المرور' }, { status: 500 });
  }

  // كلمة مؤقتة: المالك يُجبَر على تغييرها عند أول دخول (dashboard/layout يحوّله إلى /update-password)
  const { error: flagErr } = await supabaseAdmin.from('pharmacies').update({ must_change_password: true }).eq('id', pharmacy.id);
  if (flagErr) console.error('[admin/pharmacy-password] must_change_password flag', flagErr.message);

  const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: auth.user.id,
    action: 'reset_pharmacy_password',
    pharmacy_id: pharmacy.id,
    details: { actor_role: auth.role, target_user_id: pharmacy.user_id, pharmacy_name: pharmacy.name },
  });
  if (auditErr) {
    // التغيير نجح فعلاً — فشل التسجيل لا يُلغيه، لكن يبقى الأثر في سجل الخادم على الأقل
    console.error(`[admin/pharmacy-password] audit log failed: pharmacy=${pharmacy.id} —`, auditErr.message);
  }

  return NextResponse.json({ success: true, must_change_password: true });
}
