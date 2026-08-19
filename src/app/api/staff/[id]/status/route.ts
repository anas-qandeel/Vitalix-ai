import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyOwner(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const isActive = body?.is_active;

  if (typeof isActive !== 'boolean') {
    return NextResponse.json({ error: 'قيمة غير صالحة' }, { status: 400 });
  }

  const { id } = await params;

  const { data: staff } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('id, name, role, pharmacy_id, user_id')
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
    return NextResponse.json({ error: 'لا يمكن تعطيل المالك' }, { status: 403 });
  }

  await supabaseAdmin
    .from('pharmacy_staff')
    .update({ is_active: isActive })
    .eq('id', staff.id);

  // التعطيل يمنع الدخول الجديد فوراً عبر فحص is_active في مسار
  // login. الجلسة القائمة تبقى صالحة حتى انتهاء صلاحيتها الطبيعية
  // (~ساعة). الإبطال الفوري يتطلب فحص is_active في كل طلب — مهمة
  // منفصلة.

  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: auth.pharmacyId,
    actor_id: auth.userId,
    action: isActive ? 'enable_staff' : 'disable_staff',
    target_id: staff.id,
    details: { name: staff.name },
  });

  return NextResponse.json({ staff: { id: staff.id, name: staff.name, is_active: isActive } });
}
