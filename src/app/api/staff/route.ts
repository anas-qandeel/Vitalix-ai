import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generatePin, buildStaffEmail } from '@/lib/staff-auth';

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

export async function POST(req: NextRequest) {
  const auth = await verifyOwner(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const role = String(body?.role || 'staff');

  if (name.length < 2) {
    return NextResponse.json({ error: 'الاسم قصير جداً' }, { status: 400 });
  }
  if (!['pharmacist', 'assistant', 'staff'].includes(role)) {
    return NextResponse.json({ error: 'دور غير صالح' }, { status: 400 });
  }

  // رمز الصيدلية
  const { data: ph } = await supabaseAdmin
    .from('pharmacies')
    .select('short_code')
    .eq('id', auth.pharmacyId)
    .single();

  if (!ph?.short_code) {
    return NextResponse.json({ error: 'تعذّر تحديد الصيدلية' }, { status: 500 });
  }

  // slug تسلسلي داخل الصيدلية
  const { data: existing } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('login_slug')
    .eq('pharmacy_id', auth.pharmacyId)
    .not('login_slug', 'is', null);

  const used = new Set((existing || []).map(r => r.login_slug as string));
  let n = 1;
  while (used.has(`staff${n}`)) n++;
  const slug = `staff${n}`;

  const email = buildStaffEmail(slug, ph.short_code);
  const pin = generatePin();

  // حساب المصادقة
  const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    app_metadata: { pharmacy_id: auth.pharmacyId, role: 'staff' },
  });

  if (authErr || !created?.user) {
    return NextResponse.json(
      { error: `تعذّر إنشاء الحساب: ${authErr?.message || 'خطأ غير معروف'}` },
      { status: 500 }
    );
  }

  // صف الموظف
  const { data: staffRow, error: rowErr } = await supabaseAdmin
    .from('pharmacy_staff')
    .insert({
      pharmacy_id: auth.pharmacyId,
      user_id: created.user.id,
      name,
      role,
      login_slug: slug,
      is_active: true,
      must_change_pin: true,
    })
    .select('id, name, role')
    .single();

  // تراجع: لا نترك حساب مصادقة يتيماً
  if (rowErr || !staffRow) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: `تعذّر حفظ الموظف: ${rowErr?.message || 'خطأ غير معروف'}` },
      { status: 500 }
    );
  }

  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: auth.pharmacyId,
    actor_id: auth.userId,
    action: 'create_staff',
    target_id: staffRow.id,
    details: { name, role, slug },
  });

  // الـ PIN يُعرض مرّة واحدة ولا يُخزَّن في أي مكان
  return NextResponse.json({ staff: staffRow, pin });
}
