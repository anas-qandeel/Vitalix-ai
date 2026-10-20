import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { estimateCostUsd } from '@/lib/ai-pricing';

// مراقبة الذكاء الاصطناعي — أعداد الاستدعاءات وأحداث الفشل والرسائل الاحتياطية في كل الصيدليات.
// للمالك والدعم فقط. القراءة من ai_usage_log (جدول خادم فقط).
const PERIOD_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '30d': 30 };
const FEATURES = ['vitals_report', 'weight_plan', 'catalog_profile'];
const PROBLEMS = ['failed', 'fallback'];
const LIMIT = 200;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// الشهر الحالي بتوقيت عمّان (YYYY-MM) — حدود الشهر في القاعدة بالتوقيت نفسه
const ammanMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' }).slice(0, 7);

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'support']);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);

  // بطاقة التكلفة التقديرية: فرع منفصل كي لا يستدعي تحديث قائمة الأعطال دالة التجميع في كل مرة
  if (url.searchParams.get('view') === 'cost') {
    const month = url.searchParams.get('month') || ammanMonth();
    if (!MONTH_RE.test(month)) return NextResponse.json({ error: 'صيغة الشهر غير صحيحة' }, { status: 400 });
    try {
      const { data, error } = await supabaseAdmin.rpc('ai_usage_by_pharmacy', { p_month: `${month}-01` });
      if (error) throw error;
      // الدالة تُرجع صفاً لكل (صيدلية، نموذج) لأن السعر يختلف بالنموذج؛ نحسب التكلفة لكل صف ثم نجمع حسب الصيدلية
      const byPharmacy = new Map<string, { pharmacy_id: string; pharmacy_name: string; calls: number; failed: number; prompt_tokens: number; output_tokens: number; cost_usd: number }>();
      for (const r of data || []) {
        const cur = byPharmacy.get(r.pharmacy_id) ?? { pharmacy_id: r.pharmacy_id, pharmacy_name: r.pharmacy_name, calls: 0, failed: 0, prompt_tokens: 0, output_tokens: 0, cost_usd: 0 };
        cur.calls += Number(r.calls);
        cur.failed += Number(r.failed);
        cur.prompt_tokens += Number(r.prompt_tokens);
        cur.output_tokens += Number(r.output_tokens);
        cur.cost_usd += estimateCostUsd(r.model, Number(r.prompt_tokens), Number(r.output_tokens), month);
        byPharmacy.set(r.pharmacy_id, cur);
      }
      const rows = [...byPharmacy.values()].sort((a, b) => b.cost_usd - a.cost_usd);
      const total = rows.reduce(
        (t, r) => ({ calls: t.calls + r.calls, failed: t.failed + r.failed, prompt_tokens: t.prompt_tokens + r.prompt_tokens, output_tokens: t.output_tokens + r.output_tokens, cost_usd: t.cost_usd + r.cost_usd }),
        { calls: 0, failed: 0, prompt_tokens: 0, output_tokens: 0, cost_usd: 0 }
      );
      return NextResponse.json({ month, rows, total });
    } catch (e) {
      console.error('[admin/ai-monitor] cost failed:', e);
      return NextResponse.json({ error: 'تعذّر جلب بيانات التكلفة' }, { status: 500 });
    }
  }

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
