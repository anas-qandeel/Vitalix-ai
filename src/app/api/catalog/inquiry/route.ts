import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/catalog/inquiry — يسجّل اهتمام مريض بمنتج (حلقة التعلّم، إشارة patient_inquired).
 * مسار عام عمداً: المريض يفتح صفحته برابط بلا جلسة. الحماية بطريقة أخرى:
 *  - المعرّفات UUID فقط، والسياق (زيارة/خطة) يجب أن يكون موجوداً
 *  - المنتج يجب أن يخص صيدلية السياق نفسها (لا تسجيل عبر الصيدليات)
 *  - القيد الفريد في الجدول يمنع التكرار لنفس (السياق، المنتج)
 * لا يعيد أي بيانات عن المريض أو الصيدلية.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const context = body?.context === 'visit' || body?.context === 'weight_plan' ? body.context : null;
    const contextId = typeof body?.context_id === 'string' && UUID_RE.test(body.context_id) ? body.context_id : null;
    const productId = typeof body?.product_id === 'string' && UUID_RE.test(body.product_id) ? body.product_id : null;
    if (!context || !contextId || !productId) return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 });

    const table = context === 'visit' ? 'visitations' : 'weight_plans';
    const { data: ctx } = await supabaseAdmin
      .from(table)
      .select('id, pharmacy_id, patient_id, patient:patients(is_pregnant, is_lactating, diagnosed_conditions)')
      .eq('id', contextId)
      .maybeSingle();
    if (!ctx?.pharmacy_id) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    const { data: product } = await supabaseAdmin
      .from('pharmacy_products')
      .select('id, pharmacy_id')
      .eq('id', productId)
      .maybeSingle();
    if (!product || product.pharmacy_id !== ctx.pharmacy_id) return NextResponse.json({ error: 'غير موجود' }, { status: 404 });

    const p = Array.isArray(ctx.patient) ? ctx.patient[0] : ctx.patient;
    const conds: string[] = Array.isArray(p?.diagnosed_conditions) ? p.diagnosed_conditions : [];
    const { error } = await supabaseAdmin
      .from('catalog_product_events')
      .upsert({
        pharmacy_id:   ctx.pharmacy_id,
        product_id:    productId,
        patient_id:    ctx.patient_id ?? null,
        event_type:    'patient_inquired',
        context,
        context_id:    contextId,
        patient_flags: {
          is_pregnant:  p?.is_pregnant  === true,
          is_lactating: p?.is_lactating === true,
          hypertension: conds.includes('hypertension'),
          diabetes:     conds.includes('diabetes'),
        },
      }, { onConflict: 'event_type,context,context_id,product_id', ignoreDuplicates: true });
    if (error) console.warn('[catalog/inquiry] event write failed:', error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('[catalog/inquiry] error:', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
