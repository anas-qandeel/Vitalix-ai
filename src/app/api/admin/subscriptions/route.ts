import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { buildQuote, nextStart, promoError, type PlanRow, type PromoRow, PAYMENT_METHODS, ammanTodayISO, type PaymentMethod } from '@/lib/subscriptions';

// اشتراكات الصيدليات — الخادم يحسب كل شيء (السعر، الخصم، النهاية). owner + support.
// كل إنشاء يكتب سجل subscriptions ويحدّث أعمدة pharmacies القديمة من السجل نفسه (توافق مع الشاشة القديمة والحارس).
// الدفعات تُسجَّل عبر record_payment/void_payment (هجرة payments_ledger) — ذرّية وتُبقي paid_amount = مجموع الدفعات.
const ROLES = ['owner', 'support'] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const COLS = 'id, pharmacy_id, plan_id, promotion_id, starts_on, ends_on, list_price, discount, final_price, paid_amount, next_due_on, status, note, created_at';

// ترجمة أخطاء دالتي record_payment/void_payment (raise exception بالإنجليزية) لرسائل عربية للواجهة
function paymentError(message: string, fallback: string): { status: number; error: string } {
  if (message === 'INVALID_AMOUNT') return { status: 400, error: 'مبلغ الدفعة غير صالح' };
  if (message === 'INVALID_DATE') return { status: 400, error: 'تاريخ الدفعة لا يكون في المستقبل' };
  if (message === 'SUBSCRIPTION_NOT_FOUND') return { status: 404, error: 'الاشتراك غير موجود' };
  if (message === 'EXCEEDS_REMAINING') return { status: 400, error: 'الدفعة تتجاوز المبلغ المتبقي' };
  if (message === 'PAYMENT_NOT_FOUND') return { status: 404, error: 'الدفعة غير موجودة' };
  if (message.includes('payments_method_check')) return { status: 400, error: 'طريقة الدفع غير صالحة' };
  return { status: 500, error: fallback };
}

// طريقة الدفع وتاريخه من جسم الطلب — مشتركة بين POST (دفعة أولى) و PATCH (دفعة لاحقة)
function readPaymentInput(body: any): { error: string } | { method: PaymentMethod; paidOn: string } {
  const method = body?.method;
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) return { error: 'طريقة الدفع غير صالحة' };
  const paidOn = typeof body?.paid_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_on) ? body.paid_on : ammanTodayISO();
  return { method: method as PaymentMethod, paidOn };
}

// موعد استحقاق الدفعة التالية: yyyy-mm-dd صحيح، ليس في الماضي (بتوقيت عمّان)، وليس قبل بداية الاشتراك
function validateDueDate(d: unknown, startsOn: string): { date: string | null; error: string | null } {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return { date: null, error: 'تاريخ استحقاق الدفعة التالية غير صالح' };
  if (d < ammanTodayISO()) return { date: null, error: 'تاريخ استحقاق الدفعة التالية لا يكون في الماضي' };
  if (d < startsOn) return { date: null, error: 'تاريخ الاستحقاق لا يسبق بداية الاشتراك' };
  return { date: d, error: null };
}

// يحفظ الموعد (أو يمسحه بـnull) ويعكسه على العمود القديم pharmacies.second_payment_date إن كان هذا أحدث اشتراك للصيدلية
async function setDueOn(subscriptionId: string, pharmacyId: string, due: string | null): Promise<boolean> {
  const { error } = await supabaseAdmin.from('subscriptions').update({ next_due_on: due }).eq('id', subscriptionId);
  if (error) { console.error('[admin/subscriptions] next_due_on update', error.message); return false; }
  const { data: self } = await supabaseAdmin.from('subscriptions').select('ends_on').eq('id', subscriptionId).single();
  const { data: later } = await supabaseAdmin.from('subscriptions').select('id').eq('pharmacy_id', pharmacyId).gt('ends_on', self?.ends_on ?? '').limit(1);
  if (self && (later ?? []).length === 0) {
    const { error: phErr } = await supabaseAdmin.from('pharmacies').update({ second_payment_date: due }).eq('id', pharmacyId);
    if (phErr) console.error('[admin/subscriptions] second_payment_date sync', phErr.message);
  }
  return true;
}

export async function GET(request: Request) {
  const auth = await verifyPlatformAdmin(request, ROLES);
  if (!auth.authorized) return auth.response;
  const pid = new URL(request.url).searchParams.get('pharmacy_id') || '';
  if (!UUID.test(pid)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  const { data, error } = await supabaseAdmin.from('subscriptions').select(COLS + ', plans(name), promotions(name), payments(id, amount, paid_on, method, note, created_at)').eq('pharmacy_id', pid).order('starts_on', { ascending: false });
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

  let paymentMethod: PaymentMethod | null = null;
  let paidOn = ammanTodayISO();
  if (!dryRun && paidNow > 0) {
    const input = readPaymentInput(body);
    if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
    paymentMethod = input.method;
    paidOn = input.paidOn;
  }

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

  // موعد استحقاق الدفعة التالية: اختياري في الخادم؛ يُتحقق منه إن وُجد، ويُهمل إن سُدِّد كل المستحق
  let nextDueOn: string | null = null;
  if (body.next_due_on != null && body.next_due_on !== '') {
    const d = body.next_due_on;
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
      return NextResponse.json({ error: 'تاريخ استحقاق الدفعة التالية غير صالح' }, { status: 400 });
    }
    if (d < ammanTodayISO()) return NextResponse.json({ error: 'تاريخ استحقاق الدفعة التالية لا يكون في الماضي' }, { status: 400 });
    if (d < quote.starts_on) return NextResponse.json({ error: 'تاريخ الاستحقاق لا يسبق بداية الاشتراك' }, { status: 400 });
    if (paidNow < quote.final_price) nextDueOn = d;
  }
  if (dryRun) return NextResponse.json({ quote, plan_name: plan?.name ?? null, promo_name: promo?.name ?? null });

  const { data: sub, error: subErr } = await supabaseAdmin.from('subscriptions').insert({
    pharmacy_id: pharmacyId, plan_id: quote.plan_id, promotion_id: quote.promotion_id,
    starts_on: quote.starts_on, ends_on: quote.ends_on, list_price: quote.list_price, discount: quote.discount,
    final_price: quote.final_price, paid_amount: 0, next_due_on: nextDueOn, status: quote.status, note, created_by: auth.user.id,
  }).select(COLS).single();
  if (subErr) { console.error('[admin/subscriptions POST]', subErr.message); return NextResponse.json({ error: 'فشل إنشاء الاشتراك' }, { status: 500 }); }

  if (paidNow > 0) {
    const { error: payErr } = await supabaseAdmin.rpc('record_payment', {
      p_subscription_id: sub.id, p_amount: paidNow, p_paid_on: paidOn, p_method: paymentMethod, p_note: note, p_actor: auth.user.id,
    });
    if (payErr) {
      console.error('[admin/subscriptions POST] record_payment', payErr.message);
      await supabaseAdmin.from('subscriptions').delete().eq('id', sub.id);
      const { status, error: errMsg } = paymentError(payErr.message, 'فشل تسجيل الدفعة — لم يُنشأ الاشتراك');
      return NextResponse.json({ error: errMsg }, { status });
    }
  }

  // توافق: الأعمدة القديمة تعكس الاشتراك الجديد (الشاشة القديمة والحارس يقرآنها)
  const { error: phErr } = await supabaseAdmin.from('pharmacies').update({
    status: quote.status, expiry_date: quote.ends_on, total_amount_due: quote.final_price, paid_amount: paidNow, second_payment_date: nextDueOn,
  }).eq('id', pharmacyId);
  if (phErr) console.error('[admin/subscriptions POST] pharmacies sync', phErr.message);
  if (promo) await supabaseAdmin.from('promotions').update({ used_count: promo.used_count + 1 }).eq('id', promo.id);

  const { data: finalSub } = await supabaseAdmin.from('subscriptions').select(COLS).eq('id', sub.id).single();
  return NextResponse.json({ data: finalSub ?? sub });
}

export async function PATCH(request: Request) {
  const auth = await verifyPlatformAdmin(request, ROLES);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const id = typeof body.subscription_id === 'string' ? body.subscription_id : '';
  const amount = Number(body.amount);
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });

  const input = readPaymentInput(body);
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;

  // موعد الدفعة التالية (اختياري): يُتحقق منه قبل تسجيل الدفعة كي لا تُحفظ الدفعة ثم يُرفض الطلب
  const { data: before, error: beforeErr } = await supabaseAdmin.from('subscriptions').select('starts_on, final_price, paid_amount, pharmacy_id, next_due_on').eq('id', id).single();
  if (beforeErr || !before) return NextResponse.json({ error: 'الاشتراك غير موجود' }, { status: 404 });
  let requestedDue: string | null = null;
  if (body.next_due_on != null && body.next_due_on !== '') {
    const v = validateDueDate(body.next_due_on, before.starts_on);
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
    requestedDue = v.date;
  }

  // record_payment تقفل الاشتراك وتتولى pharmacies (توافق الأعمدة القديمة) داخلياً — لا تحديث يدوي هنا
  const { data: payment, error: payErr } = await supabaseAdmin.rpc('record_payment', {
    p_subscription_id: id, p_amount: amount, p_paid_on: input.paidOn, p_method: input.method, p_note: note, p_actor: auth.user.id,
  });
  if (payErr) {
    console.error('[admin/subscriptions PATCH]', payErr.message);
    const { status, error: errMsg } = paymentError(payErr.message, 'فشل تسجيل الدفعة');
    return NextResponse.json({ error: errMsg }, { status });
  }

  // بعد الدفعة: إن سُدِّد كل المستحق يُمسح الموعد؛ وإن بقي متبقٍ وأُرسل موعد جديد يُحفظ
  const remainingAfter = Math.round((Number(before.final_price) - Number(before.paid_amount) - amount) * 100) / 100;
  if (remainingAfter <= 0) {
    if (before.next_due_on) await setDueOn(id, before.pharmacy_id, null);
  } else if (requestedDue) {
    await setDueOn(id, before.pharmacy_id, requestedDue);
  }

  const { data, error } = await supabaseAdmin.from('subscriptions').select(COLS).eq('id', id).single();
  if (error) { console.error('[admin/subscriptions PATCH] refetch', error.message); return NextResponse.json({ error: 'فشل تسجيل الدفعة' }, { status: 500 }); }
  return NextResponse.json({ data, payment });
}

// تعديل موعد استحقاق الدفعة التالية وحده (تأجيل باتفاق) أو مسحه — owner + support، مع أثر في سجل التدقيق
export async function PUT(request: Request) {
  const auth = await verifyPlatformAdmin(request, ROLES);
  if (!auth.authorized) return auth.response;
  let body: any; try { body = await request.json(); } catch { return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 }); }
  const id = typeof body.subscription_id === 'string' ? body.subscription_id : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });

  const { data: sub, error: subErr } = await supabaseAdmin.from('subscriptions').select('id, pharmacy_id, starts_on, final_price, paid_amount, next_due_on').eq('id', id).single();
  if (subErr || !sub) return NextResponse.json({ error: 'الاشتراك غير موجود' }, { status: 404 });

  let due: string | null = null;
  if (body.next_due_on != null && body.next_due_on !== '') {
    const v = validateDueDate(body.next_due_on, sub.starts_on);
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
    due = v.date;
  }
  const left = Math.round((Number(sub.final_price) - Number(sub.paid_amount)) * 100) / 100;
  if (due && left <= 0) return NextResponse.json({ error: 'لا متبقي على هذا الاشتراك — لا موعد له' }, { status: 400 });

  if (!(await setDueOn(id, sub.pharmacy_id, due))) return NextResponse.json({ error: 'فشل تحديث الموعد' }, { status: 500 });

  const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: auth.user.id,
    action: 'set_next_due_on',
    pharmacy_id: sub.pharmacy_id,
    details: { subscription_id: id, from: sub.next_due_on, to: due, actor_role: auth.role },
  });
  if (auditErr) console.error('[admin/subscriptions PUT] audit log failed:', auditErr.message);

  const { data } = await supabaseAdmin.from('subscriptions').select(COLS).eq('id', id).single();
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner']);
  if (!auth.authorized) return auth.response;
  const paymentId = new URL(request.url).searchParams.get('payment_id') || '';
  if (!UUID.test(paymentId)) return NextResponse.json({ error: 'معرّف غير صالح' }, { status: 400 });

  const { data: voided, error } = await supabaseAdmin.rpc('void_payment', { p_payment_id: paymentId });
  if (error) {
    console.error('[admin/subscriptions DELETE]', error.message);
    const { status, error: errMsg } = paymentError(error.message, 'فشل إلغاء الدفعة');
    return NextResponse.json({ error: errMsg }, { status });
  }

  const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: auth.user.id,
    action: 'void_payment',
    pharmacy_id: voided.pharmacy_id,
    details: { payment_id: voided.id, subscription_id: voided.subscription_id, amount: voided.amount, paid_on: voided.paid_on, method: voided.method, note: voided.note, actor_role: auth.role },
  });
  if (auditErr) console.error('[admin/subscriptions DELETE] audit log failed:', auditErr.message);

  return NextResponse.json({ success: true });
}
