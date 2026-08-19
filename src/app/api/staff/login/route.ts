import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildStaffEmail, lockoutSeconds } from '@/lib/staff-auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const pharmacyCode = String(body?.pharmacy_code || '').trim();
  const slug = String(body?.slug || '').trim();
  const pin = String(body?.pin || '').trim();

  if (!pharmacyCode || !slug || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
  }

  // الصيدلية عبر الكود القصير (غير حساس لحالة الأحرف)
  const { data: pharmacy } = await supabaseAdmin
    .from('pharmacies')
    .select('id')
    .ilike('short_code', pharmacyCode)
    .single();

  if (!pharmacy) {
    return NextResponse.json({ error: 'كود الصيدلية غير صحيح' }, { status: 404 });
  }

  // الموظف عبر (pharmacy_id, login_slug)
  const { data: staff } = await supabaseAdmin
    .from('pharmacy_staff')
    .select('id, name, role, is_active, user_id, must_change_pin')
    .eq('pharmacy_id', pharmacy.id)
    .eq('login_slug', slug)
    .single();

  if (!staff) {
    return NextResponse.json({ error: 'هذا الموظف غير موجود' }, { status: 404 });
  }
  if (!staff.is_active) {
    return NextResponse.json({ error: 'هذا الحساب معطّل' }, { status: 403 });
  }
  if (!staff.user_id) {
    return NextResponse.json({ error: 'هذا الحساب غير مفعّل' }, { status: 403 });
  }

  // القفل التصاعدي
  const { data: attempts } = await supabaseAdmin
    .from('staff_login_attempts')
    .select('failed_count, locked_until')
    .eq('user_id', staff.user_id)
    .single();

  const now = new Date();

  if (attempts?.locked_until && new Date(attempts.locked_until) > now) {
    const retryAfter = Math.ceil((new Date(attempts.locked_until).getTime() - now.getTime()) / 1000);
    return NextResponse.json({ error: 'الحساب مقفل مؤقتاً', retry_after: retryAfter }, { status: 429 });
  }

  const email = buildStaffEmail(slug, pharmacyCode);
  // عميل مؤقت منفصل للمصادقة — signInWithPassword على supabaseAdmin يستبدل جلسة service_role المشتركة
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password: pin,
  });

  if (signInError || !signInData?.session) {
    const failedCount = (attempts?.failed_count || 0) + 1;
    const secs = lockoutSeconds(failedCount);
    await supabaseAdmin.from('staff_login_attempts').upsert({
      user_id: staff.user_id,
      failed_count: failedCount,
      last_attempt: now.toISOString(),
      locked_until: secs > 0 ? new Date(now.getTime() + secs * 1000).toISOString() : null,
    });

    if (secs > 0) {
      return NextResponse.json({ error: 'الحساب مقفل مؤقتاً', retry_after: secs }, { status: 429 });
    }
    return NextResponse.json({ error: 'الرمز غير صحيح' }, { status: 401 });
  }

  // نجاح — تصفير السجل
  await supabaseAdmin.from('staff_login_attempts').upsert({
    user_id: staff.user_id,
    failed_count: 0,
    locked_until: null,
    last_attempt: now.toISOString(),
  });

  return NextResponse.json({
    session: signInData.session,
    staff: { id: staff.id, name: staff.name, role: staff.role, must_change_pin: staff.must_change_pin },
  });
}
