import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyPlatformAdmin } from '@/lib/verify-admin';
import { buildQuote, todayISO } from '@/lib/subscriptions';

export async function POST(request: Request) {
  const auth = await verifyPlatformAdmin(request, ['owner', 'support']);
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
      trial_days
    } = body;

    // توحيد اسم الصيدلية: إن لم يبدأ بكلمة "صيدلية"، تُضاف تلقائياً لضمان اتساق العرض
    // في الجدول بغض النظر عن الصيغة التي أدخلها الموظف (بادئة أو بدونها)
    const trimmedName = (pharmacy_name || '').trim();
    const normalizedPharmacyName = trimmedName.startsWith('صيدلية') ? trimmedName : `صيدلية ${trimmedName}`;

    // 1. مدة التجربة من إعدادات المنصة (أو من الطلب إن أُرسلت، بحدود 0–365) — لا أرقام ثابتة.
    // الصيدلية الجديدة تبدأ تجريبية دائماً؛ إسناد خطة يتم لاحقاً عبر /api/admin/subscriptions
    const { data: settings } = await supabaseAdmin.from('platform_settings').select('default_trial_days').eq('id', true).single();
    const requestedTrial = trial_days == null || trial_days === '' ? null : Number(trial_days);
    if (requestedTrial != null && (!Number.isInteger(requestedTrial) || requestedTrial < 0 || requestedTrial > 365)) {
      return NextResponse.json({ error: 'أيام التجربة بين 0 و365' }, { status: 400 });
    }
    const trialDays = requestedTrial ?? settings?.default_trial_days ?? 60;
    const quote = buildQuote({ plan: null, promo: null, startsOn: todayISO(), trialDays });

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
        status: quote.status,
        must_change_password: true, // القيمة الافتراضية في القاعدة true أصلاً — تصريح بها هنا لتوضيح النية
        total_amount_due: quote.final_price,
        paid_amount: 0,
        expiry_date: quote.ends_on,
        second_payment_date: null
      }
    ]);

    // إذا حدث خطأ في قاعدة البيانات، نقوم بحذف حساب الـ Auth المعلق لتنظيف النظام وتجنب حجز الإيميل
    if (dbError) {
      if (userId) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      }
      throw new Error(dbError.message);
    }

    // 4. إدراج صفّ المالك في pharmacy_staff — current_pharmacy_id() في القاعدة يشترط وجود
    // صفّ نشط هناك (user_id + pharmacy_id مطابقان للتوكن)، وإلا تفشل كل سياسات RLS
    // على بيانات الصيدلية. نفس النمط المعتمد في صيدليات backfill: role='owner'،
    // login_slug=null (المالك يسجّل دخول بالبريد/كلمة المرور لا بنظام PIN)،
    // must_change_pin=false (لا ينطبق عليه نظام PIN أصلاً)
    const { error: staffError } = await supabaseAdmin.from('pharmacy_staff').insert({
      pharmacy_id: userId,
      user_id: userId,
      name: (pharmacist_name || '').trim() || 'المالك',
      role: 'owner',
      login_slug: null,
      is_active: true,
      must_change_pin: false,
    });

    if (staffError) {
      await supabaseAdmin.from('pharmacies').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`تعذّر إنشاء صفّ المالك: ${staffError.message}`);
    }

    // 5. كتابة pharmacy_id و role في app_metadata — getTenantContext يقرأهما من التوكن حصراً،
    // ولا يمكن تمريرهما عند createUser لأن معرّف الصيدلية هو نفسه userId غير المتوفر حينها.
    // فشل هذه الخطوة يُعامَل كفشل كامل (حساب بلا app_metadata يبدو ناجحاً ثم يعلق في التوجيه)
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { pharmacy_id: userId, role: 'owner' }
    });

    if (metaError) {
      await supabaseAdmin.from('pharmacy_staff').delete().eq('pharmacy_id', userId);
      await supabaseAdmin.from('pharmacies').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`تعذّر تفعيل صلاحيات الصيدلية: ${metaError.message}`);
    }

    // 6. سجل الاشتراك التجريبي في subscriptions — دورة الحياة (تنبيه/مهلة/قراءة فقط) وبطاقات الإدارة تقرآن منه.
    // فشله يُعامَل كفشل كامل: صيدلية بلا صف اشتراك تبدو ناجحة ثم تسقط من دورة الحياة
    const { error: subError } = await supabaseAdmin.from('subscriptions').insert({
      pharmacy_id: userId, plan_id: quote.plan_id, promotion_id: quote.promotion_id,
      starts_on: quote.starts_on, ends_on: quote.ends_on, list_price: quote.list_price, discount: quote.discount,
      final_price: quote.final_price, paid_amount: 0, status: quote.status, note: null, created_by: auth.user.id,
    });

    if (subError) {
      await supabaseAdmin.from('pharmacy_staff').delete().eq('pharmacy_id', userId);
      await supabaseAdmin.from('pharmacies').delete().eq('id', userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`تعذّر إنشاء سجل الاشتراك التجريبي: ${subError.message}`);
    }

    return NextResponse.json({ success: true, message: 'تم إنشاء الصيدلية بنجاح', pharmacy_id: userId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ غير متوقع' }, { status: 400 });
  }
}