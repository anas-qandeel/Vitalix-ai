import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { PERIODS, sinceFor, type Period } from '@/lib/welcome-period';

// قائمة زيارات /welcome المنفردة لمالك المنصة فقط. معرّف الزيارة الكامل لا يخرج من هنا:
// نُرجع أول 8 أحرف رقماً مرجعياً كي لا تُتداول قيمة تُستعمل مفتاحاً في الجدول.
const PAGE_SIZE = 50;
const SRC_RE = /^[a-z0-9-]{1,24}$/;

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;

  const params = new URL(request.url).searchParams;
  const period = params.get('period') as Period | null;
  const src = params.get('src') || 'all';
  const pageRaw = params.get('page') || '1';
  if (!period || !PERIODS.includes(period)) return NextResponse.json({ error: 'فترة غير صالحة' }, { status: 400 });
  if (src !== 'all' && !SRC_RE.test(src)) return NextResponse.json({ error: 'مصدر غير صالح' }, { status: 400 });
  if (!/^[1-9]\d{0,6}$/.test(pageRaw)) return NextResponse.json({ error: 'رقم صفحة غير صالح' }, { status: 400 });
  const page = Number(pageRaw);

  try {
    const from = (page - 1) * PAGE_SIZE;
    let q = supabaseAdmin.from('welcome_visits')
      .select('visit_id, created_at, updated_at, src, device, active_seconds, max_section, wa_clicks', { count: 'exact' })
      .order('created_at', { ascending: false }).order('visit_id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    const since = sinceFor(period);
    if (since) q = q.gte('created_at', since);
    if (src !== 'all') q = q.eq('src', src);
    const { data, count, error } = await q;
    if (error) throw error;

    const visits = (data || []).map(({ visit_id, ...rest }) => ({ ref: String(visit_id).slice(0, 8), ...rest }));
    return NextResponse.json(
      { total: count ?? 0, page, page_size: PAGE_SIZE, visits },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'تعذّر تحميل الزيارات' }, { status: 500 });
  }
}
