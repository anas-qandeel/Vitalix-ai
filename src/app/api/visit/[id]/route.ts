import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { matchPatientDrugs } from '@/lib/drug-food-interactions';
import { assessProductForPatient, type PatientForSuitability, type ProductForSuitability } from '@/lib/product-suitability';
import { fetchProductScores, rankSuitable } from '@/lib/product-ranking';
import { requireStaff } from '@/lib/api-auth';
import { dueVisitCategories, resolveProductNotes } from '@/lib/visit-categories';

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
        'id, pharmacy_id, patient_id, bp_systolic, bp_diastolic, heart_rate, is_dual_bp, bp_sys1, bp_dia1, hr1, bp_sys2, bp_dia2, hr2, sugar_value, sugar_test_type, weight, symptoms, ai_report_output, product_notes, created_at, excluded_recommendation_ids, took_bp_medication, took_sugar_medication, bp_classification, bp_classification_level, sugar_classification, sugar_classification_level, heart_rate_classification, heart_rate_classification_level, classification_special_criteria, performed_by, had_stimulants, recent_exertion, recent_heavy_meal, is_stressed, patient:patients(name, phone_number, height, gender, birth_date, diagnosed_conditions, drug_allergies, food_allergies, is_pregnant, is_lactating)'
      )
      .eq('id', id)
      .single();

    if (visitError || !visit) {
      return NextResponse.json(
        { error: 'لم يتم العثور على التقرير المطلوب أو أن الرابط غير صالح.' },
        { status: 404 }
      );
    }

    const patient = visit.patient as unknown as {
      name: string; phone_number: string; height: number | null; birth_date: string | null;
      diagnosed_conditions: string[] | null; drug_allergies: string[] | null; food_allergies: string[] | null;
      is_pregnant: boolean | null; is_lactating: boolean | null;
    } | null;

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
        .select('id, bp_systolic, bp_diastolic, heart_rate, sugar_value, sugar_test_type, weight, symptoms, created_at, bp_classification, bp_classification_level, sugar_classification, sugar_classification_level, heart_rate_classification, heart_rate_classification_level')
        .eq('patient_id', visit.patient_id)
        .order('created_at', { ascending: false });

      if (historyData) history = historyData;
    }

    // 4. تقييم القياسات لتحديد الفئات ذات الصلة بهذه الزيارة تحديداً —
    // منطق طبي بحت، لا علاقة له بملف المريض (ذلك يأتي في خطوة الملاءمة التالية)
    // العتبات في وحدة مشتركة (src/lib/visit-categories.ts) — نفس المنطق، يستخدمه تقرير الذكاء أيضاً
    const dueCategories = dueVisitCategories(visit);
    const activeCategories: string[] = [...dueCategories];
    // سبب/إرشاد لكل فئة: ما كتبه الذكاء وقت التقرير (product_notes) أو قالب حتمي احتياطي
    const productNotes = resolveProductNotes(visit.product_notes, dueCategories, visit, {
      is_pregnant: patient?.is_pregnant === true,
      is_lactating: patient?.is_lactating === true,
    });
    // ملاحظة: لا فئة لإدارة الوزن دوائياً — المنصة لا تعرض أدوية ولا تقترح علاجاً

    // ── ملف المريض لمحرك الملاءمة: التشخيصات، الحساسيات، الحمل/الرضاعة، العمر، والأدوية المزمنة (الاسم العلمي) ──
    let chronicGenerics: string[] = [];
    if (visit.patient_id) {
      const { data: medsData } = await supabaseAdmin
        .from('chronic_medications')
        .select('medication_name')
        .eq('patient_id', visit.patient_id)
        .eq('status', 'active');
      if (medsData && medsData.length > 0) {
        const { matched } = matchPatientDrugs(medsData.map((m: { medication_name: string }) => m.medication_name));
        chronicGenerics = matched.map(d => d.generic);
      }
    }
    const patientAge = patient?.birth_date ? new Date().getFullYear() - new Date(patient.birth_date).getFullYear() : null;
    const patientForSuitability: PatientForSuitability = {
      age: patientAge,
      diagnosed_conditions: patient?.diagnosed_conditions || [],
      drug_allergies: patient?.drug_allergies || [],
      food_allergies: patient?.food_allergies || [],
      is_pregnant: patient?.is_pregnant === true,
      is_lactating: patient?.is_lactating === true,
      chronic_generics: chronicGenerics,
    };

    let recommendations: unknown[] = [];
    if (activeCategories.length > 0) {
      const { data: recData } = await supabaseAdmin
        .from('pharmacy_products')
        .select('id, pharmacy_id, kind, category, brand_name, price, image_url, patient_pitch, clinical_profile, profile_source, profile_confirmed_at, review_status, is_active')
        .eq('pharmacy_id', visit.pharmacy_id)
        .eq('is_active', true)
        .in('category', activeCategories);

      if (recData) {
        // ── محرك الملاءمة الحتمي: يُستبعد كل منتج «ممنوع»، ويبقى «بحذر» مع سببه للصيدلاني ──
        const scored = recData
          .map((r: Record<string, unknown>) => {
            const product = r as unknown as ProductForSuitability;
            const { status, reasons } = assessProductForPatient(product, patientForSuitability);
            return { row: r, status, reasons };
          })
          .filter(a => a.status !== 'forbidden');
        // ── حلقة التعلّم: ترتيب الملائمين بأحداث الصيدلية نفسها (90 يوماً) — لا يمس الأمان ──
        const scores = await fetchProductScores(supabaseAdmin, visit.pharmacy_id, scored.map(a => a.row.id as string));
        scored.sort((a, b) => rankSuitable(
          { status: a.status as 'ok' | 'caution', score: scores.get(a.row.id as string) ?? 0, name: String(a.row.brand_name ?? '') },
          { status: b.status as 'ok' | 'caution', score: scores.get(b.row.id as string) ?? 0, name: String(b.row.brand_name ?? '') },
        ));
        const assessed = scored.map(a => ({ ...a.row, suitability_note: a.status === 'caution' ? a.reasons : [] }));

        const excludedIds = new Set(visit.excluded_recommendation_ids || []);
        recommendations = assessed
          .filter((r: Record<string, unknown>) => !excludedIds.has(r.id as string))
          .map((r: Record<string, unknown>) => ({ ...r, note: productNotes[r.category as keyof typeof productNotes] ?? null }));
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
        heart_rate: visit.heart_rate,
        is_dual_bp: visit.is_dual_bp,
        bp_sys1: visit.bp_sys1,
        bp_dia1: visit.bp_dia1,
        hr1: visit.hr1,
        bp_sys2: visit.bp_sys2,
        bp_dia2: visit.bp_dia2,
        hr2: visit.hr2,
        took_bp_medication: visit.took_bp_medication,
        took_sugar_medication: visit.took_sugar_medication,
        bp_classification: visit.bp_classification,
        bp_classification_level: visit.bp_classification_level,
        sugar_classification: visit.sugar_classification,
        sugar_classification_level: visit.sugar_classification_level,
        heart_rate_classification: visit.heart_rate_classification,
        heart_rate_classification_level: visit.heart_rate_classification_level,
        classification_special_criteria: visit.classification_special_criteria,
        had_stimulants: visit.had_stimulants,
        recent_exertion: visit.recent_exertion,
        recent_heavy_meal: visit.recent_heavy_meal,
        is_stressed: visit.is_stressed,
        patient: patient || undefined,
      },
      pharmacyName,
      pharmacyPhone,
      performedBy: visit.performed_by || null,
      history,
      recommendations,
      relatedWeightPlanId: relatedWeightPlan?.id || null,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'حدث خطأ في الخادم' }, { status: 500 });
  }
}

// PUT — يحفظ قائمة معرّفات التوصيات التي استبعدها الصيدلاني من عرضها على المريض.
// لا يمسّ pharmacy_products ولا الزيارة نفسها؛ فقط قائمة استبعاد تُطبَّق وقت GET.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── حارس: موظف نشط، والزيارة تخص صيدليته ──
    const auth = await requireStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const { excluded_ids } = await req.json();
    if (!Array.isArray(excluded_ids)) {
      return NextResponse.json({ error: 'excluded_ids يجب أن تكون مصفوفة' }, { status: 400 });
    }
    const { data: visitOwner } = await supabaseAdmin.from('visitations').select('pharmacy_id').eq('id', id).maybeSingle();
    if (!visitOwner) return NextResponse.json({ error: 'الزيارة غير موجودة' }, { status: 404 });
    if (visitOwner.pharmacy_id !== auth.pharmacyId) return NextResponse.json({ error: 'الزيارة لا تخص صيدليتك' }, { status: 403 });
    const { error: updErr } = await supabaseAdmin
      .from('visitations')
      .update({ excluded_recommendation_ids: excluded_ids })
      .eq('id', id);
    if (updErr) {
      return NextResponse.json({ error: 'تعذر حفظ الاستثناءات' }, { status: 500 });
    }

    // ── حلقة التعلّم: تسجيل استبعادات الصيدلاني كأحداث — غير مُعطِّل ──
    // الزيارة لا تملك خطوة اعتماد منفصلة؛ حفظ الاستثناءات هو القرار النهائي.
    // القيد الفريد في الجدول يمنع مضاعفة العدّ عند إعادة الحفظ لنفس الزيارة.
    const productIds = excluded_ids.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0);
    if (productIds.length > 0) {
      try {
        const { data: visitRow } = await supabaseAdmin
          .from('visitations')
          .select('pharmacy_id, patient_id, patient:patients(is_pregnant, is_lactating, diagnosed_conditions)')
          .eq('id', id)
          .maybeSingle();
        if (visitRow?.pharmacy_id) {
          const p = Array.isArray(visitRow.patient) ? visitRow.patient[0] : visitRow.patient;
          const conds: string[] = Array.isArray(p?.diagnosed_conditions) ? p.diagnosed_conditions : [];
          const patientFlags = {
            is_pregnant:  p?.is_pregnant  === true,
            is_lactating: p?.is_lactating === true,
            hypertension: conds.includes('hypertension'),
            diabetes:     conds.includes('diabetes'),
          };
          const events = productIds.map(pid => ({
            pharmacy_id:   visitRow.pharmacy_id,
            product_id:    pid,
            patient_id:    visitRow.patient_id ?? null,
            event_type:    'pharmacist_excluded',
            context:       'visit',
            context_id:    id,
            patient_flags: patientFlags,
          }));
          const { error: evErr } = await supabaseAdmin
            .from('catalog_product_events')
            .upsert(events, { onConflict: 'event_type,context,context_id,product_id', ignoreDuplicates: true });
          if (evErr) console.warn('[visit PUT] learning events write failed (non-blocking):', evErr);
          else console.log(`[visit PUT] learning: ${events.length} exclusion event(s) recorded`);
        }
      } catch (evErr) {
        console.warn('[visit PUT] learning events write failed (non-blocking):', evErr);
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'حدث خطأ في الخادم' }, { status: 500 });
  }
}
