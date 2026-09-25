import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// الجولة اليومية لدورة حياة الاشتراك. يستدعيه Vercel Cron (Authorization: Bearer CRON_SECRET)
// أو المالك يدوياً من الإدارة. المنطق كله في الدالة run_subscription_lifecycle() داخل القاعدة.
export const maxDuration = 30;

async function authorized(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') || '';
  const secret = process.env.CRON_SECRET;
  if (secret && header === `Bearer ${secret}`) return true;
  const auth = await verifyPlatformAdmin(request, ['owner']);
  return auth.authorized;
}

async function run() {
  const { data, error } = await supabaseAdmin.rpc('run_subscription_lifecycle');
  if (error) { console.error('[cron/subscriptions]', error.message); return NextResponse.json({ error: 'فشلت الجولة' }, { status: 500 }); }
  const rows = (data || []) as { pharmacy_id: string; action: string }[];
  console.log(`[cron/subscriptions] ran: ${rows.length} action(s)`, rows);
  return NextResponse.json({ ok: true, actions: rows });
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
  return run();
}
export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: 'غير مصرّح' }, { status: 401 });
  return run();
}
