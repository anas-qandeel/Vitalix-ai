import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// نتائج عدّاد /welcome لمالك المنصة فقط. القراءة من welcome_funnel وwelcome_visits (جدولان للخادم فقط)،
// ولا يخرج من هنا أي صف خام: التجميع كله في السيرفر.
const PERIODS = ['today', 'last_7_days', 'all_time'] as const;
type Period = typeof PERIODS[number];
const PAGE = 1000;

const ammanParts = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce<Record<string, string>>((acc, p) => { acc[p.type] = p.value; return acc; }, {});

// منتصف ليل اليوم بتوقيت عمّان، مطابقاً لتعريف الـview (date_trunc بتوقيت Asia/Amman)؛
// نجرّب الإزاحتين الممكنتين بدل تثبيت +3 كي لا ينكسر إن عاد التوقيت الصيفي
function ammanMidnight(now: Date): Date {
  const p = ammanParts(now);
  for (const offsetH of [3, 2]) {
    const guess = new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offsetH * 3600_000);
    const g = ammanParts(guess);
    if (g.hour === '00' && g.day === p.day) return guess;
  }
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - 3 * 3600_000);
}

function sinceFor(period: Period): string | null {
  const now = new Date();
  if (period === 'today') return ammanMidnight(now).toISOString();
  if (period === 'last_7_days') return new Date(now.getTime() - 7 * 86400_000).toISOString();
  return null;
}

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

    const since = sinceFor(period);
    const devices: Record<string, { mobile: number; desktop: number }> = {};
    const buttons: Record<string, Record<string, number>> = {};

    // الحد الافتراضي 1000 صف، فنقرأ بالصفحات حتى تنتهي الصفوف (ترتيب ثابت كي لا تتداخل الصفحات)
    for (let from = 0; ; from += PAGE) {
      let q = supabaseAdmin.from('welcome_visits').select('src, device, wa_clicks, created_at')
        .order('created_at', { ascending: true }).order('visit_id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (since) q = q.gte('created_at', since);
      const { data, error } = await q;
      if (error) throw error;
      for (const v of data || []) {
        const d = (devices[v.src] ||= { mobile: 0, desktop: 0 });
        if (v.device === 'mobile') d.mobile++;
        else if (v.device === 'desktop') d.desktop++;
        for (const tag of new Set<string>(v.wa_clicks || [])) {
          const b = (buttons[tag] ||= {});
          b[v.src] = (b[v.src] || 0) + 1;
        }
      }
      if (!data || data.length < PAGE) break;
    }

    return NextResponse.json(
      { period, generated_at: new Date().toISOString(), funnel: funnel || [], devices, buttons },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'تعذّر تحميل الإحصاءات' }, { status: 500 });
  }
}
