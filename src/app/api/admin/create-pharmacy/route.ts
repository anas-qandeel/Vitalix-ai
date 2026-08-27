import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request);
  if (!auth.authorized) return auth.response;

  let userId: string | null = null;

  try {
    const body = await request.json();
    const {
      email,
      password,
      pharmacy_name,
      pharmacist_name,
      phone_number,
      country,
      city_address,
      payment_plan,
      is_installment,
      second_payment_date,
      trial_days,
      total_amount_due,
      paid_amount
    } = body;

    // تحقق دفاعي على مستوى السيرفر: المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي المطلوب أبداً،
    // بغض النظر عمّا تحقق منه العميل مسبقاً (دفاع مزدوج ضد استدعاء المسار مباشرة)
    const totalDueNum = Number(total_amount_due ?? 50);
    const paidAmountNum = Number(paid_amount ?? 0);
    if (paidAmountNum > totalDueNum) {
      return NextResponse.json(
        { error: `المبلغ المدفوع لا يمكن أن يتجاوز إجمالي قيمة الخطة (${totalDueNum} JOD)` },
        { status: 400 }
      );
    }

    // توحيد اسم الصيدلية: إن لم يبدأ بكلمة "صيدلية"، تُضاف تلقائياً لضمان اتساق العرض
    // في الجدول بغض النظر عن الصيغة التي أدخلها الموظف (بادئة أو بدونها)
    const trimmedName = (pharmacy_name || '').trim();
    const normalizedPharmacyName = trimmedName.startsWith('صيدلية') ? trimmedName : `صيدلية ${trimmedName}`;

    // 1. حساب تاريخ الانتهاء بدقة
    const expiryDate = new Date();
    let pharmacyStatus = 'active';

    if (payment_plan === 'trial_0') {
      pharmacyStatus = 'trial';
      expiryDate.setDate(expiryDate.getDate() + Number(trial_days || 30));
    } else if (payment_plan === '25') {
      expiryDate.setMonth(expiryDate.getMonth() + 6); // 6 أشهر
    } else {
      expiryDate.setMonth(expiryDate.getMonth() + 12); // سنة كاملة
    }

    const formattedExpiryDate = expiryDate.toISOString().split('T')[0];

    // 2. إنشاء حساب المستخدم في Supabase Auth أولاً
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: pharmacist_name }
    });

    if (authError) throw new Error(authError.message);

    userId = authData.user.id;

    // 3. إدخال بيانات الصيدلية في جدول pharmacies مع تمرير user_id بوضوح
    const { error: dbError } = await supabaseAdmin.from('pharmacies').insert([
      {
        id: userId,
        user_id: userId, // تمرير معرف المستخدم بوضوح لتجنب أي خطأ في قاعدة البيانات
        name: normalizedPharmacyName,
        pharmacist_name,
        phone_number,
        country,
        city_address,
        status: pharmacyStatus,
        total_amount_due: totalDueNum,
        paid_amount: paidAmountNum,
        expiry_date: formattedExpiryDate,
        second_payment_date: is_installment ? second_payment_date : null
      }
    ]);

    // إذا حدث خطأ في قاعدة البيانات، نقوم بحذف حساب الـ Auth المعلق لتنظيف النظام وتجنب حجز الإيميل
    if (dbError) {
      if (userId) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      throw new Error(dbError.message);
    }

    // 4. كتابة pharmacy_id و role في app_metadata — getTenantContext يقرأهما من التوكن حصراً،
    // ولا يمكن تمريرهما عند createUser لأن معرّف الصيدلية هو نفسه userId غير المتوفر حينها.
    // فشل هذه الخطوة يُعامَل كفشل كامل (حساب بلا app_metadata يبدو ناجحاً ثم يعلق في التوجيه)
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { pharmacy_id: userId, role: 'owner' }
    });

    if (metaError) {
      await supabaseAdmin.from('pharmacies').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`تعذّر تفعيل صلاحيات الصيدلية: ${metaError.message}`);
    }

    return NextResponse.json({ success: true, message: 'تم إنشاء الصيدلية بنجاح' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ غير متوقع' }, { status: 400 });
  }
}