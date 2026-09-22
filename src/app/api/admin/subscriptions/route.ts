import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { buildQuote, nextStart, promoError, type PlanRow, type PromoRow } from '@/lib/subscriptions';

// اشتراكات الصيدليات — الخادم يحسب كل شيء (السعر، الخصم، النهاية). owner + support.
// كل إنشاء يكتب سجل subscriptions ويحدّث أعمدة pharmacies القديمة من السجل نفسه (توافق مع الشاشة القديمة والحارس).
const ROLES = ['owner', 'support'] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const COLS = 'id, pharmacy_id, plan_id, promotion_id, starts_on, ends_on, list_price, discount, final_price, paid_amount, status, note, created_at';

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ROLES);
  if (!auth.authorized) return auth.response;
  const pid = new URL(request.url).searchParams.get('pharmacy_id') || '';
  if (!UUID.test(pid)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('subscriptions').select(COLS + ', plans(name), promotions(name)').eq('pharmacy_id', pid).order('starts_on', { ascending: false });
  if (error) return NextResponse.json({ error: 'فشل جلب الاشتراكات' }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, ROLES);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }

  const pharmacyId = typeof body.pharmacy_id === 'string' ? body.pharmacy_id : '';
  const planId = body.plan_id == null || body.plan_id === '' ? null : String(body.plan_id);
  const promoId = body.promotion_id == null || body.promotion_id === '' ? null : String(body.promotion_id);
  const requestedStart = typeof body.starts_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.starts_on) ? body.starts_on : null;
  const paidNow = body.paid_now == null || body.paid_now === '' ? 0 : Number(body.paid_now);
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  const dryRun = body.dry_run === true;
  if (!UUID.test(pharmacyId)) return NextResponse.json({ error: 'معرّف الصيدلية غير صالح' }, { status: 400 });
  if (planId && !UUID.test(planId)) return NextResponse.json({ error: 'معرّف الخطة غير صالح' }, { status: 400 });
  if (promoId && !UUID.test(promoId)) return NextResponse.json({ error: 'معرّف العرض غير صالح' }, { status: 400 });
  if (!Number.isFinite(paidNow) || paidNow < 0) return NextResponse.json({ error: 'المبلغ المدفوع غير صالح' }, { status: 400 });
  if (promoId && !planId) return NextResponse.json({ error: 'لا عرض على اشتراك تجريبي' }, { status: 400 });

  const { data: pharmacy } = await supabaseAdmin.from('pharmacies').select('id, name, status').eq('id', pharmacyId).maybeSingle();
  if (!pharmacy) return NextResponse.json({ error: 'الصيدلية غير موجودة' }, { status: 404 });
  if (pharmacy.status === 'archived') return NextResponse.json({ error: 'الصيدلية مؤرشفة' }, { status: 409 });

  const { data: settings } = await supabaseAdmin.from('platform_settings').select('default_trial_days').eq('id', true).single();
  const { data: current } = await supabaseAdmin.from('subscriptions').select('ends_on').eq('pharmacy_id', pharmacyId).order('ends_on', { ascending: false }).limit(1).maybeSingle();

  let plan: PlanRow | null = null;
  if (planId) {
    const { data } = await supabaseAdmin.from('plans').select('id, name, price, duration_months, free_months, seats_limit, lifetime_price, is_active').eq('id', planId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 });
    if (!data.is_active) return NextResponse.json({ error: 'الخطة مؤرشفة' }, { status: 409 });
    plan = data as PlanRow;
    if (plan.seats_limit != null) {
      const { count } = await supabaseAdmin.from('subscriptions').select('pharmacy_id', { count: 'exact', head: true }).eq('plan_id', plan.id).in('status', ['active', 'grace']).neq('pharmacy_id', pharmacyId);
      if ((count ?? 0) >= plan.seats_limit) return NextResponse.json({ error: `اكتملت مقاعد خطة «${plan.name}» (${plan.seats_limit})` }, { status: 409 });
    }
  }
  let promo: PromoRow | null = null;
  const startsOn = nextStart(current?.ends_on ?? null, requestedStart);
  if (promoId) {
    const { data } = await supabaseAdmin.from('promotions').select('id, name, discount_type, discount_value, valid_from, valid_to, max_uses, used_count, is_active').eq('id', promoId).maybeSingle();
    if (!data) return NextResponse.json({ error: 'العرض غير موجود' }, { status: 404 });
    promo = data as PromoRow;
    const err = promoError(promo, startsOn);
    if (err) return NextResponse.json({ error: err }, { status: 409 });
  }

  const quote = buildQuote({ plan, promo, startsOn, trialDays: settings?.default_trial_days ?? 60 });
  if (paidNow > quote.final_price) return NextResponse.json({ error: 'المدفوع أكبر من المبلغ المستحق' }, { status: 400 });
  if (dryRun) return NextResponse.json({ quote, plan_name: plan?.name ?? null, promo_name: promo?.name ?? null });

  const { data: sub, error: subErr } = await supabaseAdmin.from('subscriptions').insert({
    pharmacy_id: pharmacyId, plan_id: quote.plan_id, promotion_id: quote.promotion_id,
    starts_on: quote.starts_on, ends_on: quote.ends_on, list_price: quote.list_price, discount: quote.discount,
    final_price: quote.final_price, paid_amount: paidNow, status: quote.status, note, created_by: auth.user.id,
  }).select(COLS).single();
  if (subErr) { console.error('[admin/subscriptions POST]', subErr.message); return NextResponse.json({ error: 'فشل إنشاء الاشتراك' }, { status: 500 }); }

  // توافق: الأعمدة القديمة تعكس الاشتراك الجديد (الشاشة القديمة والحارس يقرآنها)
  const { error: phErr } = await supabaseAdmin.from('pharmacies').update({
    status: quote.status, expiry_date: quote.ends_on, total_amount_due: quote.final_price, paid_amount: paidNow, second_payment_date: null,
  }).eq('id', pharmacyId);
  if (phErr) console.error('[admin/subscriptions POST] pharmacies sync', phErr.message);
  if (promo) await supabaseAdmin.from('promotions').update({ used_count: promo.used_count + 1 }).eq('id', promo.id);

  return NextResponse.json({ data: sub });
}

export async function PATCH(request: Request) {
  const auth = await verifyPlatformAdmin(request, ROLES);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const id = typeof body.subscription_id === 'string' ? body.subscription_id : '';
  const amount = Number(body.amount);
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });

  const { data: sub } = await supabaseAdmin.from('subscriptions').select('id, pharmacy_id, final_price, paid_amount').eq('id', id).maybeSingle();
  if (!sub) return NextResponse.json({ error: 'الاشتراك غير موجود' }, { status: 404 });
  const newPaid = Math.round((Number(sub.paid_amount) + amount) * 100) / 100;
  if (newPaid > Number(sub.final_price)) return NextResponse.json({ error: `الدفعة تتجاوز المتبقي (${(Number(sub.final_price) - Number(sub.paid_amount)).toFixed(2)})` }, { status: 400 });

  const { data, error } = await supabaseAdmin.from('subscriptions').update({ paid_amount: newPaid }).eq('id', id).select(COLS).single();
  if (error) return NextResponse.json({ error: 'فشل تسجيل الدفعة' }, { status: 500 });
  await supabaseAdmin.from('pharmacies').update({ paid_amount: newPaid }).eq('id', sub.pharmacy_id);
  return NextResponse.json({ data });
}
