import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

// سجل المنتجات المرفوضة (catalog_rejections) — قراءة فقط لمدير المنصة.
// الجدول خادم فقط؛ لا مفتاح أجنبي على pharmacy_id فيُدمج اسم الصيدلية باستعلام ثانٍ.

const LIMIT = 200;

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  const { data: rows, error } = await supabaseAdmin
    .from('catalog_rejections')
    .select('id, pharmacy_id, brand_name, ingredients, reason, source, matched_terms, image_url, created_at')
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) return NextResponse.json({ error: 'فشل جلب سجل المرفوضات' }, { status: 500 });

  const ids = Array.from(new Set((rows || []).map(r => r.pharmacy_id).filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: phs } = await supabaseAdmin.from('pharmacies').select('id, name').in('id', ids);
    for (const p of phs || []) names.set(p.id, p.name);
  }

  const data = (rows || []).map(r => ({ ...r, pharmacy_name: names.get(r.pharmacy_id) || 'صيدلية محذوفة' }));
  return NextResponse.json({ data });
}
