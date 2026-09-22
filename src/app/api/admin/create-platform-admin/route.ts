import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin, ADMIN_ROLES, type AdminRole } from '@/lib/verify-admin';

// إدارة مسؤولي المنصة — owner فقط. المرجع جدول platform_admins (id = معرّف السطر، user_id = حساب auth).
// حماية: لا تخفيض ولا حذف لآخر owner كي لا يبقى النظام بلا مالك.

const OWNER_ONLY = ['owner'] as const;

function validRole(v: unknown): v is AdminRole {
  return typeof v === 'string' && (ADMIN_ROLES as readonly string[]).includes(v);
}

async function ownerCount(): Promise<number> {
  const { count } = await supabaseAdmin.from('platform_admins').select('id', { count: 'exact', head: true }).eq('role', 'owner');
  return count ?? 0;
}

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER_ONLY);
  if (!auth.authorized) return auth.response;

  let body: { email?: unknown; password?: unknown; name?: unknown; role?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const role: AdminRole = validRole(body.role) ? body.role : 'support';
  if (!email || !password) return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'كلمة المرور 8 خانات على الأقل' }, { status: 400 });

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { role: 'platform_admin', name },
  });
  if (createErr || !created.user) {
    console.error('[create-platform-admin POST] createUser', createErr?.message);
    return NextResponse.json({ error: 'تعذّر إنشاء الحساب (ربما البريد مستخدم أصلاً)' }, { status: 400 });
  }

  const { error: insertErr } = await supabaseAdmin.from('platform_admins').insert({ user_id: created.user.id, role, name: name || null });
  if (insertErr) {
    // لا نترك حساباً يتيماً بلا سطر صلاحية
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    console.error('[create-platform-admin POST] insert', insertErr.message);
    return NextResponse.json({ error: 'تعذّر تسجيل الصلاحية، أُلغي إنشاء الحساب' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER_ONLY);
  if (!auth.authorized) return auth.response;

  let body: { id?: unknown; role?: unknown; name?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const id = typeof body.id === 'string' ? body.id : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : null;
  if (!id) return NextResponse.json({ error: 'المعرّف مطلوب' }, { status: 400 });
  if (!validRole(body.role)) return NextResponse.json({ error: 'الدور غير صالح' }, { status: 400 });

  const { data: current } = await supabaseAdmin.from('platform_admins').select('id, role').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'المسؤول غير موجود' }, { status: 404 });
  if (current.role === 'owner' && body.role !== 'owner' && (await ownerCount()) <= 1) {
    return NextResponse.json({ error: 'لا يمكن تخفيض آخر مالك في النظام' }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('platform_admins').update({ role: body.role, name }).eq('id', id);
  if (error) return NextResponse.json({ error: 'فشل تحديث المسؤول' }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER_ONLY);
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });

  const { data: current } = await supabaseAdmin.from('platform_admins').select('id, user_id, role').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'المسؤول غير موجود' }, { status: 404 });
  if (current.user_id === auth.user.id) return NextResponse.json({ error: 'لا يمكنك حذف حسابك أنت' }, { status: 409 });
  if (current.role === 'owner' && (await ownerCount()) <= 1) return NextResponse.json({ error: 'لا يمكن حذف آخر مالك في النظام' }, { status: 409 });

  const { error: delRowErr } = await supabaseAdmin.from('platform_admins').delete().eq('id', id);
  if (delRowErr) return NextResponse.json({ error: 'فشل حذف الصلاحية' }, { status: 500 });
  const { error: delUserErr } = await supabaseAdmin.auth.admin.deleteUser(current.user_id);
  if (delUserErr) console.error('[create-platform-admin DELETE] deleteUser', delUserErr.message);
  return NextResponse.json({ success: true });
}
