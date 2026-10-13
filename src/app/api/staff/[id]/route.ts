import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeJordanPhone } from '@/lib/staff-auth';
import { normalizeAr } from '@/lib/arabic';

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

/** تعديل اسم الموظف وهاتفه فقط — للمالك. لا يمسّ الدور ولا الرمز ولا التفعيل ولا اسم الدخول (login_slug) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyOwner(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });
  }

  const { data: staff } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('id, name, role, login_slug, phone, pharmacy_id')
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
    return NextResponse.json({ error: 'لا يمكن تعديل بيانات المالك من هنا' }, { status: 403 });
  }

  const updates: { name?: string; phone?: string | null } = {};

  if ('name' in body) {
    const name = String(body.name ?? '').trim();
    if (name.length < 2) return NextResponse.json({ error: 'الاسم قصير جداً' }, { status: 400 });
    if (name.length > 80) return NextResponse.json({ error: 'الاسم طويل جداً' }, { status: 400 });
    if (name !== staff.name) {
      const { data: others } = await supabaseAdmin
        .from('pharmacy_staff')
        .select('id, name')
        .eq('pharmacy_id', auth.pharmacyId)
        .neq('id', staff.id);
      if ((others || []).some(o => normalizeAr(o.name) === normalizeAr(name))) {
        return NextResponse.json({ error: 'هذا الاسم مسجّل مسبقاً' }, { status: 409 });
      }
      updates.name = name;
    }
  }

  if ('phone' in body) {
    const rawPhone = String(body.phone ?? '').trim();
    let phone: string | null = null;
    if (rawPhone) {
      phone = normalizeJordanPhone(rawPhone);
      if (!phone) return NextResponse.json({ error: 'رقم الهاتف غير صالح' }, { status: 400 });
    }
    if (phone !== (staff.phone ?? null)) updates.phone = phone;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({
      staff: { id: staff.id, name: staff.name, role: staff.role, login_slug: staff.login_slug, phone: staff.phone ?? null },
      changed: false,
    });
  }

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('pharmacy_staff')
    .update(updates)
    .eq('id', staff.id)
    .eq('pharmacy_id', auth.pharmacyId)
    .select('id, name, role, login_slug, phone')
    .single();

  if (updErr || !updated) {
    console.error('[staff PATCH] update failed:', updErr?.message);
    return NextResponse.json({ error: 'تعذّر حفظ التعديل' }, { status: 500 });
  }

  const phoneChange = 'phone' in updates
    ? (updates.phone === null ? 'removed' : (staff.phone ? 'changed' : 'added'))
    : null;
  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: auth.pharmacyId,
    actor_id: auth.userId,
    action: 'update_staff',
    target_id: staff.id,
    // لا نخزّن أرقام الهواتف في سجل التدقيق: نوع التغيير فقط
    details: { name_from: updates.name ? staff.name : null, name_to: updates.name ?? null, phone: phoneChange },
  });

  return NextResponse.json({ staff: updated, changed: true });
}
