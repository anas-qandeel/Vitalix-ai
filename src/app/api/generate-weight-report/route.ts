import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// ════════════════════════════════════════════════════════════════════════
// نماذج Gemini — نفس الترتيب المعتمد في بقية المسارات
// ════════════════════════════════════════════════════════════════════════
const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];

// ════════════════════════════════════════════════════════════════════════
// حسابات BMI — دوال مساعدة خالصة (لا تعتمد على Gemini)
// ════════════════════════════════════════════════════════════════════════
export function calcBMI(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  return weightKg / (h * h);
}

export function getBMICategory(bmi: number): {
  label: string;
  labelShort: string;
  color: string;       // Tailwind text color
  bgColor: string;     // Tailwind bg color
  borderColor: string; // Tailwind border color
  dot: string;         // Tailwind bg color for dot
  emoji: string;
} {
  if (bmi < 18.5) return {
    label: 'نحافة', labelShort: 'نحافة',
    color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', dot: 'bg-blue-500', emoji: '🔵',
  };
  if (bmi < 25) return {
    label: 'وزن صحي', labelShort: 'طبيعي',
    color: 'text-teal-700', bgColor: 'bg-teal-50', borderColor: 'border-teal-200', dot: 'bg-teal-500', emoji: '🟢',
  };
  if (bmi < 30) return {
    label: 'زيادة وزن', labelShort: 'زيادة',
    color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', dot: 'bg-amber-500', emoji: '🟡',
  };
  if (bmi < 35) return {
    label: 'سمنة درجة أولى', labelShort: 'سمنة',
    color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200', dot: 'bg-orange-500', emoji: '🟠',
  };
  return {
    label: 'سمنة درجة ثانية أو أعلى', labelShort: 'سمنة',
    color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200', dot: 'bg-rose-500', emoji: '🔴',
  };
}

export function calcWeightGoals(weightKg: number, heightCm: number): {
  bmi: number;
  idealMin: number;   // الحد الأدنى للوزن المثالي (BMI 18.5)
  idealMax: number;   // الحد الأعلى للوزن المثالي (BMI 24.9)
  toLoose: number;    // كيلو يجب إنقاصها للوصول لـ idealMax (0 إذا كان الوزن مثالياً أو أقل)
  firstGoal: number;  // الهدف المبدئي: 5% من الوزن الحالي (مقرّب لـ 0.5)
} {
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  const idealMin = Math.round(18.5 * h * h * 10) / 10;
  const idealMax = Math.round(24.9 * h * h * 10) / 10;
  const toLoose = weightKg > idealMax ? Math.round((weightKg - idealMax) * 10) / 10 : 0;
  // الهدف المبدئي: 5% من الوزن الحالي — لكن لا يتجاوز المطلوب إنقاصه
  const firstGoalRaw = weightKg * 0.05;
  const firstGoalUncapped = Math.round(firstGoalRaw * 2) / 2;
  const firstGoal = toLoose > 0 ? Math.min(firstGoalUncapped, toLoose) : firstGoalUncapped;
  return { bmi, idealMin, idealMax, toLoose, firstGoal };
}

// ════════════════════════════════════════════════════════════════════════
// SYSTEM INSTRUCTION — خبير التغذية (مستقل تماماً عن AI التشخيص)
// ════════════════════════════════════════════════════════════════════════
const WEIGHT_SYSTEM_INSTRUCTION = `أنت خبير تغذية ومتابعة وزن تابع لصيدلية أردنية، تكتب تقريراً تحفيزياً شخصياً للمريض.

## اللغة — قاعدة مطلقة
اكتب باللغة العربية فقط بدون استثناء. ممنوع تماماً أي كلمة إنجليزية بما فيها BMI — استخدم "مؤشر كتلة الجسم" أو "مؤشر الجسم".

## شكل الإخراج
فقرة نثرية واحدة متصلة، 4–5 جمل فقط. لا عناوين، لا نقاط، لا Markdown، لا أرقام مرقّمة.
ابدأ مباشرة بالتحليل — لا ترحيب ولا "مرحباً" (تُضاف تلقائياً).

## المحتوى بالترتيب الإلزامي
1. الوضع الحالي بأرقامه الفعلية: اذكر الوزن الحالي والطول والهدف المبدئي المُعطى لك — لا تخترع أرقاماً.
2. الهدف المبدئي المحفّز: "ابدأ بـ [الرقم المُعطى] كغ فقط — هذه النسبة الصغيرة كافية لتحسين طاقتك وتخفيف الضغط على مفاصلك وقلبك".
3. الربط بالأمراض المزمنة إن وُجدت: الوزن الزائد يجعل ضبط السكر/الضغط أصعب — كل كيلو تنقصه خطوة نحو توازن أفضل.
4. خطوة عملية فورية: استبدال السكر الأبيض ببديل طبيعي صحي — تجد في صيدليتك أكثر من خيار، والصيدلاني يرشدك للأنسب.
5. ربط ولاء الصيدلية: اختم بجملة تربط المريض بالصيدلية — مثال: "صيدليتك هنا لمتابعتك في كل خطوة، ولتنبيهك متى تحتاج استشارة طبية".
6. إن كان هناك مؤشر يستدعي انتباهاً طبياً (فقدان وزن غير مبرَّر، أو وزن لا يستجيب رغم الالتزام)، نبّه المريض بلطف أن الأمر يستحق فحصاً طبياً — واذكر أن الصيدلية تتابعه في كل الحالات.

## ممنوع تماماً
- ذكر أي دواء أو مكمل غذائي بالاسم.
- كتابة أي كلمة بالإنجليزية.
- اختراع أرقام غير مذكورة في البيانات المُعطاة.`;



// ════════════════════════════════════════════════════════════════════════
// SYSTEM INSTRUCTION — خطة التغذية الأسبوعية (on-demand فقط)
// ════════════════════════════════════════════════════════════════════════
const NUTRITION_PLAN_INSTRUCTION = `أنت خبير تغذية تابع لصيدلية أردنية، تكتب خطة تغذية مخصصة تُرسل عبر WhatsApp للمريض.

## اللغة — قاعدة مطلقة لا استثناء فيها
اكتب باللغة العربية فقط من أول كلمة إلى آخر كلمة.
ممنوع تماماً أي كلمة إنجليزية حتى لو كانت مصطلحاً: اكتب "وجبة خفيفة" لا Snack، "إفطار" لا Breakfast، "غداء" لا Lunch.

## شكل الإخراج لـ WhatsApp
نص عادي فقط — لا نجوم، لا شرطات، لا Markdown، لا رموز خاصة.
ستُعطى اسم المريض واسم الصيدلية في البيانات — استخدمهما في النص.

## البنية الإلزامية (اتّبعها بالحرف)

أولاً — جملة افتتاحية شخصية:
"[اسم المريض]، هذه خطتك الغذائية المخصصة لمساعدتك في الوصول لوزنك المثالي مع دعم [اسم الصيدلية]:"

ثانياً — ثلاثة أيام نموذجية، كل يوم يحتوي:
اليوم الأول:
الإفطار: [وصف] — مع [بديل السكر الصحي: عسل طبيعي أو تمر أو ستيفيا — متوفر في [اسم الصيدلية]]
الغداء: [وصف]
العشاء: [وصف]
وجبة خفيفة: [وصف]

[كرر لليوم الثاني والثالث بنفس البنية]

ثالثاً — ملاحظة تغذوية: جملة واحدة مفيدة مرتبطة بحالة المريض.

رابعاً — جملة ختامية تربط المريض بالصيدلية وتشجع على الشراء منها:
مثال: "بدائل السكر الصحية والمكملات الداعمة لإدارة الوزن متوفرة لدى [اسم الصيدلية] — فريقنا مستعد لمساعدتك في اختيار الأنسب لحالتك."

## قواعد المحتوى
- مكونات أردنية شائعة: خبز أسمر، زيت زيتون، لبن، بيض، خضار موسمية، عدس، دجاج مشوي.
- السكري: مؤشر جلايسيمي منخفض، تجنّب النشويات البيضاء.
- الضغط: قليل الملح، غني بالبوتاسيوم (موز، بطاطا حلوة).
- لا أدوية، لا مكملات بالاسم التجاري، لا تشخيص طبي.`;

// ════════════════════════════════════════════════════════════════════════
// استخراج كود HTTP من أخطاء Gemini
// ════════════════════════════════════════════════════════════════════════
function getErrStatus(e: any): number {
  if (typeof e?.status === 'number') return e.status;
  const m = String(e?.message || e || '');
  const match = m.match(/\b(4\d\d|5\d\d)\b/);
  return match ? parseInt(match[1], 10) : 0;
}

// ════════════════════════════════════════════════════════════════════════
// POST /api/generate-weight-report
//
// mode = 'motivational' → رسالة تحفيزية قصيرة (تُضاف في تقرير الزيارة)
// mode = 'nutrition_plan' → خطة تغذية أسبوعية كاملة (on-demand للمريض)
// ════════════════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      mode = 'motivational', // 'motivational' | 'nutrition_plan'
      weight,
      height,
      age,
      gender,
      diagnosed_conditions = [],
      pharmacyName = 'صيدليتك',
      patientName = 'عزيزنا',
      previousWeight = null, // آخر وزن مسجّل للمقارنة
    } = body;

    // ── التحقق من المدخلات الإلزامية ──
    if (!weight || !height) {
      return NextResponse.json({ error: 'الوزن والطول مطلوبان' }, { status: 400 });
    }

    const weightNum = Number(weight);
    const heightNum = Number(height);

    if (isNaN(weightNum) || isNaN(heightNum) || heightNum < 50 || heightNum > 250) {
      return NextResponse.json({ error: 'قيم الوزن أو الطول غير صحيحة' }, { status: 400 });
    }

    // ── الحسابات الرياضية (لا تعتمد على AI) ──
    const goals = calcWeightGoals(weightNum, heightNum);
    const bmiRounded = Math.round(goals.bmi * 10) / 10;
    const category = getBMICategory(goals.bmi);

    const hasDiabetes = diagnosed_conditions.includes('diabetes');
    const hasHypertension = diagnosed_conditions.includes('hypertension');
    const genderAr = gender === 'female' ? 'أنثى' : 'ذكر';

    // تغيير الوزن مقارنة بالزيارة السابقة
    const weightChange = previousWeight !== null
      ? Math.round((weightNum - Number(previousWeight)) * 10) / 10
      : null;

    // ── بناء الـ prompt بناءً على الـ mode ──
    const isNutritionPlan = mode === 'nutrition_plan';
    const systemInstruction = isNutritionPlan ? NUTRITION_PLAN_INSTRUCTION : WEIGHT_SYSTEM_INSTRUCTION;

    const conditionsText = [hasDiabetes ? 'السكري' : '', hasHypertension ? 'ارتفاع الضغط' : ''].filter(Boolean).join(' - ') || 'لا يوجد';

    const userPrompt = isNutritionPlan
      ? `اسم المريض: ${patientName}
اسم الصيدلية: ${pharmacyName}
الجنس: ${genderAr} — العمر: ${age || 'غير محدد'} سنة
الوزن الحالي: ${weightNum} كغ
الطول: ${heightNum} سم
مؤشر كتلة الجسم: ${bmiRounded} (${category.label})
الوزن المثالي: ${goals.idealMin}–${goals.idealMax} كغ
المطلوب إنقاصه: ${goals.toLoose > 0 ? goals.toLoose + ' كغ' : 'الوزن ضمن النطاق المثالي'}
الهدف المبدئي: ${goals.firstGoal} كغ
الأمراض المزمنة: ${conditionsText}`
      : `الجنس: ${genderAr} — العمر: ${age || 'غير محدد'} سنة
الوزن الحالي: ${weightNum} كغ
الطول: ${heightNum} سم
مؤشر كتلة الجسم: ${bmiRounded} — التصنيف: ${category.label}
الوزن المثالي لهذا الطول: ${goals.idealMin}–${goals.idealMax} كغ
المطلوب إنقاصه للوصول للنطاق المثالي: ${goals.toLoose > 0 ? goals.toLoose + ' كغ' : 'الوزن ضمن النطاق الطبيعي — يُحافَظ عليه'}
الهدف المبدئي المقترح: ${goals.firstGoal} كغ (5٪ من الوزن الحالي)
${weightChange !== null ? `تغيير الوزن مقارنة بالزيارة السابقة: ${weightChange > 0 ? '+' : ''}${weightChange} كغ` : ''}
الأمراض المزمنة: ${conditionsText}
تعليمات إضافية: اذكر الطول (${heightNum} سم) صراحةً عند حديثك عن مؤشر الجسم. ربط ولاء المريض بالصيدلية هو هدف أساسي — لا توجّهه لمراجعة طبيب في موضوع الوزن.`;

    const geminiApiKey = process.env.GEMINI_API_KEY;

    // ── استدعاء Gemini ──
    if (geminiApiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      let resultText: string | null = null;
      let lastErr: any = null;

      for (const modelName of GEMINI_MODELS_FALLBACK) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: userPrompt,
            config: {
              systemInstruction,
              maxOutputTokens: isNutritionPlan ? 2000 : 450,
            },
          });

          const txt = response.text?.trim();
          if (txt && txt.length > 50) {
            resultText = txt;
            console.log(`[WeightAI] ✅ ${modelName} (mode: ${mode}, len: ${txt.length})`);
            break;
          }
        } catch (e: any) {
          lastErr = e;
          const status = getErrStatus(e);
          console.warn(`[WeightAI] ${modelName} → ${status || 'err'}:`, e?.message);
          if (status === 404) continue;
          break;
        }
      }

      if (resultText) {
        // خطة التغذية: الـ AI يكتب الاسم والصيدلية مباشرة في النص
        // التقرير التحفيزي: لا greeting (تُضاف من الكود في vitals/page.tsx)
        return NextResponse.json({
          text: resultText,
          bmi: bmiRounded,
          category: {
            label: category.label,
            labelShort: category.labelShort,
            color: category.color,
            bgColor: category.bgColor,
            borderColor: category.borderColor,
            dot: category.dot,
            emoji: category.emoji,
          },
          goals: {
            idealMin: goals.idealMin,
            idealMax: goals.idealMax,
            toLoose: goals.toLoose,
            firstGoal: goals.firstGoal,
          },
          weightChange,
        });
      }

      console.warn('[WeightAI] all models failed, using fallback', lastErr?.message);
    }

    // ── Fallback محلي ──
    const fallbackText = isNutritionPlan
      ? buildFallbackNutritionPlan(patientName, pharmacyName, hasDiabetes, hasHypertension)
      : buildFallbackMotivational(goals, bmiRounded, category.label, hasDiabetes, hasHypertension, weightChange);

    return NextResponse.json({
      text: fallbackText,
      bmi: bmiRounded,
      category: {
        label: category.label,
        labelShort: category.labelShort,
        color: category.color,
        bgColor: category.bgColor,
        borderColor: category.borderColor,
        dot: category.dot,
        emoji: category.emoji,
      },
      goals: {
        idealMin: goals.idealMin,
        idealMax: goals.idealMax,
        toLoose: goals.toLoose,
        firstGoal: goals.firstGoal,
      },
      weightChange,
    });
  } catch (err: any) {
    console.error('[WeightAI] server error:', err);
    return NextResponse.json({ error: err.message || 'خطأ في السيرفر' }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════════════
// Fallbacks محلية
// ════════════════════════════════════════════════════════════════════════
function buildFallbackMotivational(
  goals: ReturnType<typeof calcWeightGoals>,
  bmi: number,
  categoryLabel: string,
  hasDiabetes: boolean,
  hasHypertension: boolean,
  weightChange: number | null,
): string {
  const parts: string[] = [];

  if (goals.toLoose > 0) {
    parts.push(
      `وزنك الحالي يُصنَّف ضمن "${categoryLabel}"، وأنت على بعد ${goals.toLoose} كغ فقط من النطاق الصحي المثالي لطولك.`
    );
    parts.push(
      `ابدأ بهدف أولي محفّز وهو إنقاص ${goals.firstGoal} كغ فقط — هذه النسبة الصغيرة كافية لتحسين طاقتك وتخفيف الضغط على مفاصلك وقلبك.`
    );
  } else {
    parts.push(`وزنك ضمن النطاق الصحي الممتاز لطولك، استمر على نفس نمط حياتك الصحي.`);
  }

  if ((hasDiabetes || hasHypertension) && goals.toLoose > 0) {
    const conditions = [hasDiabetes ? 'السكر' : '', hasHypertension ? 'الضغط' : ''].filter(Boolean).join(' و');
    parts.push(`تذكّر أن الوزن الزائد يجعل ضبط ${conditions} أصعب — كل كيلو تنقصه خطوة نحو توازن أفضل.`);
  }

  if (weightChange !== null && weightChange !== 0) {
    const dir = weightChange < 0 ? 'انخفض' : 'ارتفع';
    const abs = Math.abs(weightChange);
    parts.push(`مقارنةً بزيارتك السابقة، ${dir} وزنك ${abs} كغ${weightChange < 0 ? ' — استمر على هذا المسار الرائع' : ''}.`);
  }

  parts.push('خطوة عملية تبدأ بها اليوم: استبدل السكر الأبيض ببديل طبيعي صحي كالعسل أو التمر أو الستيفيا — متوفرة في صيدليتك.');
  parts.push('صيدليتك هنا لمتابعتك في رحلة الوزن — من اختيار البدائل الصحية إلى تتبع تقدمك زيارة بزيارة، أنت لست وحدك في هذه الرحلة.');

  return parts.join(' ');
}

function buildFallbackNutritionPlan(
  patientName: string,
  pharmacyName: string,
  hasDiabetes: boolean,
  hasHypertension: boolean,
): string {
  const sugarNote = hasDiabetes
    ? ` بدون سكر أبيض — مع ستيفيا أو قرفة متوفرة في ${pharmacyName}`
    : ` مع ملعقة عسل طبيعي متوفر في ${pharmacyName}`;
  const saltNote = hasHypertension ? ' قليل الملح' : '';

  return `${patientName}، هذه خطتك الغذائية المخصصة لمساعدتك في الوصول لوزنك المثالي مع دعم ${pharmacyName}:

اليوم الأول:
الإفطار: بيضتان مسلوقتان + خبز أسمر + زيت زيتون + شاي أخضر${sugarNote}
الغداء: صدر دجاج مشوي + أرز بني + سلطة خضراء${saltNote}
العشاء: شوربة عدس + خبز أسمر
وجبة خفيفة: حفنة لوز أو جوز

اليوم الثاني:
الإفطار: لبن قليل الدسم + موزة + شوفان${sugarNote}
الغداء: سمك مشوي + خضار على البخار + بطاطا حلوة${saltNote}
العشاء: سلطة فتوش + جبن قليل الدسم
وجبة خفيفة: تفاحة أو كوب عرق السوس بدون سكر

اليوم الثالث:
الإفطار: فول مدمس بزيت الزيتون + خبز أسمر${sugarNote}
الغداء: كبة بالفرن + لبن + سلطة${saltNote}
العشاء: بيض + جبن بلدي + خضار طازجة
وجبة خفيفة: تمرتان أو حفنة زبيب

ملاحظة تغذوية: ${hasDiabetes ? 'تجنب العصائر المحلاة والنشويات البيضاء — الخضار والبروتين أساس كل وجبة.' : 'اشرب ثمانية أكواب ماء يومياً واستبدل العصائر المحلاة بالماء أو الأعشاب.'}

بدائل السكر الصحية ومستلزمات التغذية الداعمة لإدارة الوزن متوفرة لدى ${pharmacyName} — فريقنا مستعد لمساعدتك في اختيار الأنسب لحالتك. 💚`;
}

