import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// تصريح صريح: هذا المسار يجب أن يُنفَّذ من جديد في كل طلب، ولا يُخزَّن مؤقتاً بأي شكل —
// ضروري لأن البيانات (الزيارات الطبية) تتغيّر باستمرار ويجب أن تكون محدّثة دائماً
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * مسار عام (بدون تسجيل دخول) يعرض تفاصيل زيارة واحدة محددة عبر رابط — يستخدمه المريض
 * لمشاهدة تقريره دون الحاجة لحساب. الأمان هنا يعتمد على أن id عبارة عن UUID عشوائي
 * غير قابل للتخمين (وليس على RLS)، لذا لا نحتاج فتح جداول patients/visitations/pharmacies
 * للقراءة العامة على مستوى قاعدة البيانات — هذا المسار وحده يملك صلاحية القراءة (service role)
 * ويُعيد فقط الحقول اللازمة لعرض هذه الصفحة تحديدًا، لا شيء إضافي.
 *
 * ملاحظة توحيد الاسم: العمود الرسمي لاسم الصيدلية هو `name` — يُكتب فيه عند الإنشاء
 * والتعديل. العمود `pharmacy_name` قديم وقد يكون فارغاً في سجلات حديثة، لذا الأولوية
 * دائماً لـ `name` ثم `pharmacy_name` كـ fallback احتياطي للسجلات القديمة فقط.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'معرف الزيارة مطلوب' }, { status: 400 });
    }

    // 1. الزيارة المطلوبة + بيانات المريض المرتبطة بها (فقط الحقول المستخدمة فعليًا في هذه الصفحة)
    const { data: visit, error: visitError } = await supabaseAdmin
      .from('visitations')
      .select(
        'id, pharmacy_id, patient_id, bp_systolic, bp_diastolic, sugar_value, sugar_test_type, weight, symptoms, ai_report_output, created_at, excluded_recommendation_ids, patient:patients(name, phone_number, height)'
      )
      .eq('id', id)
      .single();

    if (visitError || !visit) {
      return NextResponse.json(
        { error: 'لم يتم العثور على التقرير المطلوب أو أن الرابط غير صالح.' },
        { status: 404 }
      );
    }

    const patient = visit.patient as unknown as { name: string; phone_number: string; height: number | null } | null;

    const { data: relatedWeightPlan } = await supabaseAdmin
      .from('weight_plans')
      .select('id')
      .eq('visitation_id', id)
      .maybeSingle();

    // 2. اسم ورقم هاتف الصيدلية فقط (لا بياناتها المالية)
    // الأولوية: name (العمود الرسمي) ← pharmacy_name (fallback للسجلات القديمة)
    let pharmacyName = 'صيدليتك المعتمدة';
    let pharmacyPhone = '';

    if (visit.pharmacy_id) {
      const { data: pharm } = await supabaseAdmin
        .from('pharmacies')
        .select('name, pharmacy_name, phone_number')
        .eq('id', visit.pharmacy_id)
        .single();

      if (pharm) {
        const rawName = pharm.name || pharm.pharmacy_name || '';
        if (rawName.trim()) {
          pharmacyName = rawName.startsWith('صيدلية') ? rawName : `صيدلية ${rawName}`;
        }
        pharmacyPhone = pharm.phone_number || '';
      }
    }

    // 3. كل الزيارات التاريخية لنفس المريض (لسجل الطبيب المعالج)
    let history: unknown[] = [];
    if (visit.patient_id) {
      const { data: historyData } = await supabaseAdmin
        .from('visitations')
        .select('id, bp_systolic, bp_diastolic, sugar_value, sugar_test_type, weight, symptoms, created_at')
        .eq('patient_id', visit.patient_id)
        .order('created_at', { ascending: false });

      if (historyData) history = historyData;
    }

    // 4. تقييم القياسات وجلب التوصيات المطابقة من كتالوج هذه الصيدلية فقط
    const activeCategories: string[] = [];

    if (visit.sugar_value && visit.sugar_value >= 180) {
      activeCategories.push('sugar_device', 'sugar_strips');
    }
    if ((visit.bp_systolic && visit.bp_systolic >= 140) || (visit.bp_diastolic && visit.bp_diastolic >= 90)) {
      activeCategories.push('bp_device');
    }
    if (visit.weight && patient?.height) {
      const heightMeters = patient.height / 100;
      const bmi = visit.weight / (heightMeters * heightMeters);
      if (bmi >= 25.0) activeCategories.push('weight_loss_med');
    }

    let recommendations: unknown[] = [];
    if (activeCategories.length > 0) {
      const { data: recData } = await supabaseAdmin
        .from('pharmacy_catalog')
        .select('id, pharmacy_id, category, brand_name, price, image_url, ai_pitch_prompt, is_active')
        .eq('pharmacy_id', visit.pharmacy_id)
        .eq('is_active', true)
        .in('category', activeCategories);

      if (recData) {
        const excludedIds = new Set(visit.excluded_recommendation_ids || []);
        recommendations = recData.filter((r: any) => !excludedIds.has(r.id));
      }
    }

    return NextResponse.json({
      visit: {
        id: visit.id,
        pharmacy_id: visit.pharmacy_id,
        patient_id: visit.patient_id,
        bp_systolic: visit.bp_systolic,
        bp_diastolic: visit.bp_diastolic,
        sugar_value: visit.sugar_value,
        sugar_test_type: visit.sugar_test_type,
        weight: visit.weight,
        symptoms: visit.symptoms,
        ai_report_output: visit.ai_report_output,
        created_at: visit.created_at,
        patient: patient || undefined,
      },
      pharmacyName,
      pharmacyPhone,
      history,
      recommendations,
      relatedWeightPlanId: relatedWeightPlan?.id || null,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

// PUT — يحفظ قائمة معرّفات التوصيات التي استبعدها الصيدلاني من عرضها على المريض.
// لا يمسّ pharmacy_catalog ولا الزيارة نفسها؛ فقط قائمة استبعاد تُطبَّق وقت GET.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { excluded_ids } = await req.json();
    if (!Array.isArray(excluded_ids)) {
      return NextResponse.json({ error: 'excluded_ids يجب أن تكون مصفوفة' }, { status: 400 });
    }
    const { error: updErr } = await supabaseAdmin
      .from('visitations')
      .update({ excluded_recommendation_ids: excluded_ids })
      .eq('id', id);
    if (updErr) {
      return NextResponse.json({ error: 'تعذر حفظ الاستثناءات' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
