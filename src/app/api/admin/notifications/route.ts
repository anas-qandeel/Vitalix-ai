import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// إشعارات الإدارة (admin_notifications) — تُنتجها الجولة اليومية. أي مسؤول يقرأ؛ التعليم كمقروء فقط.
const COLS = 'id, kind, pharmacy_id, message, is_read, created_at';

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;
  const { data, error } = await supabaseAdmin.from('admin_notifications').select(COLS).order('created_at', { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: 'فشل جلب الإشعارات' }, { status: 500 });
  const unread = (data || []).filter(n => !n.is_read).length;
  return NextResponse.json({ data, unread });
}

export async function PATCH(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)) : [];
  const all = body?.all === true;
  if (!all && ids.length === 0) return NextResponse.json({ error: 'لا معرّفات' }, { status: 400 });
  const q = supabaseAdmin.from('admin_notifications').update({ is_read: true }).eq('is_read', false);
  const { error } = all ? await q : await q.in('id', ids);
  if (error) return NextResponse.json({ error: 'فشل التحديث' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
