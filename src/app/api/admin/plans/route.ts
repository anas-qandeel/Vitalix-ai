import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// خطط الاشتراك — شروط دفع فقط (إصدار واحد للنظام). owner فقط. لا تُلمس اشتراكات قائمة.
const OWNER = ['owner'] as const;
const COLS = 'id, name, price, duration_months, free_months, seats_limit, lifetime_price, note, is_active, created_at';

type PlanInput = { name: string; price: number; duration_months: number; free_months: number; seats_limit: number | null; lifetime_price: boolean; note: string | null; is_active: boolean };

function parsePlan(body: any): { ok: true; plan: PlanInput } | { ok: false; error: string } {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const price = Number(body?.price);
  const duration = Number(body?.duration_months);
  const free = body?.free_months == null || body.free_months === '' ? 0 : Number(body.free_months);
  const seats = body?.seats_limit == null || body.seats_limit === '' ? null : Number(body.seats_limit);
  if (!name) return { ok: false, error: 'اسم الخطة مطلوب' };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'السعر غير صالح' };
  if (!Number.isInteger(duration) || duration < 1 || duration > 36) return { ok: false, error: 'المدة بين 1 و36 شهراً' };
  if (!Number.isInteger(free) || free < 0 || free > 24) return { ok: false, error: 'الأشهر المجانية بين 0 و24' };
  if (seats !== null && (!Number.isInteger(seats) || seats < 1)) return { ok: false, error: 'المقاعد رقم موجب أو فارغ' };
  return { ok: true, plan: {
    name, price, duration_months: duration, free_months: free, seats_limit: seats,
    lifetime_price: body?.lifetime_price === true,
    note: typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null,
    is_active: body?.is_active !== false,
  } };
}

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  const { data: plans, error } = await supabaseAdmin.from('plans').select(COLS).order('created_at');
  if (error) return NextResponse.json({ error: 'فشل جلب الخطط' }, { status: 500 });
  const { data: subs } = await supabaseAdmin.from('subscriptions').select('plan_id').not('plan_id', 'is', null);
  const usage = new Map<string, number>();
  for (const s of subs || []) usage.set(s.plan_id, (usage.get(s.plan_id) ?? 0) + 1);
  return NextResponse.json({ data: (plans || []).map(p => ({ ...p, subscriptions_count: usage.get(p.id) ?? 0 })) });
}

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const parsed = parsePlan(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('plans').insert({ ...parsed.plan, created_by: auth.user.id }).select(COLS).single();
  if (error) { console.error('[admin/plans POST]', error.message); return NextResponse.json({ error: 'فشل إنشاء الخطة' }, { status: 500 }); }
  return NextResponse.json({ data: { ...data, subscriptions_count: 0 } });
}

export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  const parsed = parsePlan(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('plans').update(parsed.plan).eq('id', id).select(COLS).maybeSingle();
  if (error) { console.error('[admin/plans PUT]', error.message); return NextResponse.json({ error: 'فشل تعديل الخطة' }, { status: 500 }); }
  if (!data) return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  const { count } = await supabaseAdmin.from('subscriptions').select('id', { count: 'exact', head: true }).eq('plan_id', id);
  if ((count ?? 0) > 0) {
    // مستخدمة: أرشفة بدل الحذف كي تبقى الاشتراكات القائمة مرتبطة بها
    const { error } = await supabaseAdmin.from('plans').update({ is_active: false }).eq('id', id);
    if (error) return NextResponse.json({ error: 'فشل أرشفة الخطة' }, { status: 500 });
    return NextResponse.json({ ok: true, archived: true });
  }
  const { error, count: deleted } = await supabaseAdmin.from('plans').delete({ count: 'exact' }).eq('id', id);
  if (error) return NextResponse.json({ error: 'فشل حذف الخطة' }, { status: 500 });
  if (!deleted) return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 });
  return NextResponse.json({ ok: true, archived: false });
}
