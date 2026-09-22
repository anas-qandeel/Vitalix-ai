import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// إعدادات المنصة — صف واحد (id = true). owner فقط.
const OWNER = ['owner'] as const;
const COLS = 'default_trial_days, grace_days, warn_days_before, currency, updated_at';

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  const { data, error } = await supabaseAdmin.from('platform_settings').select(COLS).eq('id', true).single();
  if (error) return NextResponse.json({ error: 'فشل جلب الإعدادات' }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request, OWNER);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const trial = Number(body?.default_trial_days), grace = Number(body?.grace_days), warn = Number(body?.warn_days_before);
  const currency = typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase().slice(0, 3) : 'JOD';
  if (!Number.isInteger(trial) || trial < 0 || trial > 365) return NextResponse.json({ error: 'المدة التجريبية بين 0 و365 يوماً' }, { status: 400 });
  if (!Number.isInteger(grace) || grace < 0 || grace > 90) return NextResponse.json({ error: 'أيام السماح بين 0 و90' }, { status: 400 });
  if (!Number.isInteger(warn) || warn < 0 || warn > 90) return NextResponse.json({ error: 'أيام التنبيه بين 0 و90' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('platform_settings')
    .update({ default_trial_days: trial, grace_days: grace, warn_days_before: warn, currency, updated_at: new Date().toISOString(), updated_by: auth.user.id })
    .eq('id', true).select(COLS).single();
  if (error) { console.error('[admin/settings PUT]', error.message); return NextResponse.json({ error: 'فشل حفظ الإعدادات' }, { status: 500 }); }
  return NextResponse.json({ data });
}
