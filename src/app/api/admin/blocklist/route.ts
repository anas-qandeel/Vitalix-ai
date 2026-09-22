import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// قائمة حظر الأدوية — إدارة من مدير المنصة فقط. الجدول خادم فقط (service_role).
// لا يمسّ منطق الرفض (medicine_blocklist_match) ولا يعدّل سطراً موجوداً.

const TERM_TYPES = ['generic', 'brand'] as const;
type TermType = typeof TERM_TYPES[number];

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'pharmacist']);
  if (!auth.authorized) return auth.response;

  const { data, error } = await supabaseAdmin
    .from('medicine_blocklist')
    .select('id, term, term_type, is_active, note, created_at')
    .order('term_type')
    .order('term');
  if (error) return NextResponse.json({ error: 'فشل جلب قائمة الحظر' }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'pharmacist']);
  if (!auth.authorized) return auth.response;

  let body: { term?: unknown; term_type?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }

  const term = typeof body.term === 'string' ? body.term.trim() : '';
  const termType = body.term_type as TermType;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  if (!term || term.length > 100) return NextResponse.json({ error: 'المصطلح مطلوب (حتى 100 حرف)' }, { status: 400 });
  if (!TERM_TYPES.includes(termType)) return NextResponse.json({ error: 'النوع يجب أن يكون generic أو brand' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('medicine_blocklist')
    .insert({ term, term_type: termType, note })
    .select('id, term, term_type, is_active, note, created_at')
    .single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'هذا المصطلح موجود أصلاً بالنوع نفسه' }, { status: 409 });
    console.error('[admin/blocklist POST]', error.message);
    return NextResponse.json({ error: 'فشل إضافة المصطلح' }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'pharmacist']);
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });

  const { error, count } = await supabaseAdmin
    .from('medicine_blocklist')
    .delete({ count: 'exact' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'فشل الحذف' }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'السطر غير موجود' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
