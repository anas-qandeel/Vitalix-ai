import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// عروض/خصومات تُطبَّق عند إنشاء اشتراك. owner فقط.
const OWNER = ['owner'] as const;
const COLS = 'id, name, discount_type, discount_value, code, valid_from, valid_to, max_uses, used_count, is_active, created_at';

function parsePromo(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const type = body?.discount_type;
  const value = Number(body?.discount_value);
  const code = typeof body?.code === 'string' && body.code.trim() ? body.code.trim().toUpperCase().slice(0, 30) : null;
  const from = typeof body?.valid_from === 'string' && body.valid_from ? body.valid_from : null;
  const to = typeof body?.valid_to === 'string' && body.valid_to ? body.valid_to : null;
  const max = body?.max_uses == null || body.max_uses === '' ? null : Number(body.max_uses);
  if (!name) return { error: 'اسم العرض مطلوب' };
  if (type !== 'percent' && type !== 'amount') return { error: 'نوع الخصم نسبة أو مبلغ' };
  if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100)) return { error: 'قيمة الخصم غير صالحة' };
  if (from && to && to < from) return { error: 'تاريخ النهاية قبل البداية' };
  if (max !== null && (!Number.isInteger(max) || max < 1)) return { error: 'حد الاستخدام رقم موجب أو فارغ' };
  return { promo: { name, discount_type: type, discount_value: value, code, valid_from: from, valid_to: to, max_uses: max, is_active: body?.is_active !== false } };
}

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  const { data, error } = await supabaseAdmin.from('promotions').select(COLS).order('created_at');
  if (error) return NextResponse.json({ error: 'فشل جلب العروض' }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const p = parsePromo(body);
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('promotions').insert({ ...p.promo, created_by: auth.user.id }).select(COLS).single();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'هذا الكود مستخدم أصلاً' }, { status: 409 });
    console.error('[admin/promotions POST]', error.message); return NextResponse.json({ error: 'فشل إنشاء العرض' }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  const p = parsePromo(body);
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('promotions').update(p.promo).eq('id', id).select(COLS).maybeSingle();
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'هذا الكود مستخدم أصلاً' }, { status: 409 });
    return NextResponse.json({ error: 'فشل تعديل العرض' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  const { count } = await supabaseAdmin.from('subscriptions').select('id', { count: 'exact', head: true }).eq('promotion_id', id);
  if ((count ?? 0) > 0) {
    const { error } = await supabaseAdmin.from('promotions').update({ is_active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: 'فشل أرشفة العرض' }, { status: 500 });
    return NextResponse.json({ ok: true, archived: true });
  }
  const { error, count: deleted } = await supabaseAdmin.from('promotions').delete({ count: 'exact' }).eq('id', id);
  if (error) return NextResponse.json({ error: 'فشل حذف العرض' }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });
  return NextResponse.json({ ok: true, archived: false });
}
