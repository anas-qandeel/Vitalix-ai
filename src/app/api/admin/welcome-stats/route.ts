import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { PERIODS, sinceFor, type Period } from '@/lib/welcome-period';
import { tallyVisit, type DeviceTally } from '@/lib/welcome-stats';
import { fetchAllVisits } from '@/lib/welcome-visits-server';

// نتائج عدّاد /welcome لمالك المنصة فقط. القراءة من welcome_funnel وwelcome_visits (جدولان للخادم فقط)،
// ولا يخرج من هنا أي صف خام: التجميع كله في السيرفر.
export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;

  const period = new URL(request.url).searchParams.get('period') as Period | null;
  if (!period || !PERIODS.includes(period)) {
    return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 });
  }

  try {
    const { data: funnel, error: funnelErr } = await supabaseAdmin
      .from('welcome_funnel').select('*').eq('period', period);
    if (funnelErr) throw funnelErr;

    const devices: Record<string, DeviceTally> = {};
    const buttons: Record<string, Record<string, number>> = {};
    for (const v of await fetchAllVisits(sinceFor(period))) tallyVisit(v, devices, buttons);

    return NextResponse.json(
      { period, generated_at: new Date().toISOString(), funnel: funnel || [], devices, buttons },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'تعذّر تحميل الإحصاءات' }, { status: 500 });
  }
}
