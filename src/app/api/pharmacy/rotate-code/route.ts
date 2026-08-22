import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

/** يتحقّق أن المستدعي مالك، ويُرجع pharmacy_id من التوكن */
async function verifyOwner(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false as const, error: 'مطلوب توثيق', status: 401 };
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    console.error('[verifyOwner] token rejected:', error?.message, '| user:', user?.id);
    return { ok: false as const, error: 'رمز التوثيق غير صالح', status: 401 };
  }
  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  const pharmacyId = meta.pharmacy_id as string | undefined;
  const role = meta.role as string | undefined;

  if (!pharmacyId) {
    console.error('[verifyOwner] meta:', JSON.stringify(meta));
    return { ok: false as const, error: 'الحساب غير مرتبط بصيدلية', status: 403 };
  }
  if (role !== 'owner') {
    console.error('[verifyOwner] meta:', JSON.stringify(meta));
    return { ok: false as const, error: 'هذه العملية للمالك فقط', status: 403 };
  }
  return { ok: true as const, userId: user.id, pharmacyId };
}

// بلا O و0 و I و L و1 — تشابه بصري يربك من يقرأه من رسالة واتساب
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const auth = await verifyOwner(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: pharmacy, error: fetchErr } = await supabaseAdmin
    .from('pharmacies')
    .select('short_code')
    .eq('id', auth.pharmacyId)
    .single();

  if (fetchErr || !pharmacy) {
    console.error('[rotate-code] fetch failed:', fetchErr?.message);
    return NextResponse.json({ error: 'تعذّر تحميل بيانات الصيدلية' }, { status: 500 });
  }

  const oldCode = pharmacy.short_code as string | null;

  // الفحص المسبق للتفرّد سباق زمنيّ — الاعتماد على فهرس القاعدة
  // pharmacies_short_code_unique_ci هو الضمان الفعلي: نحاول الكتابة
  // مباشرة، وعند تصادم (23505) نولّد كوداً جديداً ونعيد المحاولة.
  let newCode: string | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = generateShortCode();
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('pharmacies')
      .update({ short_code: candidate })
      .eq('id', auth.pharmacyId)
      .select('short_code')
      .single();

    if (!updateErr && updated) {
      newCode = updated.short_code as string;
      break;
    }

    lastError = updateErr;
    if (updateErr?.code !== '23505') {
      console.error('[rotate-code] update failed:', updateErr?.message);
      return NextResponse.json({ error: 'تعذّر تبديل كود الصيدلية' }, { status: 500 });
    }
    // 23505: تصادم على الكود — نجرّب كوداً آخر في الدورة التالية
  }

  if (!newCode) {
    console.error('[rotate-code] exhausted attempts:', MAX_ATTEMPTS, '| last error:', lastError?.message);
    return NextResponse.json({ error: 'تعذّر توليد كود فريد للصيدلية — حاول مرة أخرى' }, { status: 500 });
  }

  const { error: auditErr } = await supabaseAdmin.from('admin_audit_log').insert({
    actor_id: auth.userId,
    action: 'rotate_pharmacy_code',
    pharmacy_id: auth.pharmacyId,
    details: { old_code: oldCode, new_code: newCode },
  });

  if (auditErr) {
    // التبديل نجح فعلاً — فشل التسجيل لا يُلغيه ولا يُرجَع كخطأ للمالك،
    // لكن يجب أن يبقى الأثر في سجل الخادم على الأقل لتفسير التبديل لاحقاً
    console.error(`[rotate-code] audit log failed: old=${oldCode} new=${newCode} —`, auditErr.message);
  }

  return NextResponse.json({ short_code: newCode });
}
