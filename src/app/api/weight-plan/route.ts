import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { GoogleGenAI } from '@google/genai';
import { calcWeightGoals, getBMICategory } from '@/app/api/generate-weight-report/route';

// ═══════════════════════════════════════════════════════════════════════
// نماذج Gemini
// ═══════════════════════════════════════════════════════════════════════
const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];

// ═══════════════════════════════════════════════════════════════════════
// System Instruction — خبير التغذية (مستقل تماماً)
// تكتيك "حصان طروادة": يوصي بفئة منتجات عامة لا باسم تجاري
// ═══════════════════════════════════════════════════════════════════════
const NUTRITION_DEEP_INSTRUCTION = `
أنت مستشار التغذية وإدارة الوزن في الصيدلية. لديك مهمتان متكاملتان لا تتعارضان:

المهمة الأولى — مساعد صحي شخصي لكل مريض:
تفهم حالة كل مريض بعمق، تقرأ أدويته المزمنة، وتعطيه إرشادات مخصصة لحالته تحديداً. ليس نصائح عامة للجميع.

المهمة الثانية — موظف في الصيدلية يزيد المبيعات ويبني الولاء:
توصي بمنتجات موجودة في الصيدلية بشكل طبيعي ومقنع — لا كإعلان، بل كخبير يشرح الفائدة ويربط المنتج بحاجة المريض الفعلية.

---

## كيف تفكر قبل أي إجابة (التحليل الداخلي — لا يظهر في المخرج)

**أولاً: اقرأ الأدوية المزمنة بعين صيدلانية:**
لكل دواء مذكور، فكّر:
- ماذا يمنع أكله مع هذا الدواء؟
- ماذا ينقص هذا الدواء من الجسم؟
- هل توقيت الوجبات مهم مع هذا الدواء؟

أمثلة يجب أن تعرفها غيباً:
- ميتفورمين → يستنزف B12 تدريجياً → اقترح مصادره + مكمل B12 من الصيدلية
- مدرات البول (فوروسيميد/ثيازيد) → يفقد البوتاسيوم والماغنيسيوم → اقترح مصادرهما + مكملات
- مثبطات ACE (ليزينوبريل/راميبريل) → يرفع البوتاسيوم → حذّر من الإفراط بالموز والبقوليات
- ستاتينات → لا جريب فروت → أضف هذا التحذير صراحة
- وارفارين → الخضار الورقية تؤثر على جرعته → ثبّت الاستهلاك لا تقطعه
- سلفونيلوريا/غليبيزيد → خطر نقص سكر عند تأخر الوجبة → حذّر من تخطي الوجبات
- ليفوثيروكسين → تناوله على معدة فارغة → لا صويا/كرنب/قرنبيط قرب وقت الدواء
- كورتيزون → يرفع السكر والوزن ويضعف العظام → اقترح كالسيوم + فيتامين D من الصيدلية
- حاصرات بيتا → قد تخفي أعراض نقص السكر → وجبات منتظمة إلزامية

**ثانياً: حدد الهدف الدقيق لهذا المريض:**
- زيادة وزن (BMI < 18.5) → فائض سعري من مصادر صحية، تركيز على البروتين والدهون الصحية
- إنقاص وزن (BMI ≥ 25) → عجز سعري تدريجي، تسلسل الطعام، إدارة الشهية
- وزن طبيعي → صيانة + دعم الأمراض المزمنة إن وجدت

**ثالثاً: حدد منتجات الصيدلية المناسبة لهذا المريض تحديداً:**
فكّر: ما المنتجات الموجودة في صيدلية عادية التي تفيده بشكل حقيقي؟

أمثلة للمنتجات التي توصي بها (دون ذكر ماركة):
- بدائل السكر: ستيفيا، سكرالوز، إريثريتول — للجميع تقريباً
- حبوب القرفة أو مستخلص القرفة — لمقاومة الأنسولين والسكري
- أوميغا 3 — لصحة القلب والتمثيل الغذائي
- مكمل ألياف (بسيليوم/أسيليوم) — لسد الشهية وضبط السكر
- فيتامين D3 + K2 — لثبات الوزن المبهم، العظام، المناعة
- B12 — مع ميتفورمين
- بوتاسيوم/ماغنيسيوم — مع مدرات البول
- كالسيوم — مع كورتيزون أو المرأة فوق 40
- زنك + سيلينيوم — لصحة الغدة الدرقية والأيض
- بروتين مسحوق (واي/كازين) — لزيادة الوزن أو الحفاظ على العضلة مع الرجيم
- كرياتين — للنحافة وبناء الكتلة العضلية
- جلوكومانان — لسد الشهية قبل الوجبات
- كارنيتين — لدعم حرق الدهون مع التمارين
- فاتح شهية طبيعي (مستخلصات عشبية) — للنحافة التي تعاني من ضعف الشهية

**رابعاً: فكّر في التنبيهات الإكلينيكية:**
هل هناك مؤشر يستدعي فحصاً مخبرياً؟
- وزن لا ينزل رغم الالتزام → فيتامين D، TSH، كورتيزول
- تعب شديد مع ميتفورمين → B12
- تشنجات مع مدرات البول → ماغنيسيوم/بوتاسيوم
- جفاف مستمر مع ضغط → وظائف كلى

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
      "name": "اسم فئة المنتج (بدون ماركة تجارية)",
      "reason": "لماذا يحتاجه هذا المريض تحديداً — جملة واحدة مقنعة تربط المنتج بحالته",
      "instruction": "كيف يستخدمه — جملة واحدة عملية"
    }
  ],

  "medications_alert": "تحذير غذائي مخصص بناءً على أدويته المزمنة — أو نص فارغ إذا لا توجد أدوية. اذكر الدواء والتفاعل الغذائي المحدد باللغة العربية.",

  "lab_alerts": ["فحص مطلوب 1 إذا وُجد مؤشر — أو مصفوفة فارغة []"]
}
\`\`\`

قواعد pharmacy_products:
- الحد الأدنى منتجان، الحد الأقصى خمسة
- كل منتج مرتبط فعلياً بحالة هذا المريض — لا تقترح منتجاً لا علاقة له بحالته
- الـ reason يجب أن يكون مقنعاً وشخصياً (مثال: "لأن ميتفورمين يستنزف B12 تدريجياً وقد يسبب تنميلاً وإرهاقاً")
- ممنوع أي اسم تجاري أو ماركة
`;



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
      .select('weight_kg, height_cm, bmi, bmi_category, ideal_weight_min, ideal_weight_max, target_loss_kg, first_goal_kg')
      .eq('id', plan_id)
      .single();

    if (fetchErr || !plan) {
      return NextResponse.json({ error: 'الخطة غير موجودة' }, { status: 404 });
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

    const userPrompt =
`اسم المريض: ${patient_name}
الجنس: ${genderAr} — العمر: ${age || 'غير محدد'} سنة
الوزن الحالي: ${plan.weight_kg} كغ
الطول: ${plan.height_cm} سم
مؤشر كتلة الجسم: ${plan.bmi} (${bmiCategoryLabel})
الوزن المثالي: ${plan.ideal_weight_min}–${plan.ideal_weight_max} كغ
المطلوب إنقاصه: ${plan.target_loss_kg > 0 ? plan.target_loss_kg + ' كغ' : 'الوزن ضمن النطاق المثالي'}
الهدف المبدئي: ${plan.first_goal_kg} كغ (5٪ من الوزن الحالي)
الأمراض المزمنة: ${conditionsText}
الأدوية المزمنة: ${medsText}
اسم الصيدلية: ${pharmacy_name}`;

    // ── استدعاء Gemini → JSON مستشار التغذية ──────────────────────
    type PharmacyProduct = {
      name:        string;
      reason:      string;
      instruction: string;
    };
    type NutritionData = {
      personal_message:   string;        // رسالة شخصية تحفيزية
      smart_habits:       string[];      // عادات ذكية مخصصة
      breakfast:          string[];
      lunch:              string[];
      dinner:             string[];
      snacks:             string[];
      pharmacy_products:  PharmacyProduct[]; // منتجات الصيدلية
      medications_alert:  string;        // تحذير غذائي دوائي
      lab_alerts:         string[];      // فحوصات مطلوبة
    };

    let nutritionData: NutritionData | null = null;
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
            },
          });
          const raw = response.text?.trim();
          if (raw && raw.length > 50) {
            const clean = raw.replace(/```json|```/g, '').trim();
            try {
              const parsed = JSON.parse(clean);
              if (parsed.breakfast && parsed.lunch && parsed.pharmacy_products) {
                // نضمن وجود كل الحقول
                if (!parsed.personal_message)  parsed.personal_message  = '';
                if (!parsed.smart_habits)      parsed.smart_habits      = [];
                if (!parsed.medications_alert) parsed.medications_alert = '';
                if (!parsed.lab_alerts)        parsed.lab_alerts        = [];
                nutritionData = parsed as NutritionData;
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
      const sugarOpt    = hasDiabetes     ? 'مع بديل السكر الطبيعي (ستيفيا أو قرفة)' : 'مع ملعقة عسل طبيعي';
      const saltTag     = hasHypertension ? ' — قليل الملح' : '';
      const hasMetform  = medications.some((m: string) => m.includes('ميتفورمين') || m.toLowerCase().includes('metformin'));
      const hasDiuretic = medications.some((m: string) => m.includes('فوروسيميد') || m.includes('هيدروكلورو') || m.toLowerCase().includes('furosemide') || m.toLowerCase().includes('hydrochlorothiazide'));

      const goalText = plan.bmi_category === 'underweight'
        ? `زيادة وزنك بمقدار ${(plan.ideal_weight_min - plan.weight_kg).toFixed(1)} كغ`
        : `إنقاص ${plan.first_goal_kg} كغ كهدف مبدئي`;

      nutritionData = {
        personal_message: `${patient_name}، وزنك الحالي ${plan.weight_kg} كغ ومؤشر جسمك ${plan.bmi} (${bmiCategoryLabel}). هدفك القريب هو ${goalText} — خطوة قابلة للتحقيق خلال 4 إلى 8 أسابيع مع الالتزام. صيدليتك هنا لدعمك في كل خطوة.`,
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
            name: 'بديل السكر الطبيعي (ستيفيا أو إريثريتول)',
            reason: hasDiabetes
              ? 'يُعطيك حلاوة الطعام دون أي تأثير على مستوى السكر في الدم — مناسب جداً لحالتك'
              : 'يُخفض السعرات الحرارية من المشروبات والحلويات دون الشعور بالحرمان',
            instruction: 'استخدمه بديلاً عن السكر في المشروبات والطهي يومياً',
          },
          {
            name: hasMetform ? 'مكمل فيتامين B12' : hasDiabetes ? 'مستخلص القرفة أو كبسولاتها' : 'مكمل ألياف غذائية (بسيليوم)',
            reason: hasMetform
              ? 'ميتفورمين يُقلل امتصاص B12 تدريجياً مما قد يُسبب تنميلاً وإرهاقاً — استكماله ضروري لحالتك'
              : hasDiabetes
              ? 'القرفة تُحسّن حساسية الأنسولين وتساعد على ضبط السكر بعد الوجبات بشكل طبيعي'
              : 'الألياف تُبطئ هضم الطعام وتُطيل الشعور بالشبع — مثالية لتقليل الكميات المتناولة',
            instruction: 'استشر صيدليانك للجرعة المناسبة لحالتك',
          },
          {
            name: 'فيتامين D3 مع K2',
            reason: 'نقص فيتامين D شائع جداً ويُعيق إنقاص الوزن ويؤثر على الطاقة والمناعة — خصوصاً في البيئة الأردنية',
            instruction: 'يُؤخذ مع وجبة تحتوي على دهون لتحسين الامتصاص',
          },
          ...(hasDiuretic ? [{
            name: 'مكمل بوتاسيوم وماغنيسيوم',
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
      };
    }

    // ── حفظ JSON في DB ────────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from('weight_plans')
      .update({
        nutrition_plan:    nutritionData,
        plan_generated_at: new Date().toISOString(),
      })
      .eq('id', plan_id);

    if (updateErr) {
      console.error('[weight-plan PATCH] update error:', updateErr);
      return NextResponse.json({ error: 'تعذر حفظ القائمة الغذائية' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
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
        nutrition_plan:   plan.nutrition_plan,
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
