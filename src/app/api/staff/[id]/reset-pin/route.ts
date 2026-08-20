import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generatePin } from '@/lib/staff-auth';

/** يتحقّق أن المستدعي مالك، ويُرجع pharmacy_id من التوكن */
async function verifyOwner(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false as const, error: 'مطلوب توثيق', status: 401 };
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return { ok: false as const, error: 'رمز التوثيق غير صالح', status: 401 };
  }
  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  const pharmacyId = meta.pharmacy_id as string | undefined;
  const role = meta.role as string | undefined;

  if (!pharmacyId) {
    return { ok: false as const, error: 'الحساب غير مرتبط بصيدلية', status: 403 };
  }
  if (role !== 'owner') {
    return { ok: false as const, error: 'هذه العملية للمالك فقط', status: 403 };
  }
  return { ok: true as const, userId: user.id, pharmacyId };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyOwner(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const { data: staff } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('id, name, role, pharmacy_id, user_id, login_slug')
    .eq('id', id)
    .single();

  if (!staff) {
    return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
  }
  // نفس رسالة 404 عمداً: لا نكشف وجود موظف في صيدلية أخرى
  if (staff.pharmacy_id !== auth.pharmacyId) {
    return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
  }
  if (staff.role === 'owner') {
    return NextResponse.json({ error: 'لا يمكن تصفير رمز المالك' }, { status: 403 });
  }
  if (!staff.user_id) {
    return NextResponse.json({ error: 'هذا الحساب غير مفعّل' }, { status: 400 });
  }

  // رمز الصيدلية لازم للمودال لعرض التعليمات كاملة بعد التصفير أيضاً
  const { data: pharmacy } = await supabaseAdmin
    .from('pharmacies')
    .select('short_code')
    .eq('id', auth.pharmacyId)
    .single();

  const pin = generatePin();

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(staff.user_id, {
    password: pin,
  });

  if (updateErr) {
    return NextResponse.json({ error: 'تعذّر تحديث الرمز' }, { status: 500 });
  }

  await supabaseAdmin
    .from('pharmacy_staff')
    .update({ must_change_pin: true })
    .eq('id', staff.id);

  // رفع أي قفل قائم على هذا الحساب
  await supabaseAdmin
    .from('staff_login_attempts')
    .delete()
    .eq('user_id', staff.user_id);

  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: auth.pharmacyId,
    actor_id: auth.userId,
    action: 'reset_pin',
    target_id: staff.id,
    details: { name: staff.name },
  });

  // الـ PIN يُعرض مرّة واحدة ولا يُخزَّن في أي مكان
  return NextResponse.json({
    pin,
    staff: { id: staff.id, name: staff.name, login_slug: staff.login_slug },
    pharmacy_code: pharmacy?.short_code || '',
  });
}
