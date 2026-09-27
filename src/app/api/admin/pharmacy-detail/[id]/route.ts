import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// تفاصيل صيدلية للوحة الإدارة (أي مسؤول): بيانات الصيدلية من pharmacies مباشرة + بريد حساب الدخول + الموظفون.
// العدّادات والاشتراك تأتي من /api/admin/overview و /api/admin/subscriptions — لا تُكرَّر هنا.

const UUID = /^[0-9a-f-]{36}$/i;
const PHARMACY_COLS = 'id, user_id, name, pharmacist_name, phone_number, city_address, country, status, short_code, max_staff, must_change_password, created_at';
const STAFF_COLS = 'id, name, role, is_active, login_slug, phone, last_login_at, created_at';
// user_id يُطلَب إضافياً هنا فقط لمطابقة صف المالك أدناه — لا يظهر في الرد النهائي

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف الصيدلية غير صالح' }, { status: 400 });

  const { data: pharmacy, error } = await supabaseAdmin.from('pharmacies').select(PHARMACY_COLS).eq('id', id).maybeSingle();
  if (error) { console.error('[admin/pharmacy-detail]', error.message); return NextResponse.json({ error: 'فشل جلب البيانات' }, { status: 500 }); }
  if (!pharmacy) return NextResponse.json({ error: 'لم يتم العثور على الصيدلية' }, { status: 404 });

  let email: string | null = null;
  let ownerLastSignIn: string | null = null;
  if (pharmacy.user_id) {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(pharmacy.user_id);
    email = u?.user?.email ?? null;
    ownerLastSignIn = u?.user?.last_sign_in_at ?? null;
  }

  const { data: staff, error: staffErr } = await supabaseAdmin.from('pharmacy_staff').select(`${STAFF_COLS}, user_id`).eq('pharmacy_id', id).order('role').order('created_at');
  if (staffErr) console.error('[admin/pharmacy-detail] staff', staffErr.message);

  // آخر دخول = آخر إدخال رمز/بريد صحيح (الجلسة قد تبقى مفتوحة أياماً بعدها) — من activity_log
  // (action='login' يُسجَّل في /api/staff/login) أو auth.users.last_sign_in_at للمالك (يُحدَّثه
  // Supabase Auth تلقائياً عبر البريد). آخر نشاط = آخر حركة عمل غير الدخول لنفس الموظف. الاستعلام
  // لكل موظف على حدة (لا فرز مشترك بحد واحد) حتى لا تُخفي حركات موظف نشط تواريخ زملائه.
  const loginMap = new Map<string, string>();
  const activityMap = new Map<string, string>();
  if (staff && staff.length > 0) {
    await Promise.all(staff.map(async (s) => {
      const [loginRes, activityRes] = await Promise.all([
        supabaseAdmin.from('activity_log').select('created_at').eq('pharmacy_id', id).eq('staff_id', s.id).eq('action', 'login').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from('activity_log').select('created_at').eq('pharmacy_id', id).eq('staff_id', s.id).neq('action', 'login').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (loginRes.error) console.error('[admin/pharmacy-detail] login', s.id, loginRes.error.message);
      else if (loginRes.data) loginMap.set(s.id, loginRes.data.created_at);
      if (activityRes.error) console.error('[admin/pharmacy-detail] activity', s.id, activityRes.error.message);
      else if (activityRes.data) activityMap.set(s.id, activityRes.data.created_at);
    }));
  }

  const staffWithLogin = (staff ?? []).map(({ user_id, ...s }) => {
    const candidates = [s.last_login_at, loginMap.get(s.id) ?? null];
    if (s.role === 'owner' && user_id === pharmacy.user_id) candidates.push(ownerLastSignIn);
    const latest = candidates
      .filter((v): v is string => !!v)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
    return { ...s, last_login_at: latest, last_activity_at: activityMap.get(s.id) ?? null };
  });

  return NextResponse.json({ pharmacy: { ...pharmacy, email }, staff: staffWithLogin });
}
