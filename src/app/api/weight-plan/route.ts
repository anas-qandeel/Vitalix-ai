import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { GoogleGenAI, Type } from '@google/genai';
import { calcWeightGoals, getBMICategory } from '@/lib/weight-math';
import { SUPPLEMENT_CATEGORIES, isValidCategory } from '@/lib/supplement-categories';
import { matchPatientDrugs, type DrugEntry } from '@/lib/drug-food-interactions';

// ═══════════════════════════════════════════════════════════════════════
// نماذج Gemini
// ═══════════════════════════════════════════════════════════════════════
const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];

// عتبة اعتبار بيانات تقدّم الوزن مشكوكاً فيها — تخصّ حالات النقصان فقط، ولا
// علاقة لها بمعدل الإنقاص الصحي الموصى به (5% المستخدمة في rateWarning أدناه)؛
// نقصان يفوق 10% من الوزن السابق خلال شهر غالباً خطأ إدخال (وزن أو تاريخ خاطئ)
// لا تغيّراً حقيقياً. الزيادة السريعة لا تخضع لهذه العتبة لأنها معلومة سريرية
// حقيقية محتملة (احتباس سوائل، ستيرويدات) ويجب ألّا تُحجب عن النموذج
const MAX_PLAUSIBLE_MONTHLY_RATE_PERCENT = 10;

// ═══════════════════════════════════════════════════════════════════════
// قائمة الفئات السريرية — نص جاهز للحقن في البرومبت
// ═══════════════════════════════════════════════════════════════════════
const CATEGORY_LIST_TEXT = SUPPLEMENT_CATEGORIES.map(c => `- ${c.code} — ${c.labelAr}`).join('\n');

// ═══════════════════════════════════════════════════════════════════════
// System Instruction — خبير التغذية (مستقل تماماً)
// النموذج يقرر الفئة السريرية فقط (category_code من قائمة مغلقة) — لا يرى
// كتالوج الصيدلية ولا يسمّي منتجاً إطلاقاً؛ المطابقة بمنتج فعلي تتم بعد ذلك
// عبر استعلام حتمي على pharmacy_recommendations (راجع docs/schema.sql)
// ═══════════════════════════════════════════════════════════════════════
const NUTRITION_DEEP_INSTRUCTION = `
أنت مستشار التغذية وإدارة الوزن في الصيدلية. لديك مهمتان متكاملتان لا تتعارضان:

المهمة الأولى — مساعد صحي شخصي لكل مريض:
تفهم حالة كل مريض بعمق، تقرأ أدويته المزمنة، وتعطيه إرشادات مخصصة لحالته تحديداً. ليس نصائح عامة للجميع.

المهمة الثانية — تحديد الفئات السريرية التي تفيده من مكملات الصيدلية:
أنت لا ترى كتالوج الصيدلية ولا تختار منتجاً بعينه أبداً — مهمتك فقط اختيار الفئة السريرية الصحيحة من قائمة مغلقة، والقاعدة تتولى لاحقاً مطابقتها بمنتج فعلي إن وُجد.

---

## كيف تفكر قبل أي إجابة (التحليل الداخلي — لا يظهر في المخرج)

**قاعدة إلزامية — منع افتراض الأدوية (اقرأها أولاً):**
لا تستنتج وجود دواء من التشخيص إطلاقاً. تحدّث فقط عن الأدوية المذكورة صراحة بالاسم في "الأدوية المزمنة" ضمن بيانات المريض.
إن كان المريض مشخَّصاً بحالة (مثل ارتفاع الضغط أو السكري) دون أن يُذكر لها دواء في القائمة، تحدّث عن الحالة نفسها (تغذية داعمة، تقليل الملح أو السكر) ولا تفترض أنه يتناول علاجاً لها ولا تحذّر بخصوص "دوائه" لحالة لا دواء مذكوراً لها.

**أولاً: اقرأ التفاعلات المعطاة لأدوية المريض:**
لكل دواء وردت له "التفاعلات المعروفة" في البيانات، انظر:
- ما التفاعلات الغذائية المذكورة له؟
- ما العناصر التي يستنزفها حسب البيانات؟
- هل له توقيت محدد مذكور؟
لا تضف شيئاً من عندك لم يرد في البيانات.

التفاعلات الدوائية الغذائية معطاة لك في البيانات ولا تُستنتج:
- لا تذكر أي تفاعل غير مذكور صراحة في "التفاعلات المعروفة" ضمن بيانات المريض.
- لا تعمّم خاصية دواء على صنفه — الأدوية من نفس الصنف قد تختلف في مسار الاستقلاب.
- استعمل صياغة patientText كما هي أو أعد صوغها بلا تغيير المعنى ولا رفع درجة الإلحاح.
- رتّب التحذيرات: critical أولاً ثم important. تجاهل minor إن كان النص سيطول.
- الأدوية الموسومة "لم يُتعرّف عليها": لا تبنِ عليها أي تحذير غذائي ولا تفترض صنفها. اذكر للمريض أن يسأل صيدلانيه عن تفاصيلها.

**ثانياً: حدد الهدف الدقيق لهذا المريض:**
- زيادة وزن (BMI < 18.5) → فائض سعري من مصادر صحية، تركيز على البروتين والدهون الصحية
- إنقاص وزن (BMI ≥ 25) → عجز سعري تدريجي، تسلسل الطعام، إدارة الشهية
- وزن طبيعي → صيانة + دعم الأمراض المزمنة إن وجدت

**ثالثاً: حدد الفئة السريرية المناسبة لهذا المريض تحديداً — الرمز فقط، لا اسم منتج:**
اختر فئتين إلى أربع فئات فقط من القائمة المغلقة التالية، كل فئة يجب أن تكون مبرَّرة بحالة المريض أو بدواء مذكور صراحة في بياناته — لا اقتراح لمجرد الاقتراح:

${CATEGORY_LIST_TEXT}

ممنوع قطعاً ذكر اسم منتج أو ماركة تجارية أو مثال محدد (لا "ستيفيا"، لا "بسيليوم"، ولا أي اسم آخر) — استخدم رمز الفئة (category_code) من القائمة أعلاه فقط، بلا اختراع رموز جديدة.

**رابعاً: فكّر في التنبيهات الإكلينيكية:**
هل هناك مؤشر يستدعي فحصاً مخبرياً؟
- وزن لا ينزل رغم الالتزام → فيتامين D، TSH، كورتيزول
- تعب شديد مع ميتفورمين → B12
- تشنجات مع مدرات البول → ماغنيسيوم/بوتاسيوم
- جفاف مستمر مع ضغط → وظائف كلى

**خامساً: التعامل مع تقدّم المريض:**
في personal_message، ابدأ بذكر التقدّم بالأرقام إن وُجدت خطة سابقة ("تقدّم المريض" في بيانات المريض). النبرة داعمة دائماً: لا لوم، ولا تهوين، ولا مبالغة في المديح.
- إن كان أحد الفرقين (منذ آخر زيارة أو منذ البداية) صفراً أو أقل من نصف كيلوغرام، لا تذكر رقمه إطلاقاً — اكتفِ بذكر الفرق الآخر إن كان ذا دلالة، أو تحدّث عن الثبات بلا أرقام.
- إن نقص الوزن: اذكر الرقمين صراحة (منذ آخر زيارة، ومنذ البداية) ما لم يكن أحدهما صفراً حسب القاعدة أعلاه، وانسب الفضل لالتزام المريض لا للخطة. لا تمدح السرعة ولا تشجّع على تسريع النزول.
- إن ثبت الوزن تقريباً (أقل من كيلوغرام): اذكر أن الثبات مرحلة طبيعية في رحلة إنقاص الوزن وليس فشلاً، وركّز على ما يمكن تعديله.
- إن زاد الوزن: اذكر الرقم بهدوء وبلا لوم ولا تهويل. لا تفترض سبباً ولا تتهم المريض بالتقصير. وجّه الحديث إلى الخطوة القادمة، واذكر أن صيدليته معه في المتابعة.
- إن ورد تنبيه بسرعة النزول في البيانات، اذكره بلطف. لا تحسب النسبة بنفسك ولا تجتهد في تقديرها.

ممنوع: مقارنة المريض بغيره، أو ذكر أهداف زمنية صارمة، أو أي صياغة تحفّز على التقييد الغذائي المفرط.
إن لم توجد خطة سابقة في البيانات (أول خطة للمريض)، لا تذكر أي تقدّم إطلاقاً.

---

## اللغة والنبرة

العربية الفصحى المبسطة — لا أخطاء إملائية — لا كلمة إنجليزية واحدة في المخرج.
النبرة: دافئة، مقنعة، شخصية. تخاطب المريض باسمه. لا تخويف، لا مبالغة.
أسلوب الخبير الودود الذي يعرف حالتك ويتحدث إليك مباشرة.

---

## شكل الإخراج — JSON صارم فقط

بدون أي نص خارج الـ JSON. بدون backticks. JSON صالح كاملاً.

\`\`\`
{
  "personal_message": "رسالة تحفيزية شخصية 2-3 جمل: اذكر اسم المريض + وضعه بالأرقام + كلمة تشجيع حقيقية تلامس حالته. ليست عامة.",

  "smart_habits": [
    "عادة ذكية 1 — تقنية علمية بسيطة تناسب حالته (مثال: ابدأ كل وجبة بالخضار والبروتين قبل الكربوهيدرات — يقلل ارتفاع السكر 30٪)",
    "عادة ذكية 2",
    "عادة ذكية 3"
  ],

  "breakfast": [
    "خيار 1 — وصف الطعام + سبب اختياره لهذا المريض تحديداً",
    "خيار 2",
    "خيار 3",
    "خيار 4"
  ],
  "lunch": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
  "dinner": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],
  "snacks": ["خيار 1", "خيار 2", "خيار 3", "خيار 4"],

  "pharmacy_products": [
    {
      "category_code": "أحد رموز الفئات المذكورة أعلاه فقط — بدون اسم منتج",
      "reason": "لماذا يحتاج هذا المريض تحديداً لهذه الفئة — جملة واحدة مقنعة تربط الفئة بحالته أو بدواء مذكور صراحة",
      "instruction": "كيف تُستخدم هذه الفئة عادةً — جملة واحدة عملية"
    }
  ],

  "medications_alert": "تحذير غذائي مخصص بناءً على أدويته المزمنة المذكورة صراحة فقط — أو نص فارغ إذا لا توجد أدوية مذكورة. اذكر الدواء والتفاعل الغذائي المحدد باللغة العربية.",

  "lab_alerts": ["فحص مطلوب 1 إذا وُجد مؤشر — أو مصفوفة فارغة []"],

  "clinical_reasoning": "تحليلك الداخلي المختصر لحالة المريض وأدويته المذكورة صراحة وسبب اختيار هذه الفئات تحديداً — لا يُعرض للمريض إطلاقاً، للمراجعة الداخلية فقط."
}
\`\`\`

قواعد pharmacy_products:
- الحد الأدنى فئتان، الحد الأقصى أربع فئات
- category_code يجب أن يكون رمزاً من القائمة المغلقة أعلاه فقط — لا رمز مخترَع
- كل فئة مرتبطة فعلياً بحالة هذا المريض أو بدواء مذكور صراحة في بياناته — لا تقترح فئة لا علاقة لها بحالته
- ممنوع اقتراح أي فئة واردة ضمن "فئات مكملات ممنوع اقتراحها لهذا المريض" في بيانات الأدوية أدناه، حتى لو بدت مفيدة نظرياً لحالته
- الـ reason يجب أن يكون مقنعاً وشخصياً
- ممنوع قطعاً أي اسم منتج أو ماركة تجارية أو مثال محدد — الرمز وحده
`;

// ═══════════════════════════════════════════════════════════════════════
// Response Schema — يجبر Gemini على بنية JSON صارمة، وcategory_code محصور
// بقائمة الفئات المغلقة (enum) بدلاً من الاعتماد على البرومبت فقط
// ═══════════════════════════════════════════════════════════════════════
const NUTRITION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    personal_message: { type: Type.STRING },
    smart_habits:     { type: Type.ARRAY, items: { type: Type.STRING } },
    breakfast:        { type: Type.ARRAY, items: { type: Type.STRING } },
    lunch:            { type: Type.ARRAY, items: { type: Type.STRING } },
    dinner:           { type: Type.ARRAY, items: { type: Type.STRING } },
    snacks:           { type: Type.ARRAY, items: { type: Type.STRING } },
    pharmacy_products: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category_code: { type: Type.STRING, enum: SUPPLEMENT_CATEGORIES.map(c => c.code) },
          reason:        { type: Type.STRING },
          instruction:   { type: Type.STRING },
        },
        required: ['category_code', 'reason', 'instruction'],
      },
    },
    medications_alert:  { type: Type.STRING },
    lab_alerts:         { type: Type.ARRAY, items: { type: Type.STRING } },
    clinical_reasoning: { type: Type.STRING },
  },
  required: [
    'personal_message', 'smart_habits', 'breakfast', 'lunch', 'dinner', 'snacks',
    'pharmacy_products', 'medications_alert', 'lab_alerts', 'clinical_reasoning',
  ],
};

// ═══════════════════════════════════════════════════════════════════════
// بناء نص التفاعلات الدوائية الغذائية المطابَقة حتمياً — يُحقن في userPrompt
// كحقائق جاهزة يقرؤها النموذج بدل أن يستنتجها (راجع drug-food-interactions.ts
// لسبب هذا القرار: النموذج عمّم قاعدة الستاتينات على روسوفاستاتين خطأً)
// ═══════════════════════════════════════════════════════════════════════
function buildDrugFactsText(matched: DrugEntry[], unknown: string[]): string {
  if (matched.length === 0 && unknown.length === 0) return 'لا توجد أدوية مزمنة مذكورة.';

  const blocks = matched.map(d => {
    const lines = [`- ${d.genericAr} (${d.generic}) — الصنف: ${d.drugClass}`];
    if (d.metabolismNote) lines.push(`  ملاحظة الاستقلاب: ${d.metabolismNote}`);
    if (d.timing) lines.push(`  التوقيت: ${d.timing}`);
    if (d.foods.length > 0) {
      lines.push('  التفاعلات المعروفة:');
      for (const f of d.foods) {
        lines.push(`    - ${f.item} | الآلية: ${f.mechanism} | الخطورة: ${f.severity} | نص للمريض: "${f.patientText}"`);
      }
    } else {
      lines.push('  لا تفاعلات غذائية معروفة لهذا الدواء.');
    }
    if (d.depletes?.length) lines.push(`  يستنزف عناصر يُرجّح احتياج المريض لمكملاتها: ${d.depletes.join(', ')}`);
    if (d.avoidSupplements?.length) lines.push(`  فئات مكملات ممنوع اقتراحها لهذا المريض: ${d.avoidSupplements.join(', ')}`);
    return lines.join('\n');
  });

  const unknownBlock = unknown.length > 0
    ? `\nأدوية لم يُتعرّف عليها (لا تبنِ عليها أي تحذير ولا تفترض صنفها، اذكر للمريض أن يسأل صيدلانيه عن تفاصيلها):\n${unknown.map(u => `- ${u}`).join('\n')}`
    : '';

  return `${blocks.join('\n\n')}${unknownBlock}`;
}

// ═══════════════════════════════════════════════════════════════════════
// استخراج كود HTTP من أخطاء Gemini
// ═══════════════════════════════════════════════════════════════════════
function getErrStatus(e: any): number {
  if (typeof e?.status === 'number') return e.status;
  const m = String(e?.message || e || '');
  const match = m.match(/\b(4\d\d|5\d\d)\b/);
  return match ? parseInt(match[1], 10) : 0;
}

// ═══════════════════════════════════════════════════════════════════════
// POST — إنشاء خطة وزن جديدة (بدون AI، فوري)
// Body: { patient_id, pharmacy_id, weight_kg, height_cm, performed_by }
// ═══════════════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { patient_id, pharmacy_id, weight_kg, height_cm, performed_by } = body;

    if (!patient_id || !pharmacy_id || !weight_kg || !height_cm) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    const wNum = Number(weight_kg);
    const hNum = Number(height_cm);

    if (isNaN(wNum) || isNaN(hNum) || wNum < 20 || wNum > 500 || hNum < 50 || hNum > 250) {
      return NextResponse.json({ error: 'قيم الوزن أو الطول غير صحيحة' }, { status: 400 });
    }

    // ── الحسابات بالكود (لا AI) ──────────────────────────────────────
    const goals   = calcWeightGoals(wNum, hNum);
    const bmi     = Math.round(goals.bmi * 10) / 10;
    const cat     = getBMICategory(goals.bmi);

    const bmiCategoryKey =
      goals.bmi < 18.5 ? 'underweight' :
      goals.bmi < 25   ? 'normal'      :
      goals.bmi < 30   ? 'overweight'  :
      goals.bmi < 35   ? 'obese_1'     : 'obese_2';

    // ── حفظ في DB ────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from('weight_plans')
      .insert({
        pharmacy_id,
        patient_id,
        weight_kg:        wNum,
        height_cm:        hNum,
        bmi,
        bmi_category:     bmiCategoryKey,
        ideal_weight_min: goals.idealMin,
        ideal_weight_max: goals.idealMax,
        target_loss_kg:   goals.toLoose,
        first_goal_kg:    goals.firstGoal,
        performed_by:     performed_by || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error('[weight-plan POST] DB error:', error);
      return NextResponse.json({ error: 'تعذر حفظ الخطة' }, { status: 500 });
    }

    return NextResponse.json({
      plan_id: data.id,
      bmi,
      category: {
        label:       cat.label,
        labelShort:  cat.labelShort,
        color:       cat.color,
        bgColor:     cat.bgColor,
        borderColor: cat.borderColor,
        dot:         cat.dot,
        emoji:       cat.emoji,
      },
      goals: {
        idealMin:   goals.idealMin,
        idealMax:   goals.idealMax,
        toLoose:    goals.toLoose,
        firstGoal:  goals.firstGoal,
      },
    });
  } catch (err: any) {
    console.error('[weight-plan POST] error:', err);
    return NextResponse.json({ error: err.message || 'خطأ في السيرفر' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PATCH — توليد النظام الغذائي بالـ AI وحفظه في الخطة
// Body: { plan_id, patient_name, age, gender, diagnosed_conditions,
//         medications, pharmacy_name }
// ═══════════════════════════════════════════════════════════════════════
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const {
      plan_id,
      patient_name     = 'المريض',
      age,
      gender,
      diagnosed_conditions = [],
      medications          = [],   // أسماء الأدوية المزمنة
      pharmacy_name        = 'صيدليتك',
    } = body;

    if (!plan_id) {
      return NextResponse.json({ error: 'معرف الخطة مطلوب' }, { status: 400 });
    }

    // ── جلب بيانات الخطة من DB ───────────────────────────────────────
    const { data: plan, error: fetchErr } = await supabaseAdmin
      .from('weight_plans')
      .select('patient_id, pharmacy_id, weight_kg, height_cm, bmi, bmi_category, ideal_weight_min, ideal_weight_max, target_loss_kg, first_goal_kg, created_at')
      .eq('id', plan_id)
      .single();

    if (fetchErr || !plan) {
      return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 });
    }

    // ── تقدّم المريض: مقارنة بالخطة السابقة وبأول خطة له ─────────────
    // استعلام حتمي بالكود لا استنتاج من النموذج — نفس مبدأ التفاعلات الدوائية
    const { data: priorPlans } = await supabaseAdmin
      .from('weight_plans')
      .select('weight_kg, created_at')
      .eq('patient_id', plan.patient_id)
      .neq('id', plan_id)
      .order('created_at', { ascending: true });

    // كائن مستقل تُحفظ فيه نفس أرقام "تقدّم المريض" جاهزة للواجهة — بدل أن
    // تُعيد الواجهة استنتاجها من النص أو تعيد حسابها بنفسها لاحقاً
    type ProgressData = {
      baselineWeight:    number;
      baselineDate:      string; // ISO — التنسيق مسؤولية الواجهة
      previousWeight:    number;
      previousDate:      string; // ISO
      currentWeight:     number;
      diffFromPrevious:  number;
      daysSincePrevious: number;
      diffFromBaseline:  number;
      daysSinceBaseline: number;
      rateWarning:       boolean;
      dataSuspect?:      boolean; // نقصان غير معقول سريرياً (>10% شهرياً) — الواجهة تعرضه، والنموذج لا يتلقى تقدّماً
    };

    let progressText: string | null = null;
    let progressData: ProgressData | null = null;

    if (priorPlans && priorPlans.length > 0) {
      const currentDate = new Date(plan.created_at);

      // تجاهل الخطط الأقرب من 7 أيام من الخطة الحالية عند اختيار "السابقة" —
      // إعادة التوليد في نفس اليوم تصحيح لا تقدّم، وتُنتج نسبة شهرية مبالغاً
      // فيها تُطلق تنبيه "نزول سريع" زائفاً. baseline (أقدم خطة) لا يُصفّى.
      const eligiblePrevious = priorPlans.filter(p => {
        const days = Math.round((currentDate.getTime() - new Date(p.created_at).getTime()) / 86400000);
        return days >= 7;
      });

      if (eligiblePrevious.length > 0) {
        const baseline = priorPlans[0];
        const previous = eligiblePrevious[eligiblePrevious.length - 1];
        const baselineDate = new Date(baseline.created_at);
        const previousDate = new Date(previous.created_at);

        const diffFromPrevious = Math.round((plan.weight_kg - previous.weight_kg) * 10) / 10;
        const diffFromBaseline = Math.round((plan.weight_kg - baseline.weight_kg) * 10) / 10;
        const daysSincePrevious = Math.round((currentDate.getTime() - previousDate.getTime()) / 86400000);
        const daysSinceBaseline = Math.round((currentDate.getTime() - baselineDate.getTime()) / 86400000);

        const fmtDate = (d: Date) => d.toLocaleDateString('ar-EG', { numberingSystem: 'latn' });
        const fmtDiff = (n: number) => `${n > 0 ? '+' : ''}${n} كغ`;

        // معدل النزول الشهري كنسبة من وزن الجسم — يُحسب بالكود لا يُترك للنموذج.
        // حراسة القسمة على صفر: عدد أيام أو وزن سابق صفر يمنعان الحساب
        let rateWarning = false;
        let rateWarningLine = 'معدل النزول ضمن المعتاد.';
        let dataSuspect = false;
        if (daysSincePrevious > 0 && previous.weight_kg > 0) {
          const monthlyRatePercent = (diffFromPrevious / previous.weight_kg) * (30 / daysSincePrevious) * 100;
          if (diffFromPrevious < 0 && Math.abs(monthlyRatePercent) > 5) {
            rateWarning = true;
            const pct = Math.round(Math.abs(monthlyRatePercent) * 10) / 10;
            rateWarningLine = `تنبيه: معدل النزول سريع (${pct}% شهرياً) — نبّه المريض بلطف أن هذا يستحق فحصاً طبياً.`;
          }
          if (diffFromPrevious < 0 && Math.abs(monthlyRatePercent) > MAX_PLAUSIBLE_MONTHLY_RATE_PERCENT) dataSuspect = true;
        }
        if (daysSinceBaseline > 0 && baseline.weight_kg > 0) {
          const monthlyRateFromBaselinePercent = (diffFromBaseline / baseline.weight_kg) * (30 / daysSinceBaseline) * 100;
          if (diffFromBaseline < 0 && Math.abs(monthlyRateFromBaselinePercent) > MAX_PLAUSIBLE_MONTHLY_RATE_PERCENT) dataSuspect = true;
        }

        progressText = dataSuspect ? null :
`الوزن الأول: ${baseline.weight_kg} كغ بتاريخ ${fmtDate(baselineDate)}
الوزن في آخر زيارة سابقة: ${previous.weight_kg} كغ بتاريخ ${fmtDate(previousDate)}
الوزن الحالي: ${plan.weight_kg} كغ
الفرق عن آخر زيارة: ${fmtDiff(diffFromPrevious)} خلال ${daysSincePrevious} يوماً
الفرق عن البداية: ${fmtDiff(diffFromBaseline)} خلال ${daysSinceBaseline} يوماً
${rateWarningLine}`;

        progressData = {
          baselineWeight:    baseline.weight_kg,
          baselineDate:      baselineDate.toISOString(),
          previousWeight:    previous.weight_kg,
          previousDate:      previousDate.toISOString(),
          currentWeight:     plan.weight_kg,
          diffFromPrevious,
          daysSincePrevious,
          diffFromBaseline,
          daysSinceBaseline,
          rateWarning,
          ...(dataSuspect ? { dataSuspect: true } : {}),
        };
      }
    }

    const hasDiabetes      = diagnosed_conditions.includes('diabetes');
    const hasHypertension  = diagnosed_conditions.includes('hypertension');
    const genderAr         = gender === 'female' ? 'أنثى' : 'ذكر';

    const bmiCategoryLabel =
      plan.bmi_category === 'underweight' ? 'نحافة'        :
      plan.bmi_category === 'normal'      ? 'وزن صحي'      :
      plan.bmi_category === 'overweight'  ? 'زيادة وزن'    :
      plan.bmi_category === 'obese_1'     ? 'سمنة درجة أولى' : 'سمنة درجة ثانية أو أعلى';

    const conditionsText = [
      hasDiabetes     ? 'السكري'           : '',
      hasHypertension ? 'ارتفاع الضغط'    : '',
    ].filter(Boolean).join(' - ') || 'لا يوجد';

    const medsText = medications.length > 0
      ? medications.join(' - ')
      : 'لا يوجد أدوية مزمنة';

    // مطابقة حتمية بالكود بدل ترك النموذج يستنتج التفاعل بنفسه — راجع
    // drug-food-interactions.ts لسبب هذا القرار المعماري
    const { matched: matchedDrugs, unknown: unknownDrugs } = matchPatientDrugs(medications);
    const drugFactsText = buildDrugFactsText(matchedDrugs, unknownDrugs);

    if (unknownDrugs.length > 0) {
      console.warn(`[weight-plan PATCH] أدوية لم تُطابَق في الجدول: ${unknownDrugs.join(', ')}`);
    }

    // فئات مكملات ممنوعة على هذا المريض تحديداً بسبب أدويته — تُستخدم لاحقاً
    // لفحص رد النموذج بالكود، لا الاعتماد على البرومبت وحده
    const avoidCategoriesForPatient = new Set<string>();
    for (const d of matchedDrugs) {
      for (const c of d.avoidSupplements || []) avoidCategoriesForPatient.add(c);
    }

    const userPrompt =
`اسم المريض: ${patient_name}
الجنس: ${genderAr} — العمر: ${age || 'غير محدد'} سنة
الوزن الحالي: ${plan.weight_kg} كغ
الطول: ${plan.height_cm} سم
مؤشر كتلة الجسم: ${plan.bmi} (${bmiCategoryLabel})
الوزن المثالي: ${plan.ideal_weight_min}–${plan.ideal_weight_max} كغ
المطلوب إنقاصه: ${plan.target_loss_kg > 0 ? plan.target_loss_kg + ' كغ' : 'الوزن ضمن النطاق المثالي'}
${plan.first_goal_kg > 0 ? `الهدف المبدئي: ${plan.first_goal_kg} كغ (5٪ من الوزن الحالي)\n` : ''}الأمراض المزمنة: ${conditionsText}
الأدوية المزمنة: ${medsText}

التفاعلات الدوائية الغذائية المعروفة لأدويته — معطاة لك حتمياً ولا تُستنتج:
${drugFactsText}
${progressText ? `\nتقدّم المريض:\n${progressText}\n` : ''}
اسم الصيدلية: ${pharmacy_name}`;

    // ── استدعاء Gemini → JSON مستشار التغذية ──────────────────────
    // pharmacy_products هنا هو اقتراح النموذج فقط (category_code + مبرر) —
    // لا يحمل بيانات منتج فعلي بعد؛ يُدمج بالمنتج الحقيقي لاحقاً عبر استعلام حتمي
    type PharmacyProductSuggestion = {
      category_code: string;
      reason:        string;
      instruction:   string;
    };
    type EnrichedPharmacyProduct = PharmacyProductSuggestion & {
      product: { product_name: string; price: number; image_url: string | null } | null;
    };
    type NutritionData = {
      personal_message:   string;        // رسالة شخصية تحفيزية
      smart_habits:       string[];      // عادات ذكية مخصصة
      breakfast:          string[];
      lunch:              string[];
      dinner:             string[];
      snacks:             string[];
      pharmacy_products:  EnrichedPharmacyProduct[]; // فئات مقترحة + المنتج الفعلي المطابق إن وُجد
      medications_alert:  string;        // تحذير غذائي دوائي
      lab_alerts:         string[];      // فحوصات مطلوبة
      clinical_reasoning: string;        // تحليل داخلي — لا يُعرض للمريض
      progress?:          ProgressData | null; // يحفظه الخادم فقط — النموذج لا يُنتجه
      drug_matching?:     { matched: string[]; unknown: string[] }; // يحفظه الخادم فقط — النموذج لا يُنتجه
    };

    // شرط قبول رد النموذج: يفحص البنية (أنواع الحقول) لا مجرد الوجود
    function isValidNutritionShape(p: any): p is Omit<NutritionData, 'pharmacy_products'> & { pharmacy_products: PharmacyProductSuggestion[] } {
      return !!p
        && Array.isArray(p.breakfast) && Array.isArray(p.lunch) && Array.isArray(p.dinner) && Array.isArray(p.snacks)
        && Array.isArray(p.pharmacy_products)
        && p.pharmacy_products.every((x: any) =>
          x && typeof x.category_code === 'string' && typeof x.reason === 'string' && typeof x.instruction === 'string');
    }

    let nutritionData: (Omit<NutritionData, 'pharmacy_products'> & { pharmacy_products: PharmacyProductSuggestion[] }) | null = null;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      for (const modelName of GEMINI_MODELS_FALLBACK) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config: {
              systemInstruction: NUTRITION_DEEP_INSTRUCTION,
              maxOutputTokens: 8000,
              responseMimeType: 'application/json',
              responseSchema: NUTRITION_RESPONSE_SCHEMA,
            },
          });
          const raw = response.text?.trim();
          if (raw && raw.length > 50) {
            const clean = raw.replace(/```json|```/g, '').trim();
            try {
              const parsed = JSON.parse(clean);
              if (isValidNutritionShape(parsed)) {
                // نضمن وجود كل الحقول
                if (!parsed.personal_message)  parsed.personal_message  = '';
                if (!parsed.smart_habits)      parsed.smart_habits      = [];
                if (!parsed.medications_alert) parsed.medications_alert = '';
                if (!parsed.lab_alerts)        parsed.lab_alerts        = [];
                if (!parsed.clinical_reasoning) parsed.clinical_reasoning = '';

                // نرفض أي فئة غير موجودة في القائمة المغلقة
                const validProducts = parsed.pharmacy_products.filter((x: PharmacyProductSuggestion) => {
                  const valid = isValidCategory(x.category_code);
                  if (!valid) console.warn(`[weight-plan PATCH] رمز فئة غير صالح مرفوض: ${x.category_code}`);
                  return valid;
                });
                parsed.pharmacy_products = validProducts;

                nutritionData = parsed;
                console.log(`[weight-plan PATCH] ✅ ${modelName} JSON parsed`);
                break;
              }
            } catch {
              const finishReason = response.candidates?.[0]?.finishReason;
              console.warn(`[weight-plan PATCH] ${modelName} parse failed | len=${raw.length} | finish=${finishReason} | tail=${raw.slice(-120)}`);
            }
          }
        } catch (e: any) {
          const status = getErrStatus(e);
          console.warn(`[weight-plan PATCH] ${modelName} → ${status || 'err'}:`, e?.message);
          if (status === 404 || status === 429 || status === 500 || status === 503) continue;
          break;
        }
      }
    }

    // ── Fallback محلي ─────────────────────────────────────────────────
    if (!nutritionData) {
      const sugarOpt    = hasDiabetes     ? 'مع بديل سكر طبيعي' : 'مع ملعقة عسل طبيعي';
      const saltTag     = hasHypertension ? ' — قليل الملح' : '';
      const hasMetform  = matchedDrugs.some((d) => d.generic === 'metformin');
      const hasDiuretic = matchedDrugs.some((d) => d.depletes?.includes('magnesium_potassium'));

      const goalText = plan.bmi_category === 'underweight'
        ? `زيادة وزنك بمقدار ${(plan.ideal_weight_min - plan.weight_kg).toFixed(1)} كغ`
        : plan.first_goal_kg > 0
          ? `إنقاص ${plan.first_goal_kg} كغ كهدف مبدئي`
          : 'المحافظة على وزنك الحالي ضمن النطاق الصحي';

      nutritionData = {
        personal_message: `${patient_name}، وزنك الحالي ${plan.weight_kg} كغ ومؤشر جسمك ${plan.bmi} (${bmiCategoryLabel}). هدفك القريب هو ${goalText}${plan.bmi_category === 'underweight' || plan.first_goal_kg > 0 ? ' — خطوة قابلة للتحقيق خلال 4 إلى 8 أسابيع مع الالتزام' : ''}. صيدليتك هنا لدعمك في كل خطوة.`,
        smart_habits: [
          hasDiabetes
            ? 'ابدأ كل وجبة بالخضار والبروتين قبل الكربوهيدرات — يُقلل ارتفاع السكر بعد الأكل بشكل ملحوظ'
            : plan.bmi_category === 'underweight'
            ? 'أضف ملعقة زيت زيتون أو أفوكادو لكل وجبة — مصدر سعرات صحية يساعدك على زيادة الوزن تدريجياً'
            : 'اشرب كوب ماء كامل قبل كل وجبة بـ15 دقيقة — يُقلل الكميات المتناولة طبيعياً دون جهد',
          'نظّم مواعيد وجباتك بفارق 4-5 ساعات — يُحسّن حرق الدهون ويضبط الهرمونات',
          'نَم 7-8 ساعات يومياً — النوم غير الكافي يرفع هرمون الجوع ويُعيق إنقاص الوزن حتى مع الالتزام بالحمية',
        ],
        breakfast: [
          `بيضتان مسلوقتان + خبز أسمر + زيت زيتون ${sugarOpt}`,
          `شوفان بالحليب قليل الدسم + تمرتان ${sugarOpt}`,
          `فول مدمس بزيت الزيتون + خبز أسمر ${sugarOpt}`,
          `لبن قليل الدسم + موزة + ملعقة بذور كتان ${sugarOpt}`,
        ],
        lunch: [
          `صدر دجاج مشوي + أرز بني + سلطة خضراء${saltTag}`,
          `سمك مشوي + خضار مطبوخة بالبخار + بطاطا حلوة${saltTag}`,
          `عدس مطبوخ مع الخضار + خبز أسمر${saltTag}`,
          `كبة بالفرن + لبن + سلطة فتوش${saltTag}`,
        ],
        dinner: [
          `شوربة خضار خفيفة + خبز أسمر`,
          `سلطة فتوش + جبن بلدي قليل الدسم`,
          `بيض مسلوق + خضار طازجة + زيت زيتون`,
          `لبن قليل الدسم + خيار وطماطم`,
        ],
        snacks: [
          `حفنة لوز أو جوز (30 غ) — دهون صحية تُطيل الشعور بالشبع`,
          `تفاحة أو إجاصة متوسطة — ألياف طبيعية لسد الشهية`,
          `تمرتان مع كوب ماء — طاقة سريعة بدون سكر مضاف`,
          `كوب لبن قليل الدسم — بروتين خفيف يمنع الجوع ليلاً`,
        ],
        pharmacy_products: [
          {
            category_code: 'sugar_substitute',
            reason: hasDiabetes
              ? 'يُعطيك حلاوة الطعام دون أي تأثير على مستوى السكر في الدم — مناسب جداً لحالتك'
              : 'يُخفض السعرات الحرارية من المشروبات والحلويات دون الشعور بالحرمان',
            instruction: 'استخدمه بديلاً عن السكر في المشروبات والطهي يومياً',
          },
          {
            category_code: hasMetform ? 'b12' : hasDiabetes ? 'blood_sugar_support' : 'fiber',
            reason: hasMetform
              ? 'ميتفورمين يُقلل امتصاص B12 تدريجياً مما قد يُسبب تنميلاً وإرهاقاً — استكماله ضروري لحالتك'
              : hasDiabetes
              ? 'يساعد على ضبط السكر بعد الوجبات بشكل طبيعي'
              : 'الألياف تُبطئ هضم الطعام وتُطيل الشعور بالشبع — مثالية لتقليل الكميات المتناولة',
            instruction: 'استشر صيدليانك للجرعة المناسبة لحالتك',
          },
          {
            category_code: 'vitamin_d',
            reason: 'نقص فيتامين D شائع جداً ويُعيق إنقاص الوزن ويؤثر على الطاقة والمناعة — خصوصاً في البيئة الأردنية',
            instruction: 'يُؤخذ مع وجبة تحتوي على دهون لتحسين الامتصاص',
          },
          ...(hasDiuretic ? [{
            category_code: 'magnesium_potassium',
            reason: 'مدرات البول تُفقد الجسم البوتاسيوم والماغنيسيوم مما قد يُسبب تشنجات وإرهاقاً — تعويضهما ضروري',
            instruction: 'استشر صيدليانك للجرعة المناسبة مع دوائك',
          }] : []),
        ],
        medications_alert: hasMetform
          ? `تنبيه مهم بخصوص ميتفورمين: هذا الدواء يُقلل امتصاص فيتامين B12 تدريجياً. تأكد من أكل مصادره يومياً (بيض، ألبان، دجاج) ونقاش مكمل B12 مع صيدليانك.`
          : hasHypertension && hasDiuretic
          ? `تنبيه بخصوص مدرات البول: هذا الدواء يُفقد الجسم البوتاسيوم — أكثر من البطاطا الحلوة والعدس والموز، وتجنب الإفراط في الملح.`
          : hasDiabetes
          ? `لحالتك مع السكري: ابدأ كل وجبة بالخضار والبروتين قبل الكربوهيدرات، ولا تتخطَّ وجبة إطلاقاً خصوصاً مع الأدوية.`
          : '',
        lab_alerts: hasMetform
          ? ['فحص مستوى فيتامين B12 — استخدام ميتفورمين لأكثر من سنة قد يُقلل امتصاصه تدريجياً']
          : [],
        clinical_reasoning: 'قالب احتياطي محلي — لا يعتمد على تحليل نموذج الذكاء الاصطناعي.',
      };
    }

    // ── فحص إضافي بالكود بعد رد النموذج (أو القالب الاحتياطي) — لا اعتماد على
    // البرومبت وحده لمنع فئة ممنوعة طبياً على هذا المريض بسبب دواء يتناوله ──
    // قرار الأسبقية عند التعارض: إن استنزف دواء عنصراً (depletes) بينما يمنع
    // آخر تعويضه (avoidSupplements) — كمريض على هيدروكلوروثيازيد (يستنزف
    // البوتاسيوم) مع فالسارتان (يحبسه) — يغلب المنع دائماً على الاستنزاف.
    // خطر فرط البوتاسيوم أشدّ سريرياً من نقصه المحتمل. قرار مقصود، لا أثر
    // جانبي لترتيب الكود.
    const suggestedCountBeforeFilter = nutritionData.pharmacy_products.length;
    nutritionData.pharmacy_products = nutritionData.pharmacy_products.filter(p => {
      if (avoidCategoriesForPatient.has(p.category_code)) {
        console.warn(`[weight-plan PATCH] فئة محظورة على هذا المريض حُذفت: ${p.category_code}`);
        return false;
      }
      return true;
    });

    if (nutritionData.pharmacy_products.length === 0) {
      console.warn(
        suggestedCountBeforeFilter > 0
          ? '[weight-plan PATCH] كل الفئات المقترحة محظورة على هذا المريض — لن تُعرض مقترحات'
          : '[weight-plan PATCH] النموذج لم يقترح أي فئة مكمّلات'
      );
    }

    // ── استعلام حتمي: مطابقة الفئات المقترحة بمنتج فعلي في كتالوج الصيدلية ──
    // القرار المعماري الموثّق في docs/schema.sql: المطابقة عبر استعلام قاعدة
    // بيانات حتمي وليس عبر الذكاء الاصطناعي — النموذج لا يرى الكتالوج إطلاقاً
    const suggestedCodes = nutritionData.pharmacy_products.map(p => p.category_code);
    let recommendationsByCategory = new Map<string, { product_name: string; price: number; image_url: string | null }>();

    if (suggestedCodes.length > 0) {
      const { data: recData } = await supabaseAdmin
        .from('pharmacy_recommendations')
        .select('category, product_name, price, image_url')
        .eq('pharmacy_id', plan.pharmacy_id)
        .eq('is_active', true)
        .in('category', suggestedCodes);

      for (const rec of recData || []) {
        recommendationsByCategory.set(rec.category, {
          product_name: rec.product_name,
          price:        rec.price,
          image_url:    rec.image_url,
        });
      }
    }

    const finalNutritionData: NutritionData = {
      ...nutritionData,
      pharmacy_products: nutritionData.pharmacy_products.map(p => ({
        ...p,
        product: recommendationsByCategory.get(p.category_code) || null,
      })),
      progress: progressData,
      drug_matching: { matched: matchedDrugs.map(d => d.genericAr), unknown: unknownDrugs },
    };

    // ── حفظ JSON في DB ────────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('weight_plans')
      .update({
        nutrition_plan:    finalNutritionData,
        plan_generated_at: new Date().toISOString(),
      })
      .eq('id', plan_id);

    if (updateErr) {
      console.error('[weight-plan PATCH] update error:', updateErr);
      return NextResponse.json({ error: 'تعذر حفظ القائمة الغذائية' }, { status: 500 });
    }

    return NextResponse.json({ success: true, dataSuspect: progressData?.dataSuspect ?? false });
  } catch (err: any) {
    console.error('[weight-plan PATCH] error:', err);
    return NextResponse.json({ error: err.message || 'خطأ في السيرفر' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════
// GET — صفحة المريض تجلب بيانات الخطة (service role، بدون auth)
// Query: ?id=<plan_id>
// ═══════════════════════════════════════════════════════════════════════
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const plan_id = searchParams.get('id');

    if (!plan_id) {
      return NextResponse.json({ error: 'معرف الخطة مطلوب' }, { status: 400 });
    }

    // جلب الخطة مع بيانات المريض والصيدلية
    const { data: plan, error } = await supabaseAdmin
      .from('weight_plans')
      .select(`
        id, weight_kg, height_cm, bmi, bmi_category,
        ideal_weight_min, ideal_weight_max, target_loss_kg, first_goal_kg,
        nutrition_plan, plan_generated_at, created_at,
        patient:patients(name, phone_number, gender, birth_date),
        pharmacy:pharmacies(name, pharmacy_name, phone_number)
      `)
      .eq('id', plan_id)
      .single();

    if (error || !plan) {
      return NextResponse.json(
        { error: 'لم يتم العثور على الخطة أو أن الرابط غير صالح.' },
        { status: 404 }
      );
    }

    // استخراج اسم الصيدلية بنفس منطق بقية المشروع
    const pharm = plan.pharmacy as any;
    const rawName = pharm?.name || pharm?.pharmacy_name || '';
    const pharmacyName = rawName.startsWith('صيدلية') ? rawName : rawName ? `صيدلية ${rawName}` : 'صيدليتك المعتمدة';
    const pharmacyPhone = pharm?.phone_number || '';

    const patient = plan.patient as any;

    // نحذف clinical_reasoning (تحليل داخلي للمراجعة الصيدلانية) و drug_matching
    // (تفاصيل مطابقة الأدوية) من الاستجابة العامة فقط — الصفحة بلا مصادقة،
    // فأي حقل هنا يصل مباشرة لمتصفح المريض ضمن استجابة الشبكة. يبقيان في القاعدة.
    const rawNutritionPlan = plan.nutrition_plan as any;
    const nutritionPlanForPatient = rawNutritionPlan
      ? (() => {
          const { clinical_reasoning, drug_matching, ...safeNutritionPlan } = rawNutritionPlan;
          return safeNutritionPlan;
        })()
      : rawNutritionPlan;

    return NextResponse.json({
      plan: {
        id:               plan.id,
        weight_kg:        plan.weight_kg,
        height_cm:        plan.height_cm,
        bmi:              plan.bmi,
        bmi_category:     plan.bmi_category,
        ideal_weight_min: plan.ideal_weight_min,
        ideal_weight_max: plan.ideal_weight_max,
        target_loss_kg:   plan.target_loss_kg,
        first_goal_kg:    plan.first_goal_kg,
        nutrition_plan:   nutritionPlanForPatient,
        plan_generated_at: plan.plan_generated_at,
        created_at:       plan.created_at,
      },
      patient: {
        name:         patient?.name         || 'المريض',
        phone_number: patient?.phone_number || '',
        gender:       patient?.gender       || 'male',
        birth_date:   patient?.birth_date   || null,
      },
      pharmacyName,
      pharmacyPhone,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err: any) {
    console.error('[weight-plan GET] error:', err);
    return NextResponse.json({ error: err.message || 'خطأ في السيرفر' }, { status: 500 });
  }
}
