import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePin, buildStaffEmail } from '@/lib/staff-auth';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'مطلوب توثيق' }, { status: 401 });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'مطلوب توثيق' }, { status: 401 });
  }

  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  const pharmacyId = meta.pharmacy_id as string | undefined;
  const role = meta.role as string | undefined;

  // المالك يغيّر كلمة مروره عبر مسار البريد الإلكتروني لا هذا المسار
  if (role === 'owner') {
    return NextResponse.json({ error: 'هذا المسار للموظفين فقط' }, { status: 403 });
  }
  if (!pharmacyId) {
    return NextResponse.json({ error: 'الحساب غير مرتبط بصيدلية' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const currentPin = String(body?.current_pin || '').trim();
  const newPin = String(body?.new_pin || '').trim();

  const { data: staff } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('id, login_slug, is_active')
    .eq('user_id', user.id)
    .single();

  if (!staff) {
    return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });
  }
  if (!staff.is_active) {
    return NextResponse.json({ error: 'هذا الحساب معطّل' }, { status: 403 });
  }

  const pinError = validatePin(newPin);
  if (pinError) {
    return NextResponse.json({ error: pinError }, { status: 400 });
  }
  if (newPin === currentPin) {
    return NextResponse.json({ error: 'الرمز الجديد يجب أن يختلف عن الحالي' }, { status: 400 });
  }

  const { data: pharmacy } = await supabaseAdmin
    .from('pharmacies')
    .select('short_code')
    .eq('id', pharmacyId)
    .single();

  if (!pharmacy?.short_code) {
    return NextResponse.json({ error: 'تعذّر تحديد الصيدلية' }, { status: 500 });
  }

  const email = buildStaffEmail(staff.login_slug, pharmacy.short_code);
  // عميل مؤقت منفصل للمصادقة — signInWithPassword على supabaseAdmin يستبدل جلسة service_role المشتركة
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: currentPin,
  });

  if (signInError || !signInData?.session) {
    return NextResponse.json({ error: 'الرمز الحالي غير صحيح' }, { status: 401 });
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    password: newPin,
  });

  if (updateErr) {
    return NextResponse.json({ error: 'تعذّر تغيير الرمز' }, { status: 500 });
  }

  await supabaseAdmin
    .from('pharmacy_staff')
    .update({ must_change_pin: false })
    .eq('id', staff.id);

  await supabaseAdmin
    .from('staff_login_attempts')
    .delete()
    .eq('user_id', user.id);

  await supabaseAdmin.from('staff_audit_log').insert({
    pharmacy_id: pharmacyId,
    actor_id: user.id,
    action: 'change_pin',
    target_id: staff.id,
  });

  return NextResponse.json({ ok: true });
}
