import { supabaseAdmin } from '@/lib/supabase-admin';

// قراءة كل زيارات /welcome لفترة بالصفحات (الحد الافتراضي 1000 صف)، للخادم فقط.
// ترتيب ثابت (الأحدث أولاً ثم visit_id) كي لا تتداخل الصفحات.
export interface RawVisit {
  visit_id: string;
  created_at: string;
  updated_at: string;
  src: string;
  device: string | null;
  active_seconds: number;
  max_section: number;
  wa_clicks: string[];
}

const PAGE = 1000;

export async function fetchAllVisits(since: string | null): Promise<RawVisit[]> {
  const all: RawVisit[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin.from('welcome_visits')
      .select('visit_id, created_at, updated_at, src, device, active_seconds, max_section, wa_clicks')
      .order('created_at', { ascending: false }).order('visit_id', { ascending: false })
      .range(from, from + PAGE - 1);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...((data || []) as RawVisit[]));
    if (!data || data.length < PAGE) break;
  }
  return all;
}
