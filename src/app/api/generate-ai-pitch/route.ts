import { NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// قائمة نماذج مرتبة — يُجرَّب الأول فإن أعطى 404 ينتقل للتالي
const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];

const CATEGORY_LABELS: Record<string, string> = {
  sugar_device: 'جهاز فحص السكري',
  sugar_strips: 'شرائح السكري',
  bp_device: 'جهاز قياس الضغط',
  weight_loss_med: 'منتج لإدارة الوزن',
};

// نص تسويقي قصير يُعرض للمريض عبر واتساب كتوصية من صيدليته — وليس تقريراً طبياً،
// لذا يُمنع أي وعد علاجي، ويُشجَّع على الشراء بأسلوب ودود لا إلحاح فيه
const SYSTEM_INSTRUCTION = `أنت خبير تسويق لمنصة Vitalix.ai، تكتب وصفاً تسويقياً قصيراً لمنتج أو جهاز طبي معروض في كتالوج صيدلية. هذا النص يُعرض لاحقاً على مريض عبر واتساب كتوصية شخصية من صيدليته، وهدفه تشجيعه على الشراء دون مبالغة أو إلحاح.

مهم جداً: إن أُرفقت صورة المنتج، افحصها بعناية لتحديد الماركة/الموديل والميزات الظاهرة عليها فعلياً (الشاشة، الشكل، الملحقات...) بدل التخمين العام. استخدم بحث جوجل إن احتجت للتأكد من مواصفات حقيقية لهذا المنتج بدل اختلاقها.

قواعد إلزامية:
1. فقرة نثرية واحدة متصلة، من 40 إلى 70 كلمة تقريباً، بلا عناوين ولا Markdown ولا رموز ترقيم.
2. اذكر ميزة عملية حقيقية للمنتج (دقة القياس، سهولة الاستخدام، موثوقية الماركة، الراحة اليومية...) بدل وصف عام فارغ من المحتوى.
3. ممنوع نهائياً أي وعد علاجي أو طبي غير دقيق (مثل "يُعالج" أو "يشفي") — هذا جهاز أو منتج مساعد فقط، لا بديل عن استشارة الطبيب.
4. اختم بجملة ودودة تشجّع على السؤال عن المنتج أو اقتنائه من الصيدلية.
5. لا تكتب اسم الصيدلية أو ترحيباً — النص يُدمج لاحقاً في سياق أوسع.`;

// إشعار fallback بسيط بلا AI — يعمل فقط إذا تعذّر الاتصال بـ Gemini، لضمان عدم توقف الميزة كلياً
function buildFallbackPitch(category: string, brandName: string): string {
  const label = CATEGORY_LABELS[category] || 'منتج';
  return `${brandName} — ${label} موثوق يساعدك على متابعة صحتك بسهولة ودقة في المنزل. اسأل صيدليتك عنه اليوم لتحصل على المنتج المناسب لاحتياجك.`;
}

async function fetchImageAsInlineData(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // حماية بسيطة من صور ضخمة تُثقل الطلب — 8MB أكثر من كافٍ لصورة منتج
    if (buf.byteLength > 8 * 1024 * 1024) return null;
    return { mimeType: contentType, data: buf.toString('base64') };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { category, brandName, imageUrl } = body;

    if (!brandName || !String(brandName).trim()) {
      return NextResponse.json({ error: 'اسم المنتج مطلوب' }, { status: 400 });
    }

    const categoryLabel = CATEGORY_LABELS[category] || 'منتج';
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });

        // صور منتجات "إدارة الوزن" غير مدعومة أصلاً في نموذج الكتالوج (لا حقل صورة لهذه الفئة)
        const inlineImage = imageUrl ? await fetchImageAsInlineData(imageUrl) : null;

        const userPrompt = `الفئة: ${categoryLabel}\nاسم المنتج/الماركة: ${brandName}${
          inlineImage ? '\n(صورة المنتج مرفقة — افحصها لتحديد الميزات الفعلية)' : ''
        }`;

        const parts: any[] = [{ text: userPrompt }];
        if (inlineImage) parts.push({ inlineData: inlineImage });

        const getErrStatus = (e: any): number => {
          if (typeof e?.status === 'number') return e.status;
          const m = String(e?.message || e || '');
          const match = m.match(/\b(4\d\d|5\d\d)\b/);
          return match ? parseInt(match[1], 10) : 0;
        };

        let pitchText: string | null = null;
        let lastModelErr: any = null;

        for (const modelName of GEMINI_MODELS_FALLBACK) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: parts,
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                // نماذج Gemini 3.x نماذج "تفكير" بميزانية تفكير تلقائية شبه غير محدودة؛
                // دمجها مع أداة googleSearch كان يستهلك معظم maxOutputTokens في التفكير/البحث
                // الداخلي قبل النص الظاهر، فيخرج النص قصيراً جداً بشكل غير ثابت مهما رفعنا
                // الحد — لذا نُقيّد عمق التفكير صراحة بدل الاعتماد على maxOutputTokens وحده
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                maxOutputTokens: 900,
                tools: [{ googleSearch: {} }],
              },
            });
            const txt = response.text?.trim();
            // نص أقصر من هذا فعلياً مقطوع (المطلوب فقرة من 40-70 كلمة، أي 150 حرفاً على الأقل) —
            // نرفضه ونجرّب النموذج التالي بدل عرض وصف مبتور للمريض
            if (txt && txt.length >= 150) { pitchText = txt; break; }
            if (txt) console.warn(`[Gemini pitch] ${modelName} → نص قصير جداً (${txt.length} حرفاً)، يُتجاهل`);
          } catch (modelErr: any) {
            lastModelErr = modelErr;
            const status = getErrStatus(modelErr);
            console.warn(`[Gemini pitch] ${modelName} → ${status || 'err'}:`, modelErr?.message || modelErr);
            if (status === 404) continue;
            break;
          }
        }

        if (pitchText) return NextResponse.json({ pitch: pitchText });
        throw lastModelErr || new Error('no model returned a response');
      } catch (aiErr) {
        console.warn('[Gemini pitch] all models failed, using local fallback:', aiErr);
      }
    }

    return NextResponse.json({ pitch: buildFallbackPitch(category, String(brandName).trim()) });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'حدث خطأ في السيرفر' }, { status: 500 });
  }
}
