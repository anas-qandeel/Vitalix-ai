// ═══════════════════════════════════════════════════════════════════
// vitals-classify.ts — المرجع التنفيذي الموحّد الوحيد لتصنيف
// الضغط والسكري والنبض في النظام كله.
//
// المصدر المعتمد (لا اجتهاد خارجه):
//   1. «معايير التصنيف الطبية المعتمدة» في
//      src/app/api/generate-ai-report/route.ts (الأسطر ~26–51)
//   2. حسم استثناء 150/90 من الكود التنفيذي getStatus في
//      src/app/dashboard/vitals/page.tsx (~795–796):
//      الاستثناء يشمل فوق 60 سنة أو المشخّص بارتفاع الضغط أياً كان عمره.
//
// أي تعديل مستقبلي على العتبات يتم هنا حصراً —
// ممنوع تكرار هذا المنطق في أي ملف آخر.
//
// ملاحظة: هذا الملف غير مربوط بأي شاشة بعد — إنشاؤه لا يغيّر
// أي سلوك قائم. الربط (حفظ التصنيف ثم استدعاؤه) خطوات لاحقة.
// ═══════════════════════════════════════════════════════════════════

import { getBMICategory } from './weight-math';

export type VitalLevel = 'green' | 'yellow' | 'red';

export interface Classification {
  /** النص الحرفي المعتمد — يُحفظ في قاعدة البيانات ويُعرض كما هو */
  label: string;
  /** مستوى الخطورة للألوان والشارات */
  level: VitalLevel;
  /** يُملأ فقط إذا طُبّق معيار خاص (فوق 60 / مشخّص) — المرجع يوجب ذكر اختلاف المعيار */
  specialCriteria: string | null;
}

// ── ضغط الدم ─────────────────────────────────────────────────────
export function classifyBp(
  systolic: number,
  diastolic: number,
  age: number | null,
  isDiagnosedHypertension: boolean
): Classification {
  // الأطراف القصوى أولاً — لا يرفعها أي استثناء
  if (systolic < 80 || diastolic < 50)
    return { label: 'انخفاض شديد', level: 'red', specialCriteria: null };
  if (systolic < 90 || diastolic < 60)
    return { label: 'انخفاض', level: 'yellow', specialCriteria: null };
  if (systolic > 160 || diastolic > 100)
    return { label: 'ارتفاع شديد', level: 'red', specialCriteria: null };

  const isOver60 = age !== null && age > 60;

  // الاستثناء المعتمد (حُسم من getStatus): فوق 60 سنة أو مشخّص
  // بارتفاع الضغط — أياً كان عمره — 150/90 أو أقل يُعتبر مقبولاً
  if ((isOver60 || isDiagnosedHypertension) && systolic <= 150 && diastolic <= 90) {
    return {
      label: 'مقبول',
      level: 'green',
      specialCriteria: isDiagnosedHypertension
        ? 'المعيار للمشخّص بارتفاع الضغط: 150/90 أو أقل مقبول'
        : 'المعيار لفوق 60 سنة: 150/90 أو أقل مقبول',
    };
  }

  // المعايير العامة (غير المشخّص، 60 سنة أو أقل)
  if (systolic <= 130 && diastolic <= 80)
    return { label: 'طبيعي', level: 'green', specialCriteria: null };
  if (systolic <= 140 && diastolic <= 90)
    return { label: 'ارتفاع خفيف', level: 'yellow', specialCriteria: null };
  // المتبقي حكماً: 141–160 انقباضي أو 91–100 انبساطي
  return { label: 'ارتفاع ملحوظ', level: 'yellow', specialCriteria: null };
}

// ── سكر الدم ─────────────────────────────────────────────────────
export function classifySugar(
  value: number,
  /** 'fasting' صائم | 'postprandial' بعد الأكل | 'random' عشوائي | null يُعامل كبعد الأكل */
  testType: string | null,
  age: number | null,
  isDiagnosedDiabetes: boolean
): Classification {
  const isOver60 = age !== null && age > 60;

  // هبوط طارئ — موحّد لكل الأنواع (ADA المستوى 2)
  if (value < 54)
    return { label: 'هبوط طارئ', level: 'red', specialCriteria: null };

  if (testType === 'fasting') {
    // حدّ الانخفاض العام حسب العمر
    const lowCeiling = isOver60 ? 79 : 69;
    if (value <= lowCeiling)
      return {
        label: 'انخفاض',
        level: 'yellow',
        specialCriteria: isOver60 ? 'حدّ الانخفاض لفوق 60 سنة: 54–79' : null,
      };

    if (isDiagnosedDiabetes) {
      if (value < 80)
        return { label: 'انخفاض', level: 'yellow', specialCriteria: 'هدف المشخّص بالسكري صائماً: 80–130' };
      if (value <= 130)
        return { label: 'ضمن الهدف', level: 'green', specialCriteria: 'هدف المشخّص بالسكري صائماً: 80–130' };
      if (value <= 180)
        return { label: 'مرتفع نسبياً', level: 'yellow', specialCriteria: 'هدف المشخّص بالسكري صائماً: 80–130' };
      return { label: 'ارتفاع ملحوظ', level: 'red', specialCriteria: null };
    }

    if (value <= 99)
      return { label: 'طبيعي', level: 'green', specialCriteria: null };
    if (value <= 125)
      return { label: 'ارتفاع طفيف', level: 'yellow', specialCriteria: null };
    return { label: 'ارتفاع ملحوظ', level: 'red', specialCriteria: null };
  }

  // غير الصائم: بعد الأكل / عشوائي / غير محدد
  if (value < 70)
    return { label: 'انخفاض', level: 'yellow', specialCriteria: null };

  if (isDiagnosedDiabetes) {
    if (value < 180)
      return { label: 'ضمن الهدف', level: 'green', specialCriteria: 'هدف المشخّص بالسكري بعد الأكل: أقل من 180' };
    if (value < 250)
      return { label: 'مرتفع نسبياً', level: 'yellow', specialCriteria: 'هدف المشخّص بالسكري بعد الأكل: أقل من 180' };
    return { label: 'مرتفع جداً', level: 'red', specialCriteria: null };
  }

  if (testType === 'random') {
    if (value <= 139)
      return { label: 'طبيعي', level: 'green', specialCriteria: null };
    if (value <= 199)
      return { label: 'ارتفاع نسبي', level: 'yellow', specialCriteria: 'معيار الفحص العشوائي: الارتفاع الملحوظ من 200' };
    return { label: 'ارتفاع ملحوظ', level: 'red', specialCriteria: null };
  }

  // بعد الأكل / غير محدد
  if (value <= 139)
    return { label: 'طبيعي', level: 'green', specialCriteria: null };
  if (value <= 179)
    return { label: 'ارتفاع نسبي', level: 'yellow', specialCriteria: null };
  return { label: 'ارتفاع ملحوظ', level: 'red', specialCriteria: null };
}

// ── معدل النبض ───────────────────────────────────────────────────
export function classifyHeartRate(hr: number): Classification {
  if (hr > 100) return { label: 'مرتفع', level: 'yellow', specialCriteria: null };
  if (hr < 60)  return { label: 'منخفض', level: 'yellow', specialCriteria: null };
  return { label: 'طبيعي', level: 'green', specialCriteria: null };
}

// ── الحالة الإجمالية للزيارة ─────────────────────────────────────
// القانون المعتمد (مستخرج من getStatus في صفحة الفحوصات):
// الضغط والسكري يرفعان المستوى من تصنيفيهما، والـ BMI يرفعه بقواعده،
// والترقية تصاعدية فقط — لا شيء يخفض مستوى رفعه غيره.
export type OverallLevel = 'normal' | 'medium' | 'high';

export interface OverallStatus {
  level: OverallLevel;
  /** النص الحرفي المعتمد للشارة */
  label: string;
  /** العوامل التي ساهمت في رفع التقييم — للعرض التفسيري */
  reasons: string[];
}

export function overallVisitStatus(
  bpLevel: VitalLevel | null,
  sugarLevel: VitalLevel | null,
  bmi: number | null
): OverallStatus {
  let level: OverallLevel = 'normal';
  const reasons: string[] = [];

  if (bpLevel === 'red') { level = 'high'; reasons.push('ضغط الدم'); }
  else if (bpLevel === 'yellow') { level = 'medium'; reasons.push('ضغط الدم'); }

  if (sugarLevel === 'red') { level = 'high'; reasons.push('سكر الدم'); }
  else if (sugarLevel === 'yellow') { if (level !== 'high') level = 'medium'; reasons.push('سكر الدم'); }

  if (bmi !== null) {
    if (bmi >= 30) { if (level !== 'high') level = 'high'; reasons.push(`الوزن (${getBMICategory(bmi).labelShort})`); }
    else if (bmi >= 25) { if (level === 'normal') level = 'medium'; reasons.push(`الوزن (${getBMICategory(bmi).labelShort})`); }
    else if (bmi < 18.5) { if (level === 'normal') level = 'medium'; reasons.push(`الوزن (${getBMICategory(bmi).labelShort})`); }
    else if (bmi < 16) { if (level !== 'high') level = 'high'; reasons.push('الوزن (نحافة شديدة)'); }
  }

  if (level === 'high')   return { level, label: 'يستدعي انتباهاً', reasons };
  if (level === 'medium') return { level, label: 'يحتاج متابعة', reasons };
  return { level, label: 'ضمن الطبيعي', reasons };
}
