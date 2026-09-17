import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireStaff } from '@/lib/api-auth';
import { looksLikeMedicine } from '@/lib/medicine-blocklist';

/**
 * POST /api/catalog/guard — الحارس الحتمي لحظة الحفظ (يغطي "حفظ بلا بطاقة" وتغيير الاسم بعد بناء البطاقة).
 * يفحص الاسم والمكونات بقائمة الأدوية، ويسجّل المحاولة المرفوضة في catalog_rejections. لا يحفظ شيئاً.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireStaff(req, ['owner', 'pharmacist']);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const brandName = typeof body?.brand_name === 'string' ? body.brand_name.trim() : '';
    const ingredients: string[] = Array.isArray(body?.ingredients) ? body.ingredients.filter((x: unknown): x is string => typeof x === 'string') : [];
    if (!brandName) return NextResponse.json({ error: 'اسم المنتج مطلوب' }, { status: 400 });

    const check = await looksLikeMedicine(brandName, ingredients);
    if (check.blocked) {
      const { error } = await supabaseAdmin.from('catalog_rejections').insert({
        pharmacy_id: auth.pharmacyId,
        user_id: auth.userId,
        brand_name: brandName,
        ingredients,
        reason: `مطابقة لمادة أو اسم دوائي عند الحفظ: ${check.matched.join('، ')}`,
        source: 'blocklist',
        matched_terms: check.matched,
      });
      if (error) console.warn('[catalog/guard] rejection log failed:', error);
    }
    return NextResponse.json({ blocked: check.blocked, matched: check.matched });
  } catch (err) {
    console.warn('[catalog/guard] error:', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
