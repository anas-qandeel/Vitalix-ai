import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// تفاصيل صيدلية للوحة الإدارة (أي مسؤول): بيانات الصيدلية من pharmacies مباشرة + بريد حساب الدخول + الموظفون.
// العدّادات والاشتراك تأتي من /api/admin/overview و /api/admin/subscriptions — لا تُكرَّر هنا.

const UUID = /^[0-9a-f-]{36}$/i;
const PHARMACY_COLS = 'id, user_id, name, pharmacist_name, phone_number, city_address, country, status, short_code, max_staff, must_change_password, created_at';
const STAFF_COLS = 'id, name, role, is_active, login_slug, phone, last_login_at, created_at';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف الصيدلية غير صالح' }, { status: 400 });

  const { data: pharmacy, error } = await supabaseAdmin.from('pharmacies').select(PHARMACY_COLS).eq('id', id).maybeSingle();
  if (error) { console.error('[admin/pharmacy-detail]', error.message); return NextResponse.json({ error: 'فشل جلب البيانات' }, { status: 500 }); }
  if (!pharmacy) return NextResponse.json({ error: 'لم يتم العثور على الصيدلية' }, { status: 404 });

  let email: string | null = null;
  if (pharmacy.user_id) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(pharmacy.user_id);
    email = u?.user?.email ?? null;
  }

  const { data: staff, error: staffErr } = await supabaseAdmin.from('pharmacy_staff').select(STAFF_COLS).eq('pharmacy_id', id).order('role').order('created_at');
  if (staffErr) console.error('[admin/pharmacy-detail] staff', staffErr.message);

  return NextResponse.json({ pharmacy: { ...pharmacy, email }, staff: staff ?? [] });
}
