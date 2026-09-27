import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// اقتراحات المستخدمين — القراءة والتعديل لأي مسؤول منصة، الحذف للمالك وحده.
// يستبدل هذا المسار الكتابة المباشرة من المتصفح عبر supabase (anon)، لأن RLS على جدول feedback لا تفرّق بين الأدوار.

const UUID = /^[0-9a-f-]{36}$/i;
const COLS = 'id, pharmacy_id, pharmacy_name, pharmacist_name, type, message, rating, is_read, is_archived, status, admin_note, handled_by, handled_at, actions, created_at';
const STATUSES = ['new', 'in_progress', 'resolved', 'rejected'] as const;

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  const { data, error } = await supabaseAdmin.from('feedback').select(COLS).order('created_at', { ascending: false });
  if (error) {
    console.error('[admin/feedback GET]', error.message);
    return NextResponse.json({ error: 'فشل جلب الاقتراحات' }, { status: 500 });
  }

  const ids = [...new Set((data as any[]).map(f => f.pharmacy_id).filter(Boolean))];
  const phoneMap: Record<string, { name: string; phone_number: string | null }> = {};
  if (ids.length) {
    const { data: pharmacies } = await supabaseAdmin.from('pharmacies').select('id, name, phone_number').in('id', ids);
    (pharmacies || []).forEach((p: any) => { phoneMap[p.id] = { name: p.name, phone_number: p.phone_number }; });
  }

  const enriched = (data as any[]).map(f => ({
    ...f,
    pharmacy_name: phoneMap[f.pharmacy_id]?.name || f.pharmacy_name,
    pharmacy_phone: phoneMap[f.pharmacy_id]?.phone_number ?? null,
    actions: Array.isArray(f.actions) ? f.actions : [],
  }));

  return NextResponse.json({ data: enriched });
}

export async function PATCH(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  let body: { op?: unknown; id?: unknown; status?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const op = typeof body.op === 'string' ? body.op : '';

  if (op === 'read_all') {
    const { error } = await supabaseAdmin.from('feedback').update({ is_read: true }).eq('is_read', false).eq('is_archived', false);
    if (error) {
      console.error('[admin/feedback PATCH read_all]', error.message);
      return NextResponse.json({ error: 'فشل حفظ التعديل' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });

  const { data: current } = await supabaseAdmin.from('feedback').select('id, status, actions, is_archived').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'الاقتراح غير موجود' }, { status: 404 });

  let update: Record<string, unknown>;

  if (op === 'read') {
    update = { is_read: true };
  } else if (op === 'archive') {
    update = { is_archived: true, is_read: true };
  } else if (op === 'unarchive') {
    update = { is_archived: false };
  } else if (op === 'action') {
    const status = typeof body.status === 'string' ? body.status : '';
    if (!(STATUSES as readonly string[]).includes(status)) return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;

    const { data: adminRow } = await supabaseAdmin.from('platform_admins').select('name').eq('user_id', auth.user.id).maybeSingle();
    const by = adminRow?.name || auth.user.email || 'المسؤول';
    const at = new Date().toISOString();
    const actions = Array.isArray(current.actions) ? current.actions : [];

    update = {
      status,
      actions: [...actions, { status, note, by, by_id: auth.user.id, at }],
      handled_by: by,
      handled_at: at,
      is_read: true,
    };
  } else {
    return NextResponse.json({ error: 'عملية غير صالحة' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from('feedback').update(update).eq('id', id).select(COLS).single();
  if (error) {
    console.error('[admin/feedback PATCH]', error.message);
    return NextResponse.json({ error: 'فشل حفظ التعديل' }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });

  const { error } = await supabaseAdmin.from('feedback').delete().eq('id', id);
  if (error) {
    console.error('[admin/feedback DELETE]', error.message);
    return NextResponse.json({ error: 'فشل الحذف' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
