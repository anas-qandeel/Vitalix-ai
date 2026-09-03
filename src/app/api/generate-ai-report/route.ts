import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// قائمة نماذج مرتبة — يُجرَّب الأول فإن أعطى 404 ينتقل للتالي تلقائياً
// يمكن تجاوز الكل بتعريف GEMINI_MODEL في ملف .env.local
// النماذج المتاحة اعتباراً من أغسطس 2026
// gemini-3.6-flash : الأقوى والأكثر كفاءة (GA منذ يوليو 2026)
// gemini-3.5-flash-lite : الأسرع والأوفر تكلفة (GA منذ يوليو 2026)
const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];

// ملاحظة: الاسم والصيدلية لا يُطلب من Gemini كتابتهما — يُبنيان بالكود لضمان دقة 100%
const SYSTEM_INSTRUCTION = `أنت مساعد تحليلي متقدم في منصة Vitalix.ai. مهمتك كتابة تقرير موجّه للمريض يشرح قراءاته الحيوية بأسلوب دافئ ومهني ومفهوم.

## قواعد الإخراج (إلزامية)
- فقرة نثرية واحدة متصلة ومكتملة، بلا عناوين أو Markdown أو ترقيم.
- لا تكتب اسم المريض أو اسم الصيدلية — يُضافان تلقائياً.
- ابدأ مباشرةً بالتحليل.
- تجنب المصطلحات الطبية المعقدة — خاطب المريض بلغة واضحة.
- لا تقترح تعديل الجرعة أو العلاج — هذا من اختصاص الطبيب حصراً. اكتفِ بالتوجيه لمراجعته.
- ممنوع ذكر أي جملة تتعلق بعدم تعديل الجرعات أو الالتزام بالعلاج — لا تنهِ التقرير بهذا المعنى أبداً.

## معايير التصنيف الطبية المعتمدة

### سكر الدم
صائم: أقل من 55 → هبوط طارئ 🔴 | 55–79 (فوق 60 سنة) أو 55–69 (60 سنة أو أقل) → انخفاض 🟡 | 70–100 → طبيعي 🟢 | 101–125 → ارتفاع طفيف 🟡 | أكثر من 125 → ارتفاع ملحوظ 🔴
غير صائم/بعد الأكل: أقل من 54 → هبوط طارئ 🔴 | أقل من 70 → انخفاض 🟡 | 70–140 → طبيعي 🟢 | 141–180 → ارتفاع بعد الأكل 🟡 | أكثر من 180 → ارتفاع ملحوظ 🔴

### ضغط الدم
أقل من 80/50 → انخفاض شديد 🔴 | أقل من 90/60 → انخفاض 🟡
أكثر من 160/100 → ارتفاع شديد 🔴
131–160 انقباضي أو 91–100 انبساطي → ارتفاع ملحوظ 🟡
131–140 / 81–90 → ارتفاع خفيف 🟡
130/80 أو أقل → طبيعي 🟢

تعديل المعايير حسب الحالة السريرية:
- مشخّص بارتفاع الضغط: الهدف العلاجي أقل من 130/80 — أي قراءة بين 130/80 و140/90 تُصنَّف تنبيهاً 🟡 وليس طبيعياً
- فوق 60 سنة أو مشخّص بارتفاع الضغط: 150/90 أو أقل يُعتبر مقبولاً 🟢 — اذكر أن المعيار مختلف لهذه الفئة
- شخص غير مشخّص: اعتمد المعايير العامة فقط

### سكر الدم — تعديل حسب الحالة السريرية
- مشخّص بالسكري صائم: الهدف 80–130 (وليس 70–100) — ما بين 130 و180 يُعدّ مرتفعاً نسبياً 🟡
- مشخّص بالسكري بعد الأكل: الهدف أقل من 180 — ما بين 180 و250 مرتفع 🟡 — أكثر من 250 مرتفع جداً 🔴
- غير مشخّص: اعتمد المعايير العامة فقط

### معدل النبض
أكثر من 100 → مرتفع 🟡 | أقل من 60 → منخفض 🟡 | 60–100 → طبيعي 🟢

### BMI
أقل من 18.5 → نحافة | 18.5–24.9 → صحي | 25–29.9 → زيادة وزن | 30 فما فوق → سمنة

## آلية بناء التقرير
1. صنّف كل قراءة حسب المعايير أعلاه مع رمزها الدلالي 🔴🟡🟢.
2. معدل النبض: إذا أُعطي اذكره مع الضغط في نفس الجملة.
3. إذا فُحص الضغط والسكري معاً: ادمجهما في صورة واحدة متكاملة.
4. الأعراض: ادمجها في السياق — لا تسردها كقائمة.
5. العوامل المؤثرة (قهوة/مجهود/وجبة/توتر): اذكرها كتفسير محتمل للارتفاع واقترح إعادة القياس في ظروف أهدأ.
6. الدواء المزمن:
   - مشخّص وأكّد أخذ دوائه + قراءة غير طبيعية: اذكر صراحةً أن القراءة جاءت مرتفعة رغم الالتزام بالعلاج، وأن هذا يستوجب مراجعة الطبيب.
   - مشخّص ولم يؤكد أخذ الدواء: اكتفِ بوصف القراءة.
   - غير مشخّص: اكتفِ بوصف القراءة.
7. آخر الزيارات: إذا تكرر النمط في زيارتين أو أكثر أشر إليه.
8. إذا كانت جميع القراءات طبيعية: اكتفِ بجملة تطمين مع 🟢.
9. إذا فُحص الوزن: احسب BMI واذكر تصنيفه. إذا كان المريض مشخّصاً بالسكري أو الضغط اربط الوزن الزائد بأهمية السيطرة على المرض المزمن — الوزن الزائد يُصعّب التوازن.
10. اختم بتوصية واضحة: مراجعة الطبيب / إعادة القياس في ظروف أهدأ / طمأنينة — دون اقتراح علاج أو تعديل جرعة.
10. أعراض الطوارئ: إذا وُجد ألم في الصدر أو ضيق في التنفس بغض النظر عن القراءة، شدّد على التوجه الفوري لأقرب طوارئ أو مركز صحي — هذه الأعراض لا تنتظر موعداً.`;

// تُلحق بنهاية SYSTEM_INSTRUCTION (وبنهاية COMPRESS_INSTRUCTION عند الضغط)
// فقط عندما تكون اللغة المطلوبة 'en' — لا تُترجم SYSTEM_INSTRUCTION نفسه
const ENGLISH_OUTPUT_INSTRUCTION = `Write the entire report in clear, simplified, patient-facing English. All the rules and standards above apply exactly as stated. Keep the semantic symbols 🔴🟡🟢 exactly as they are. Do not write a single Arabic word in the output.

The Arabic rule above that says "do not write the patient's name or the pharmacy's name" does NOT apply in this English mode. Instead, begin the report with a greeting in exactly this form: "Hello [patient name], from the [pharmacy name] team 👋" — using the patient name and pharmacy name given to you in the data (provided in Arabic), transliterated into Latin letters, not translated in meaning. For example, "صيدلية نور الربيع" becomes "Nour Al-Rabee Pharmacy". Then continue the rest of the report in the same paragraph, right after the greeting.`;

// الترحيب الملصَق في بداية كل تقرير — مصدر واحد بدل تكرار النص حرفياً في أكثر
// من موضع، حتى لا تنحرف النسخ عن بعضها بصمت عند أي تعديل مستقبلي
function buildReportGreeting(patientName: string, pharmacyDisplayName: string, language: 'ar' | 'en'): string {
  return language === 'en'
    ? `Hello ${patientName}, from the ${pharmacyDisplayName} team 👋`
    : `مرحباً ${patientName}، من فريق ${pharmacyDisplayName} 👋`;
}

// استخراج كود HTTP من أي شكل يأتي به خطأ الـ API
function getErrStatus(e: any): number {
  if (typeof e?.status === 'number') return e.status;
  const m = String(e?.message || e || '');
  const match = m.match(/\b(4\d\d|5\d\d)\b/);
  return match ? parseInt(match[1], 10) : 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { patient, currentVisit, history, pharmacyName, language: languageRaw } = body;
    const language: 'ar' | 'en' = languageRaw === 'en' ? 'en' : 'ar';

    const patientName = patient?.name?.trim() || (language === 'en' ? 'Dear patient' : 'عزيزنا المريض');
    const pharmacyDisplayName = pharmacyName || (language === 'en' ? 'your pharmacy' : 'صيدليتك');
    const diagnosedConditions: string[] = patient?.diagnosed_conditions || [];

    // بناء وصف الحالة السريرية
    const tookMedication = currentVisit?.took_medication === true;
    // الدواءان المنفصلان (من الإصدار الجديد) مع fallback للحقل القديم
    const tookBpMed = currentVisit?.took_bp_medication === true || (tookMedication && !!(currentVisit?.bp_systolic) && !(currentVisit?.sugar_value));
    const tookSugarMed = currentVisit?.took_sugar_medication === true || (tookMedication && !!(currentVisit?.sugar_value) && !(currentVisit?.bp_systolic));
    const hasBpTest = !!(currentVisit?.bp_systolic);
    const hasSugarTest = !!(currentVisit?.sugar_value);
    const conditionLines: string[] = [];

    if (diagnosedConditions.includes('hypertension')) {
      conditionLines.push(
        hasBpTest
          ? (tookBpMed
              ? 'مشخّص بارتفاع الضغط وأكّد الصيدلاني أنه أخذ دواء الضغط اليوم'
              : 'مشخّص بارتفاع الضغط — لم يُأكَّد أخذ دواء الضغط اليوم')
          : 'مشخّص بارتفاع الضغط'
      );
    }
    if (diagnosedConditions.includes('diabetes')) {
      conditionLines.push(
        hasSugarTest
          ? (tookSugarMed
              ? 'مشخّص بالسكري وأكّد الصيدلاني أنه أخذ دواء السكري اليوم'
              : 'مشخّص بالسكري — لم يُأكَّد أخذ دواء السكري اليوم')
          : 'مشخّص بالسكري'
      );
    }
    if (conditionLines.length === 0) {
      conditionLines.push('غير مشخّص بأي مرض مزمن مسجّل');
    }
    const clinicalStatusLine = `الحالة السريرية: ${conditionLines.join(' — ')}`;

    // حساب العمر
    let patientAge = 'غير محدد';
    if (patient?.birth_date) {
      const age = new Date().getFullYear() - new Date(patient.birth_date).getFullYear();
      if (!isNaN(age) && age >= 0) patientAge = `${age} سنة`;
    }

    // حساب BMI
    const hMeters = patient?.height ? Number(patient.height) / 100 : null;
    const bmi = (hMeters && hMeters > 0 && currentVisit?.weight)
      ? (Number(currentVisit.weight) / (hMeters * hMeters)).toFixed(1)
      : null;

    // آخر 3 زيارات للمقارنة — مُصفّاة حسب نوع الفحص الحالي
    const allRecentVisits: any[] = Array.isArray(history) ? history.slice(0, 10) : [];
    const hasBpNow = currentVisit?.bp_systolic;
    const hasSugarNow = currentVisit?.sugar_value;
    const hasWeightNow = currentVisit?.weight;

    // نُرسل فقط الزيارات التي تحتوي على نفس نوع الفحص
    const recentVisits = allRecentVisits
      .filter((v: any) => {
        if (hasBpNow && v.bp_systolic) return true;
        if (hasSugarNow && v.sugar_value) return true;
        if (hasWeightNow && v.weight) return true;
        return false;
      })
      .slice(0, 3);
    const lastVisit = recentVisits.length > 0 ? recentVisits[0] : null;

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        // بناء ملخص الزيارات السابقة — فقط نفس نوع الفحص الحالي
        let recentVisitsLine = 'لا توجد زيارات سابقة للمقارنة بنفس نوع الفحص';
        if (recentVisits.length > 0) {
          const labels = ['آخر زيارة', 'قبل الأخيرة', 'قبل ذلك'];
          const summaries = recentVisits
            .map((v: any, idx: number) => {
              const parts: string[] = [];
              if (hasBpNow && v.bp_systolic) parts.push(`ضغط ${v.bp_systolic}/${v.bp_diastolic}${v.heart_rate ? ` نبض ${v.heart_rate}` : ''}`);
              if (hasSugarNow && v.sugar_value) parts.push(`سكري ${v.sugar_value}${v.sugar_test_type ? ` (${v.sugar_test_type === 'fasting' ? 'صائم' : v.sugar_test_type === 'postprandial' ? 'بعد الأكل' : 'عشوائي'})` : ''}`);
              if (hasWeightNow && v.weight) parts.push(`وزن ${v.weight} كغ`);
              return parts.length > 0 ? `${labels[idx] || 'أقدم'}: ${parts.join(' - ')}` : null;
            })
            .filter(Boolean) as string[];
          if (summaries.length > 0) recentVisitsLine = `زيارات سابقة بنفس الفحص: ${summaries.join(' | ')}`;
        }

        const bpLine = currentVisit?.bp_systolic && currentVisit?.bp_diastolic
          ? `${currentVisit.bp_systolic}/${currentVisit.bp_diastolic} mmHg`
          : 'لم يُقس';

        const heartRateLine = currentVisit?.heart_rate
          ? `${currentVisit.heart_rate} نبضة/دقيقة (${
              currentVisit.heart_rate < 60 ? 'بطء النبض' :
              currentVisit.heart_rate > 100 ? 'تسارع النبض' : 'ضمن الطبيعي'
            })`
          : 'لم يُقس';

        const sugarTypeAr = currentVisit?.sugar_test_type === 'fasting' ? 'صائم'
          : currentVisit?.sugar_test_type === 'postprandial' ? 'بعد الأكل' : 'عشوائي';

        const sugarLine = currentVisit?.sugar_value
          ? `${currentVisit.sugar_value} mg/dL (${sugarTypeAr})`
          : 'لم يُقس';

        const weightLine = currentVisit?.weight ? `${currentVisit.weight} kg` : 'لم يُقس';
        const bmiLine = bmi ? ` - BMI: ${bmi}` : '';
        const symptomsLine = currentVisit?.symptoms?.length ? currentVisit.symptoms.join('، ') : 'لا يوجد';
        const genderLine = patient?.gender === 'female' ? 'أنثى' : 'ذكر';

        const contextFactors: string[] = [];
        if (currentVisit?.had_stimulants) contextFactors.push('تناول مكيّفات (قهوة/شاي)');
        if (currentVisit?.recent_exertion) contextFactors.push('بذل مجهوداً جسدياً مؤخراً');
        if (currentVisit?.recent_heavy_meal) contextFactors.push('تناول وجبة دسمة مؤخراً');
        if (currentVisit?.is_stressed) contextFactors.push('يعاني من توتر نفسي');
        const contextLine = contextFactors.length > 0
          ? `عوامل خارجية مؤثرة: ${contextFactors.join(' - ')}`
          : 'عوامل خارجية: لا يوجد';

        const ageNum = patient?.birth_date
          ? new Date().getFullYear() - new Date(patient.birth_date).getFullYear()
          : null;
        const ageCategory = ageNum ? (ageNum > 60 ? 'فوق 60 سنة' : '60 سنة أو أقل') : 'غير محدد';

        const userPrompt = `اسم المريض: ${patientName}
اسم الصيدلية: ${pharmacyDisplayName}
الجنس: ${genderLine} - العمر: ${patientAge} (${ageCategory})
${clinicalStatusLine}
ضغط الدم: ${bpLine}
معدل النبض: ${heartRateLine}
سكري الدم: ${sugarLine}
الوزن: ${weightLine}${bmiLine}
الأعراض: ${symptomsLine}
${contextLine}
${recentVisitsLine}`;

        // ═══════════════════════════════════════════════════════
        // الطلب الأول: توليد التقرير الخام بحرية كاملة
        // الطلب الثاني: ضغطه وتنقيته في 3-4 جمل مكتملة
        // هذا يحل القطع + الهلوسة + الطول الزائد دفعة واحدة
        // ═══════════════════════════════════════════════════════
        let reportText: string | null = null;
        let lastModelErr: any = null;

        const COMPRESS_INSTRUCTION = `أنت محرر طبي. سيُعطيك تقرير طبي خام. مهمتك:
1. احذف أي جملة غير مكتملة في النهاية.
2. احذف الهلوسة أو الكلام المكرر أو الخروج عن الموضوع.
3. أعِد صياغته في فقرة واحدة نثرية مكتملة من 3 إلى 5 جمل فقط — بلا ترقيم أو عناوين.
4. احتفظ بجميع الأرقام والرموز 🔴🟡🟢 والتوصيات الأساسية.
5. لا تضف معلومات جديدة — فقط نقّح ما هو موجود.`;

        const PHARMACIST_SUMMARY_INSTRUCTION = `أنت مساعد سريري للصيدلاني في منصة Vitalix.ai. ستُعطى بيانات فحص مريض. أخرج JSON فقط بلا أي نص آخر، بلا Markdown، بلا \`\`\`، بهذه البنية حرفياً:
{"pharmacist_summary":"...","medications_alert":"..."}

- pharmacist_summary: سطران إلى ثلاثة بلغة سريرية مهنية موجهة للصيدلاني (ليس للمريض): التقييم السريري للقراءات، الارتباط بالتشخيصات المزمنة والأدوية، وأي نمط ملحوظ من الزيارات السابقة. مصطلحات طبية مسموحة هنا.
- medications_alert: جملة واحدة عن تداخل أو تنبيه دوائي مهم متعلق بالقراءات الحالية إن وُجد (مثل دواء يخفي أعراض هبوط السكر). إن لم يوجد تنبيه حقيقي، اجعل قيمته null.
- لا تقترح تعديل جرعات — أشر فقط لما يستحق انتباه الصيدلاني.`;

        // اللغة الإنجليزية تُلحق كتعليمة إضافية بنهاية كل تعليمة نظام — لا تُترجم
        // النصوص العربية نفسها (راجع ENGLISH_OUTPUT_INSTRUCTION أعلى الملف)
        const finalSystemInstruction = language === 'en'
          ? `${SYSTEM_INSTRUCTION}\n\n${ENGLISH_OUTPUT_INSTRUCTION}`
          : SYSTEM_INSTRUCTION;
        const finalCompressInstruction = language === 'en'
          ? `${COMPRESS_INSTRUCTION}\n\n${ENGLISH_OUTPUT_INSTRUCTION}`
          : COMPRESS_INSTRUCTION;

        for (const modelName of GEMINI_MODELS_FALLBACK) {
          try {
            // ── الطلب الأول: توليد خام ──
            const rawResponse = await ai.models.generateContent({
              model: modelName,
              contents: userPrompt,
              config: {
                systemInstruction: finalSystemInstruction,
                maxOutputTokens: 4096,
              },
            });
            const rawTxt = rawResponse.text?.trim() || '';
            const finishReason = rawResponse.candidates?.[0]?.finishReason;
            console.log(`[Gemini] raw finishReason: ${finishReason}, length: ${rawTxt.length}`);

            if (!rawTxt) break;

            let finalText = '';

            // إذا كان الطلب الأول مكتملاً ومعقولاً — استخدمه مباشرة
            if (finishReason === 'STOP' && rawTxt.length >= 200 && rawTxt.length <= 1200) {
              console.log(`[Gemini] raw complete — skipping compression`);
              finalText = rawTxt;
            } else {
              // ── الطلب الثاني: ضغط وتنقية (فقط عند الحاجة) ──
              console.log(`[Gemini] compressing (reason: ${finishReason}, len: ${rawTxt.length})`);
              const compressResponse = await ai.models.generateContent({
                model: modelName,
                contents: `التقرير الخام:\n${rawTxt}`,
                config: {
                  systemInstruction: finalCompressInstruction,
                  maxOutputTokens: 600,
                },
              });
              const compressed = compressResponse.text?.trim() || '';
              console.log(`[Gemini] compressed length: ${compressed.length}`);
              finalText = compressed.length > 100 ? compressed : rawTxt;
            }

            // تنظيف نهائي
            const cleanedFinal = finalText
              .replace(/^\d+\.\s*/gm, '')
              .replace(/\*[^*]*\*/g, '')
              .replace(/\[[^\]]*\]/g, '')
              .replace(/^[\s\/\-\*#]+/gm, '')
              .replace(/\n+/g, ' ')
              .trim();

            if (cleanedFinal) {
              reportText = cleanedFinal;
              console.log(`[Gemini] ✅ success: ${modelName} (final: ${reportText.length} chars)`);
            }
            break;
          } catch (modelErr: any) {
            lastModelErr = modelErr;
            const status = getErrStatus(modelErr);
            console.warn(`[Gemini] ${modelName} → ${status || 'err'}:`, modelErr?.message || modelErr);
            if (status === 404) continue;
            break;
          }
        }

        if (reportText) {
          // بالإنجليزية النموذج يكتب التحية بنفسه (بأسماء منقحَرة — راجع
          // ENGLISH_OUTPUT_INSTRUCTION) فلا نلصق تحية عربية الأسماء فوقها
          const report = language === 'en'
            ? reportText
            : `${buildReportGreeting(patientName, pharmacyDisplayName, language)} ${reportText}`;
          // ── استدعاء ثالث خفيف: ملخص الصيدلاني + تنبيه الأدوية (JSON) ──
          // فشله لا يمس نص المريض إطلاقاً — يُرجع null للحقلين فقط
          let pharmacistSummary: string | null = null;
          let medicationsAlert: string | null = null;
          try {
            const summaryResponse = await ai.models.generateContent({
              model: GEMINI_MODELS_FALLBACK[0],
              contents: userPrompt,
              config: {
                systemInstruction: PHARMACIST_SUMMARY_INSTRUCTION,
                maxOutputTokens: 1500,
              },
            });
            const summaryRaw = summaryResponse.text?.trim() || '';
            console.log('[Gemini] pharmacist summaryRaw length:', summaryRaw.length, '| first 100:', summaryRaw.slice(0, 100));
            const jsonMatch = summaryRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (typeof parsed.pharmacist_summary === 'string' && parsed.pharmacist_summary.trim()) {
                pharmacistSummary = parsed.pharmacist_summary.trim();
              }
              if (typeof parsed.medications_alert === 'string' && parsed.medications_alert.trim() && parsed.medications_alert !== 'null') {
                medicationsAlert = parsed.medications_alert.trim();
              }
            }
          } catch (summaryErr) {
            console.warn('[Gemini] pharmacist summary failed (non-blocking):', summaryErr);
          }
          return NextResponse.json({ report, pharmacistSummary, medicationsAlert });
        }
        throw lastModelErr || new Error('no model returned a response');
      } catch (aiErr) {
        console.warn('[Gemini] all models failed, using local fallback:', aiErr);
      }
    }

    // المسار الاحتياطي عربي بالكامل حالياً — ترجمة جمله السريرية بند مستقل،
    // وحتى ذلك الحين تبقى تحيته عربية ليتناسق مع جسمه بدل خليط لغتين
    const fallbackReport = buildAdaptiveFallbackReport(
      currentVisit, bmi, patientName, pharmacyDisplayName,
      lastVisit, recentVisits, diagnosedConditions, 'ar'
    );
    return NextResponse.json({ report: fallbackReport, pharmacistSummary: null, medicationsAlert: null });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'خطأ في السيرفر' }, { status: 500 });
  }
}

function buildAdaptiveFallbackReport(
  visit: any, bmi: string | null, patientName: string,
  pharmacyDisplayName: string, lastVisit: any,
  recentVisits: any[], diagnosedConditions: string[], language: 'ar' | 'en'
) {
  const sys = visit?.bp_systolic;
  const dia = visit?.bp_diastolic;
  const sug = visit?.sugar_value;
  const symptoms: string[] = visit?.symptoms || [];
  const hasBpDiagnosis = diagnosedConditions.includes('hypertension');
  const hasDiabetesDiagnosis = diagnosedConditions.includes('diabetes');

  const isBpAbnormal = (s: number, d: number) => s >= 140 || d >= 90 || s < 90 || d < 60;
  const isSugarAbnormal = (v: number) => v >= 180 || v < 70;

  const parts: string[] = [];

  if (sys && dia) {
    if (sys >= 180 || dia >= 120 || sys < 90 || dia < 60) {
      parts.push(`ضغط الدم (${sys}/${dia}) خارج النطاق الطبيعي بشكل واضح، يُفضّل مراجعة الطبيب فوراً.`);
    } else if (sys >= 140 || dia >= 90) {
      parts.push(hasBpDiagnosis
        ? `ضغط الدم (${sys}/${dia}) أعلى من المستهدف رغم العلاج، يُنصح بمراجعة الطبيب لتقييم خطة العلاج.`
        : `ضغط الدم (${sys}/${dia}) أعلى من الطبيعي، يُنصح بالمتابعة مع الطبيب.`);
    } else {
      parts.push(hasBpDiagnosis
        ? `ضغط الدم (${sys}/${dia}) ضمن النطاق المستهدف — استجابة جيدة للعلاج.`
        : `ضغط الدم (${sys}/${dia}) ضمن الطبيعي.`);
    }

    const bpRecurring = isBpAbnormal(sys, dia)
      && recentVisits.some((v) => v.bp_systolic && isBpAbnormal(v.bp_systolic, v.bp_diastolic));
    if (bpRecurring) {
      parts.push(hasBpDiagnosis
        ? 'النمط متكرر عبر أكثر من زيارة، يُفضّل تقييم الجرعة الحالية.'
        : 'النمط متكرر عبر أكثر من زيارة، يُفضّل عدم التأجيل.');
    } else if (lastVisit?.bp_systolic && Math.abs(sys - lastVisit.bp_systolic) >= 5) {
      parts.push(sys > lastVisit.bp_systolic ? 'أعلى من الزيارة السابقة.' : 'أقل من الزيارة السابقة.');
    }
  }

  if (sug) {
    if (sug < 70) {
      parts.push(`سكري الدم (${sug}) منخفض، يستوجب تناول سكر سريع الامتصاص فوراً.`);
    } else if (sug >= 300) {
      parts.push(`سكري الدم (${sug}) مرتفع جداً، يُفضّل مراجعة الطبيب فوراً.`);
    } else if (sug >= 180) {
      parts.push(hasDiabetesDiagnosis
        ? `سكري الدم (${sug}) أعلى من المستهدف، يُنصح بمراجعة الطبيب لتقييم ضبط السكر.`
        : `سكري الدم (${sug}) أعلى من الطبيعي، يُنصح بالمتابعة.`);
    } else {
      parts.push(hasDiabetesDiagnosis
        ? `سكري الدم (${sug}) ضمن النطاق المستهدف — ضبط جيد.`
        : `سكري الدم (${sug}) ضمن الطبيعي.`);
    }

    const sugarRecurring = isSugarAbnormal(sug)
      && recentVisits.some((v) => v.sugar_value && isSugarAbnormal(v.sugar_value));
    if (sugarRecurring) {
      parts.push(hasDiabetesDiagnosis
        ? 'النمط متكرر، يُفضّل مراجعة الطبيب لتعديل خطة العلاج.'
        : 'النمط متكرر، يُفضّل عدم التأجيل.');
    } else if (lastVisit?.sugar_value && Math.abs(sug - lastVisit.sugar_value) >= 15) {
      parts.push(sug > lastVisit.sugar_value ? 'أعلى من الزيارة السابقة.' : 'أقل من الزيارة السابقة.');
    }
  }

  if (symptoms.length > 0) {
    parts.push(`الأعراض المذكورة (${symptoms.join('، ')}) تستدعي المراقبة.`);
  }

  if (parts.length === 0) parts.push('تم توثيق الزيارة بنجاح ولا توجد قراءات خارج الطبيعي.');
  if (bmi) parts.push(`BMI: ${bmi}.`);

  const greeting = buildReportGreeting(patientName, pharmacyDisplayName, language);
  return `${greeting} ${parts.join(' ')}`;
}
