import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// مراقبة الذكاء الاصطناعي — أعداد الاستدعاءات وأحداث الفشل والرسائل الاحتياطية في كل الصيدليات.
// للمالك والدعم فقط. القراءة من ai_usage_log (جدول خادم فقط).
const PERIOD_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };
const FEATURES = ['vitals_report', 'weight_plan', 'catalog_profile'];
const PROBLEMS = ['failed', 'fallback'];
const LIMIT = 200;

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'support']);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const periodParam = url.searchParams.get('period') || '7d';
  const period = PERIOD_DAYS[periodParam] ? periodParam : '7d';
  const featureParam = url.searchParams.get('feature') || '';
  const feature = FEATURES.includes(featureParam) ? featureParam : null;
  const outcomeParam = url.searchParams.get('outcome') || '';
  const outcomes = PROBLEMS.includes(outcomeParam) ? [outcomeParam] : PROBLEMS;
  const since = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000).toISOString();

  try {
    const countOf = async (outcome: string): Promise<number> => {
      let q = supabaseAdmin.from('ai_usage_log').select('id', { count: 'exact', head: true })
        .eq('outcome', outcome).gte('created_at', since);
      if (feature) q = q.eq('feature', feature);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };
    const [used, discarded, failed, fallback] = await Promise.all(
      ['used', 'discarded', 'failed', 'fallback'].map(countOf)
    );

    let q = supabaseAdmin.from('ai_usage_log')
      .select('id, created_at, pharmacy_id, feature, step, model, outcome, error_status, error_message')
      .in('outcome', outcomes)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(LIMIT);
    if (feature) q = q.eq('feature', feature);
    const { data: rows, error } = await q;
    if (error) throw error;

    const ids = Array.from(new Set((rows || []).map(r => r.pharmacy_id).filter(Boolean)));
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: phs } = await supabaseAdmin.from('pharmacies').select('id, name').in('id', ids);
      for (const p of phs || []) names.set(p.id, p.name);
    }
    const events = (rows || []).map(r => ({ ...r, pharmacy_name: names.get(r.pharmacy_id) || 'صيدلية محذوفة' }));

    return NextResponse.json({ period, counts: { used, discarded, failed, fallback }, events });
  } catch (e) {
    console.error('[admin/ai-monitor] failed:', e);
    return NextResponse.json({ error: 'تعذّر جلب بيانات المراقبة' }, { status: 500 });
  }
}
