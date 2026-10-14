// استدعاء Gemini لتوليد نصوص تسويقية قصيرة لمنتجات الخطة. لا يرمي استثناءً أبداً: أي فشل أو انتهاء مهلة
// يعني خريطة فارغة، أي لا نص تسويقي — وما يعود يمرّ دائماً عبر validateMarketingText داخل parseMarketingResponse.
import { GoogleGenAI, Type } from '@google/genai';
import {
  buildMarketingPrompt,
  parseMarketingResponse,
  type MarketingFacts,
  type MarketingPatient,
} from '@/lib/product-marketing';

const MARKETING_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: { id: { type: Type.STRING }, text: { type: Type.STRING } },
    required: ['id', 'text'],
  },
};

export async function generateMarketingTexts(args: {
  apiKey: string;
  models: readonly string[];
  items: { id: string; facts: MarketingFacts }[];
  patient: MarketingPatient;
  allergens: string[];
  onUsage?: (model: string, response: unknown, outcome: 'used' | 'discarded' | 'failed') => void | Promise<void>;
  timeoutMs?: number; // الافتراضي 15000
}): Promise<Map<string, string>> {
  const { apiKey, models, items, patient, allergens, onUsage, timeoutMs = 15000 } = args;
  if (items.length === 0) return new Map();

  // فشل تسجيل الاستهلاك لا يعطّل شيئاً
  const report = async (model: string, response: unknown, outcome: 'used' | 'discarded' | 'failed') => {
    try { await onUsage?.(model, response, outcome); } catch { /* يُبتلع */ }
  };

  let expired = false;
  const work = (async (): Promise<Map<string, string>> => {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = buildMarketingPrompt(items, patient);
      for (const model of models) {
        if (expired) break;
        try {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { maxOutputTokens: 1500, responseMimeType: 'application/json', responseSchema: MARKETING_SCHEMA },
          });
          const texts = parseMarketingResponse(response.text, items, { allergens });
          if (texts.size > 0) { await report(model, response, 'used'); return texts; }
          await report(model, response, 'discarded');
        } catch {
          await report(model, null, 'failed');
        }
      }
    } catch { /* لا استثناء من هذه الدالة أبداً */ }
    return new Map<string, string>();
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Map<string, string>>(resolve => {
    timer = setTimeout(() => { expired = true; resolve(new Map()); }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } catch {
    return new Map();
  } finally {
    if (timer) clearTimeout(timer);
  }
}
