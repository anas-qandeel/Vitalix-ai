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
const SYSTEM_INSTRUCTION = `أنت صيدلاني ذكي في منصة Vitalix.ai. مهمتك كتابة تقرير تحليلي سريري دقيق لقراءات مريض — بأسلوب مهني ودافئ وواثق.

ابدأ مباشرة بالتحليل دون ترحيب أو اسم مريض أو اسم صيدلية.

قواعد صارمة:
1. فقرة واحدة متصلة مكتملة. بلا عناوين أو Markdown أو قوائم أو ترقيم. أقصر من 5 جمل.
2. لا تُسمِّ أي مرض جديد. اوصف القراءات فقط (أعلى/أقل/ضمن الطبيعي).
3. معدل النبض: إذا أُعطي اذكره صراحةً مع الضغط في نفس الجملة — نبض 95 مع ضغط 150/90 يختلف عن نبض 60 مع نفس الضغط. لا تتجاهله أبداً إذا وُجد. إذا لم يُعطَ فتجاهله.
4. إذا فُحص الضغط والسكري معاً: ادمجهما في صورة سريرية واحدة متكاملة — استنتج حالة المريض الكلية بدلاً من ذكرهما منفصلَين.
5. الأعراض المذكورة: ادمجها مع القراءات في السياق — لا تذكرها كقائمة بل اجعلها جزءاً من الاستنتاج.
6. العوامل المؤثرة (قهوة/مجهود/وجبة/توتر): اذكرها كتفسير محتمل واقترح إعادة القياس في ظروف أهدأ. إذا لم تُذكر فتجاهلها.
7. الحالة السريرية والدواء:
   - مشخّص + أخذ دواءه + قراءة مرتفعة: الارتفاع رغم الدواء مؤشر يستوجب مراجعة الجرعة.
   - مشخّص + لم يؤكد الدواء: اكتفِ بوصف القراءة.
   - غير مشخّص: اكتفِ بوصف القراءة.
8. آخر الزيارات: إذا تكرر النمط في زيارتين أو أكثر أشر إليه صراحةً.
9. اختم بتوصية واضحة (مراجعة الطبيب / إعادة القياس / الطمأنينة) بحسب الحالة.`;

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
    const { patient, currentVisit, history, pharmacyName } = body;

    const patientName = patient?.name?.trim() || 'عزيزنا المريض';
    const pharmacyDisplayName = pharmacyName || 'صيدليتك';
    const diagnosedConditions: string[] = patient?.diagnosed_conditions || [];

    // بناء وصف الحالة السريرية
    const tookMedication = currentVisit?.took_medication === true;
    const conditionLines: string[] = [];
    if (diagnosedConditions.includes('hypertension')) {
      conditionLines.push(
        tookMedication
          ? 'مشخّص بارتفاع الضغط وأكّد الصيدلاني أنه أخذ دواءه اليوم'
          : 'مشخّص بارتفاع الضغط — لم يُأكَّد أخذ الدواء اليوم'
      );
    }
    if (diagnosedConditions.includes('diabetes')) {
      conditionLines.push(
        tookMedication
          ? 'مشخّص بالسكري وأكّد الصيدلاني أنه أخذ دواءه اليوم'
          : 'مشخّص بالسكري — لم يُأكَّد أخذ الدواء اليوم'
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

    // آخر 3 زيارات للمقارنة
    const recentVisits: any[] = Array.isArray(history) ? history.slice(0, 3) : [];
    const lastVisit = recentVisits.length > 0 ? recentVisits[0] : null;

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        // بناء ملخص الزيارات السابقة
        let recentVisitsLine = 'لا توجد زيارات سابقة للمقارنة';
        if (recentVisits.length > 0) {
          const labels = ['آخر زيارة', 'قبل الأخيرة', 'قبل ذلك'];
          const summaries = recentVisits
            .map((v: any, idx: number) => {
              const bp = v.bp_systolic ? `ضغط ${v.bp_systolic}/${v.bp_diastolic}` : '';
              const hr = v.heart_rate ? `نبض ${v.heart_rate}` : '';
              const sg = v.sugar_value ? `سكري ${v.sugar_value}` : '';
              const combined = [bp, hr, sg].filter(Boolean).join(' - ');
              return combined ? `${labels[idx] || 'أقدم'}: ${combined}` : null;
            })
            .filter(Boolean) as string[];
          if (summaries.length > 0) recentVisitsLine = `آخر الزيارات: ${summaries.join(' | ')}`;
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

        const userPrompt = `الجنس: ${genderLine} - العمر: ${patientAge}
${clinicalStatusLine}
ضغط الدم: ${bpLine}
معدل النبض: ${heartRateLine}
سكري الدم: ${sugarLine}
الوزن: ${weightLine}${bmiLine}
الأعراض: ${symptomsLine}
${contextLine}
${recentVisitsLine}`;

        // نُجرّب النماذج بالترتيب — 429 يعني مشكلة quota، نذهب للـ fallback فوراً
        let reportText: string | null = null;
        let lastModelErr: any = null;

        for (const modelName of GEMINI_MODELS_FALLBACK) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: userPrompt,
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                maxOutputTokens: 1200,
              },
            });
            const txt = response.text;
            if (txt && txt.trim()) {
              // تنظيف أي مخلفات thinking — بدون /s flag لتوافق TypeScript
              // إزالة أي ترقيم أو markdown أو أسطر مرقمة
              const cleaned = txt.trim()
                .replace(/^\d+\.\s*/gm, '')
                .replace(/\*[^*]*\*/g, '')
                .replace(/\[[^\]]*\]/g, '')
                .replace(/^[\s\/\-\*#]+/gm, '')
                .replace(/\n+/g, ' ')
                .trim();
              reportText = cleaned || txt.trim();
              console.log(`[Gemini] ✅ success: ${modelName}`);
            }
            break;
          } catch (modelErr: any) {
            lastModelErr = modelErr;
            const status = getErrStatus(modelErr);
            console.warn(`[Gemini] ${modelName} → ${status || 'err'}:`, modelErr?.message || modelErr);
            if (status === 404) continue; // النموذج غير متاح — جرّب التالي
            break; // 429 أو أي خطأ آخر — اذهب للـ fallback فوراً
          }
        }

        if (reportText) {
          const greeting = `مرحباً ${patientName}، من فريق ${pharmacyDisplayName} 👋`;
          return NextResponse.json({ report: `${greeting} ${reportText}` });
        }
        throw lastModelErr || new Error('no model returned a response');
      } catch (aiErr) {
        console.warn('[Gemini] all models failed, using local fallback:', aiErr);
      }
    }

    const fallbackReport = buildAdaptiveFallbackReport(
      currentVisit, bmi, patientName, pharmacyDisplayName,
      lastVisit, recentVisits, diagnosedConditions
    );
    return NextResponse.json({ report: fallbackReport });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'خطأ في السيرفر' }, { status: 500 });
  }
}

function buildAdaptiveFallbackReport(
  visit: any, bmi: string | null, patientName: string,
  pharmacyDisplayName: string, lastVisit: any,
  recentVisits: any[], diagnosedConditions: string[]
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

  const greeting = `مرحباً ${patientName}، من فريق ${pharmacyDisplayName} 👋`;
  return `${greeting} ${parts.join(' ')}`;
}
