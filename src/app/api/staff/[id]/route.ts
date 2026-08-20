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

export async function DELETE(
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
    .select('id, name, role, login_slug, pharmacy_id, user_id')
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
    return NextResponse.json({ error: 'لا يمكن حذف المالك' }, { status: 403 });
  }

  // الشرط الحاسم — يجب العدّ قبل أي حذف. لو حذفنا حساب المصادقة ثم
  // اكتشفنا وجود زيارات، لتركنا صفاً بلا حساب — نفس السجلات الشبحية
  // التي نظّفناها سابقاً. زيارة تشير إلى موظف محذوف ليست إثباتاً
  // كافياً بموجب قانون 24/2023.
  const { count: visitCount } = await supabaseAdmin
    .from('visitations')
    .select('id', { count: 'exact', head: true })
    .eq('recorded_by', staff.id);

  if ((visitCount || 0) > 0) {
    return NextResponse.json(
      { error: `لا يمكن حذف هذا الموظف لأن له ${visitCount} زيارة مسجّلة. عطّله بدلاً من ذلك — التعطيل يمنع دخوله فوراً ويحفظ سجل من قام بكل عملية كما يتطلبه القانون.` },
      { status: 409 }
    );
  }

  if (staff.user_id) {
    const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(staff.user_id);
    if (deleteAuthErr) {
      return NextResponse.json({ error: 'تعذّر حذف حساب المصادقة' }, { status: 500 });
    }
  }

  await supabaseAdmin
    .from('pharmacy_staff')
    .delete()
    .eq('id', staff.id);

  // السجل يبقى بعد اختفاء الصف — نحتفظ بالاسم والدور والـslug هنا
  // لأنها لن تكون قابلة للاستعادة من pharmacy_staff بعد الحذف
  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: auth.pharmacyId,
    actor_id: auth.userId,
    action: 'delete_staff',
    target_id: staff.id,
    details: { name: staff.name, role: staff.role, slug: staff.login_slug },
  });

  return NextResponse.json({ ok: true });
}
