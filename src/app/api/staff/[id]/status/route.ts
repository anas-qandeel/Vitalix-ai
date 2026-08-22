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
    console.error('[verifyOwner] token rejected:', error?.message, '| user:', user?.id);
    return { ok: false as const, error: 'رمز التوثيق غير صالح', status: 401 };
  }
  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  const pharmacyId = meta.pharmacy_id as string | undefined;
  const role = meta.role as string | undefined;

  if (!pharmacyId) {
    console.error('[verifyOwner] meta:', JSON.stringify(meta));
    return { ok: false as const, error: 'الحساب غير مرتبط بصيدلية', status: 403 };
  }
  if (role !== 'owner') {
    console.error('[verifyOwner] meta:', JSON.stringify(meta));
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

  if (isActive === false && staff.user_id) {
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(staff.user_id, {
      ban_duration: '876000h',
    });
    if (banErr) {
      console.error('[staff-status] ban failed:', banErr);
      return NextResponse.json({ error: 'تعذّر إبطال جلسة الموظف' }, { status: 500 });
    }
  }

  if (isActive === true && staff.user_id) {
    const { error: unbanErr } = await supabaseAdmin.auth.admin.updateUserById(staff.user_id, {
      ban_duration: 'none',
    });
    if (unbanErr) {
      console.error('[staff-status] unban failed:', unbanErr);
      return NextResponse.json({ error: 'تعذّر إعادة تفعيل الحساب' }, { status: 500 });
    }
  }

  await supabaseAdmin
    .from('pharmacy_staff')
    .update({ is_active: isActive })
    .eq('id', staff.id);

  // التعطيل يمنع تجديد التوكن والدخول فوراً عبر الحظر (ban_duration)،
  // لكن التوكن الحالي في متصفح الموظف يبقى صالحاً حتى ساعة كحد أقصى
  // (انتهاؤه الطبيعي) قبل أن يُرفض. إعادة التفعيل ترفع الحظر فقط
  // (ban_duration: 'none').

  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: auth.pharmacyId,
    actor_id: auth.userId,
    action: isActive ? 'enable_staff' : 'disable_staff',
    target_id: staff.id,
    details: { name: staff.name },
  });

  return NextResponse.json({ staff: { id: staff.id, name: staff.name, is_active: isActive } });
}
