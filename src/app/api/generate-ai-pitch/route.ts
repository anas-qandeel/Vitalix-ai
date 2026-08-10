import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// قائمة نماذج مرتبة — يُجرَّب الأول فإن أعطى 404 ينتقل للتالي
const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];

// ملاحظة مهمة: الاسم والصيدلية لا يُطلب من Gemini كتابتهما إطلاقاً (انظر التعليمات أدناه) —
// نبنيهما بالكود مباشرة لضمان دقة 100%، فلا يخترع النموذج قيمة بديلة إن كانت البيانات غامضة
const SYSTEM_INSTRUCTION = `أنت الصيدلي الافتراضي الذكي لمنصة Vitalix.ai. تكتب فقرة تحليل سريري قصيرة وذكية لقراءات مريض بعد كل فحص، بصوت واثق ودافئ ومهني، أقرب لملاحظة يكتبها صيدلي متمرّس يتابع مريضه شخصياً — وليس نصاً آلياً جافاً.

مهم جداً جداً: لا تكتب أي ترحيب أو تحية أو اسم مريض أو اسم صيدلية إطلاقاً — هذه الأجزاء تُضاف تلقائياً بكود ثابت قبل نصك مباشرة لضمان دقتها التامة. ابدأ نصك مباشرة بجملة التحليل السريري نفسها، بلا أي مقدمة.

قواعد إلزامية لا يجوز خرقها إطلاقاً:
1. الطول: فقرة نصية واحدة متصلة، لا تتجاوز 100 كلمة، تُقرأ خلال 30-40 ثانية. بلا عناوين وبلا رموز Markdown وبلا أي ترحيب أو أسماء.
2. ممنوع نهائياً أي تشخيص مرضي أو تسمية مرض (مثل: سكري، ضغط دم، أزمة قلبية). صِف القراءة فقط بأنها "أعلى من الطبيعي" أو "أقل من الطبيعي" أو "ضمن الطبيعي".
3. راجع كل الزيارات السابقة المُعطاة لك (قد تصل لثلاث)، لا آخر زيارة فقط. إذا وُجد نمط متكرر (نفس الانحراف بأكثر من زيارة) اذكره بوضوح لأنه أهم من تغيّر عابر بزيارة واحدة. إذا وُجد تغيّر عن آخر زيارة فقط دون نمط أوسع، اذكره بإيجاز. إن لم يوجد أي تغيّر يستحق الذكر، تجاهل المقارنة كلياً.
4. عند وجود قراءة غير طبيعية، أضف نصيحة قصيرة بمراجعة الطبيب — واجعل النصيحة أكثر تشجيعاً على المراجعة القريبة إن كان الانحراف متكرراً بعدة زيارات، دون تخويف أو تشخيص.
5. إذا كانت كل القراءات ضمن الطبيعي، اجعل الرد تطمينياً وواثقاً.

مثال يوضح الأسلوب والطول المطلوبين فقط (لا تنسخه، القراءات دائماً من بيانات المريض الفعلية، ولاحظ عدم وجود أي ترحيب بالبداية):
"ضغط دمك اليوم (128/82) ضمن الطبيعي، وهو تحسّن ملحوظ عن آخر زيارتين متتاليتين كان فيهما مرتفعاً قليلاً. استمر على نفس الروتين، وراجع طبيبك المختص إذا شعرت بأي أعراض غير معتادة."`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { patient, currentVisit, history, pharmacyName } = body;

    const patientName = patient?.name?.trim() || 'عزيزنا المريض';
    const pharmacyDisplayName = pharmacyName || 'صيدليتك';

    // حساب العمر
    let patientAge = 'غير محدد';
    if (patient?.birth_date) {
      const birthYear = new Date(patient.birth_date).getFullYear();
      const currentYear = new Date().getFullYear();
      const age = currentYear - birthYear;
      if (!isNaN(age) && age >= 0) {
        patientAge = `${age} سنة`;
      }
    }

    // حساب BMI
    const hMeters = patient?.height ? Number(patient.height) / 100 : null;
    const bmi = (hMeters && hMeters > 0 && currentVisit?.weight)
      ? (Number(currentVisit.weight) / (hMeters * hMeters)).toFixed(1)
      : null;

    // آخر 3 زيارات سابقة كحد أقصى (لا الأرشيف كاملاً) — تُستخدم بمسار Gemini وبالاحتياطي المحلي معاً،
    // لرصد نمط متكرر عبر أكثر من زيارة، لا مجرد مقارنة سطحية بآخر زيارة وحيدة
    const recentVisits: any[] = Array.isArray(history) ? history.slice(0, 3) : [];
    const lastVisit = recentVisits.length > 0 ? recentVisits[0] : null;

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        let recentVisitsLine = 'لا توجد زيارات سابقة للمقارنة';
        if (recentVisits.length > 0) {
          const labels = ['آخر زيارة', 'قبل الأخيرة', 'قبل ذلك'];
          const visitSummaries = recentVisits
            .map((v: any, idx: number) => {
              const bpPart = v.bp_systolic ? `ضغط ${v.bp_systolic}/${v.bp_diastolic}` : '';
              const sugarPart = v.sugar_value ? `سكري ${v.sugar_value}` : '';
              const combined = [bpPart, sugarPart].filter(Boolean).join(' - ');
              return combined ? `${labels[idx] || 'أقدم'}: ${combined}` : null;
            })
            .filter(Boolean) as string[];
          if (visitSummaries.length > 0) {
            recentVisitsLine = `آخر الزيارات: ${visitSummaries.join(' | ')}`;
          }
        }

        const bpLine = currentVisit?.bp_systolic && currentVisit?.bp_diastolic
          ? `${currentVisit.bp_systolic}/${currentVisit.bp_diastolic} mmHg`
          : 'لم يُقس';

        const sugarTypeAr = currentVisit?.sugar_test_type === 'fasting'
          ? 'صائم'
          : currentVisit?.sugar_test_type === 'postprandial'
            ? 'بعد الأكل'
            : 'عشوائي';

        const sugarLine = currentVisit?.sugar_value
          ? `${currentVisit.sugar_value} mg/dL (${sugarTypeAr})`
          : 'لم يُقس';

        const weightLine = currentVisit?.weight ? `${currentVisit.weight} kg` : 'لم يُقس';
        const bmiLine = bmi ? ` - BMI: ${bmi}` : '';

        const symptomsLine = currentVisit?.symptoms?.length
          ? currentVisit.symptoms.join('، ')
          : 'لا يوجد';

        const genderLine = patient?.gender === 'female' ? 'أنثى' : 'ذكر';

        // ملاحظة: لا نُرسل اسم المريض أو اسم الصيدلية ضمن هذا البرومبت إطلاقاً — النموذج لا يحتاجهما
        // بما أنه ممنوع من كتابة أي ترحيب، وهذا يزيل تماماً احتمال اختراعه لاسم بديل
        const userPrompt = `الجنس: ${genderLine} - العمر: ${patientAge}
ضغط الدم: ${bpLine}
سكري الدم: ${sugarLine}
الوزن: ${weightLine}${bmiLine}
الأعراض: ${symptomsLine}
${recentVisitsLine}`;

        const getErrStatus = (e: any): number => {
          if (typeof e?.status === 'number') return e.status;
          const m = String(e?.message || e || '');
          const match = m.match(/\b(4\d\d|5\d\d)\b/);
          return match ? parseInt(match[1], 10) : 0;
        };
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

        let reportText: string | null = null;
        let lastModelErr: any = null;

        for (const modelName of GEMINI_MODELS_FALLBACK) {
          let attempts = 0;
          while (attempts < 2) {
            attempts++;
            try {
              const response = await ai.models.generateContent({
                model: modelName,
                contents: userPrompt,
                config: {
                  systemInstruction: SYSTEM_INSTRUCTION,
                  maxOutputTokens: 350,
                },
              });
              const txt = response.text;
              if (txt && txt.trim()) {
                reportText = txt.trim();
                console.log(`[Gemini] success: ${modelName} (attempt ${attempts})`);
              }
              break;
            } catch (modelErr: any) {
              lastModelErr = modelErr;
              const status = getErrStatus(modelErr);
              console.warn(`[Gemini] ${modelName} attempt ${attempts} → ${status || 'err'}:`, modelErr?.message || modelErr);
              if (status === 429 && attempts === 1) {
                console.log('[Gemini] 429 rate limit, retrying after 1s...');
                await sleep(1000);
                continue;
              }
              if (status === 404) { break; }
              break;
            }
          }
          if (reportText) break;
        }

        if (reportText) {
          const greeting = `مرحباً ${patientName}، من فريق ${pharmacyDisplayName} 👋`;
          return NextResponse.json({ report: `${greeting} ${reportText}` });
        }
        throw lastModelErr || new Error('no model returned a response');
      } catch (aiErr) {
        console.warn('Gemini error, falling back to local engine:', aiErr);
      }
    }

    const fallbackReport = buildAdaptiveFallbackReport(
      currentVisit,
      bmi,
      patientName,
      pharmacyDisplayName,
      lastVisit,
      recentVisits
    );
    return NextResponse.json({ report: fallbackReport });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'حدث خطأ في السيرفر' }, { status: 500 });
  }
}

// تقرير احتياطي محلي قصير وخالٍ من أي تشخيص — يعمل فقط إذا تعذّر الاتصال بـ Gemini
// (مفتاح غير مُعرَّف، أو خطأ شبكة، أو استجابة فارغة)، لضمان عدم توقف الميزة كلياً.
// شخصي (اسم المريض + الصيدلية) ويكتشف نمطاً متكرراً عبر آخر 3 زيارات، لا مجرد مقارنة بزيارة وحيدة
function buildAdaptiveFallbackReport(
  visit: any,
  bmi: string | null,
  patientName: string,
  pharmacyDisplayName: string,
  lastVisit: any,
  recentVisits: any[]
) {
  const sys = visit?.bp_systolic;
  const dia = visit?.bp_diastolic;
  const sug = visit?.sugar_value;
  const symptoms: string[] = visit?.symptoms || [];

  const isBpAbnormal = (s: number, d: number) => s >= 140 || d >= 90 || s < 90 || d < 60;
  const isSugarAbnormal = (v: number) => v >= 180 || v < 70;

  const parts: string[] = [];

  if (sys && dia) {
    if (sys >= 180 || dia >= 120 || sys < 90 || dia < 60) {
      parts.push(`ضغط الدم (${sys}/${dia}) خارج النطاق الطبيعي، يُفضّل مراجعة الطبيب إن استمر.`);
    } else if (sys >= 140 || dia >= 90) {
      parts.push(`ضغط الدم (${sys}/${dia}) أعلى قليلاً من الطبيعي، يُنصح بالمتابعة.`);
    } else {
      parts.push(`ضغط الدم (${sys}/${dia}) ضمن الطبيعي.`);
    }

    const bpRecurring = isBpAbnormal(sys, dia)
      && recentVisits.some((v) => v.bp_systolic && v.bp_diastolic && isBpAbnormal(v.bp_systolic, v.bp_diastolic));
    if (bpRecurring) {
      parts.push('هذا النمط تكرر بأكثر من زيارة سابقة، يُفضّل عدم التأجيل.');
    } else if (lastVisit?.bp_systolic && Math.abs(sys - lastVisit.bp_systolic) >= 5) {
      parts.push(sys > lastVisit.bp_systolic ? 'أعلى من الزيارة السابقة.' : 'أقل من الزيارة السابقة.');
    }
  }

  if (sug) {
    if (sug < 70 || sug >= 300) {
      parts.push(`سكري الدم (${sug}) خارج النطاق الطبيعي، يُفضّل مراجعة الطبيب إن استمر.`);
    } else if (sug >= 180) {
      parts.push(`سكري الدم (${sug}) أعلى قليلاً من الطبيعي.`);
    } else {
      parts.push(`سكري الدم (${sug}) ضمن الطبيعي.`);
    }

    const sugarRecurring = isSugarAbnormal(sug)
      && recentVisits.some((v) => v.sugar_value && isSugarAbnormal(v.sugar_value));
    if (sugarRecurring) {
      parts.push('هذا النمط تكرر بأكثر من زيارة سابقة، يُفضّل عدم التأجيل.');
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
