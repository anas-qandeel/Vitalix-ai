import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { looksLikeMedicine } from '@/lib/medicine-blocklist';
import { ALLERGEN_TAGS, CONDITION_TAGS, type ClinicalProfile } from '@/lib/product-suitability';
import { PRODUCT_KINDS, PRODUCT_CATEGORIES, CATEGORIES_FOR_KIND, type ProductKind } from '@/lib/catalog-taxonomy';
import { applyPharmacistRules } from '@/lib/pharmacist-rules';

// ═══════════════════════════════════════════════════════════════════════
// POST /api/catalog/profile — يبني البطاقة السريرية لمنتج من اسمه (وصورة علبته إن وُجدت).
// الذكاء الاصطناعي يعمل هنا مرة واحدة عند الإدخال، والصيدلاني يؤكد في الشاشة.
// لا حفظ في هذا المسار. مبدأ المنصة: لا أدوية — حارس حتمي قبل النموذج وبعده.
// ═══════════════════════════════════════════════════════════════════════

const GEMINI_MODELS_FALLBACK = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
].filter(Boolean) as string[];


const SAFETY = ['safe', 'caution', 'avoid', 'unknown'];
const CONF   = ['high', 'medium', 'low'];
const confField = { type: Type.STRING, enum: CONF };

const PROFILE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_medicine:        { type: Type.BOOLEAN },
    medicine_reason:    { type: Type.STRING },
    suggested_kind:     { type: Type.STRING, enum: [...PRODUCT_KINDS] },
    suggested_category: { type: Type.STRING, enum: [...PRODUCT_CATEGORIES] },
    active_ingredients:      { type: Type.ARRAY, items: { type: Type.STRING } },
    allergen_tags:           { type: Type.ARRAY, items: { type: Type.STRING, enum: [...ALLERGEN_TAGS] } },
    pregnancy:               { type: Type.STRING, enum: SAFETY },
    lactation:               { type: Type.STRING, enum: SAFETY },
    min_age_years:           { type: Type.INTEGER, nullable: true },
    contains_sugar:          { type: Type.BOOLEAN, nullable: true },
    contains_sodium:         { type: Type.BOOLEAN, nullable: true },
    contains_caffeine:       { type: Type.BOOLEAN, nullable: true },
    avoid_with_conditions:   { type: Type.ARRAY, items: { type: Type.STRING, enum: [...CONDITION_TAGS] } },
    interacts_with_generics: { type: Type.ARRAY, items: { type: Type.STRING } },
    notes_for_pharmacist:    { type: Type.STRING },
    confidence: {
      type: Type.OBJECT,
      properties: {
        active_ingredients: confField, allergen_tags: confField, pregnancy: confField, lactation: confField,
        min_age_years: confField, contains_sugar: confField, contains_sodium: confField, contains_caffeine: confField,
        avoid_with_conditions: confField, interacts_with_generics: confField,
      },
    },
  },
  required: ['is_medicine', 'medicine_reason', 'suggested_kind', 'suggested_category', 'active_ingredients',
             'allergen_tags', 'pregnancy', 'lactation', 'avoid_with_conditions', 'interacts_with_generics',
             'notes_for_pharmacist', 'confidence'],
};

const SYSTEM_INSTRUCTION = `أنت صيدلاني سريري في منصة Vitalix.ai. ستُعطى اسم منتج معروض في صيدلية (وربما صورة علبته وفئته المقترحة). مهمتك بناء بطاقته السريرية بدقة وحذر، ولا تخترع معلومة: إن لم تكن متأكداً من حقل فاجعله unknown أو فارغاً وثقته low.
أولاً: قرر هل هذا مستحضر صيدلاني (يحوي مادة دوائية فعالة، بوصفة أو بلا وصفة). إن نعم فاجعل is_medicine = true مع السبب في medicine_reason واملأ بقية الحقول بأقل جهد. المنصة لا تعرض أدوية ولا تقترح علاجاً.
ثانياً: من العلبة أولاً (اقرأ المكونات والتحذيرات المطبوعة إن وُجدت صورة) ثم من معرفتك بالمنتج: المكونات الفعالة بالإنجليزية، المسببات من القائمة المغلقة فقط (إن كان المنتج كبسولات جيلاتينية فأدرج gelatin ما لم تكن نباتية)، أمان الحمل والرضاعة (safe فقط عند دليل واضح؛ avoid إن كانت إرشادات جهة رسمية مثل NHS أو ACOG أو FDA توصي بالتجنّب؛ وإلا caution أو unknown)، أقل عمر مناسب، احتواء السكر والصوديوم والكافيين، ما إن كان غير مناسب لمرضى الضغط أو السكري، والأسماء العلمية للأدوية التي يتداخل معها.
ثالثاً: اقترح نوع المنتج (suggested_kind) وفئته (suggested_category) من القائمتين المغلقتين — الغذاء الطبي يُصنَّف بالحاجة التي يلبيها (تغذية السكري = blood_sugar_support، تغذية عالية البروتين = protein)؛ استخدم uncategorized فقط بعد استبعاد كل الفئات — وملاحظة واحدة للصيدلاني بالعربية لا تتجاوز 20 كلمة.
قواعد: لا تسمِّ المنتج علاجاً لأي حالة؛ لا تُدرج مسبباً أو تداخلاً بلا أساس؛ درجة الثقة لكل حقل صادقة.`;

async function verifyOwnerOrPharmacist(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false as const, error: 'مطلوب توثيق', status: 401 };
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { ok: false as const, error: 'رمز التوثيق غير صالح', status: 401 };
  const meta = (user.app_metadata || {}) as Record<string, unknown>;
  const pharmacyId = meta.pharmacy_id as string | undefined;
  const role = meta.role as string | undefined;
  if (!pharmacyId) return { ok: false as const, error: 'الحساب غير مرتبط بصيدلية', status: 403 };
  if (role !== 'owner' && role !== 'pharmacist') return { ok: false as const, error: 'هذه العملية للمالك أو الصيدلاني فقط', status: 403 };
  return { ok: true as const, userId: user.id, pharmacyId };
}

async function fetchImageAsInlineData(imageUrl: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 8 * 1024 * 1024) return null;
    return { mimeType: contentType, data: buf.toString('base64') };
  } catch { return null; }
}

function getErrStatus(e: unknown): number {
  const err = e as { status?: unknown; message?: unknown } | null;
  if (typeof err?.status === 'number') return err.status;
  const m = String(err?.message || e || '');
  const match = m.match(/\b(4\d\d|5\d\d)\b/);
  return match ? parseInt(match[1], 10) : 0;
}

async function logRejection(args: {
  pharmacyId: string; userId: string; brandName: string; ingredients: string[];
  reason: string; source: 'blocklist' | 'ai' | 'both'; matched: string[]; imageUrl: string | null;
}) {
  try {
    await supabaseAdmin.from('catalog_rejections').insert({
      pharmacy_id: args.pharmacyId, user_id: args.userId, brand_name: args.brandName,
      ingredients: args.ingredients, reason: args.reason, source: args.source,
      matched_terms: args.matched, image_url: args.imageUrl,
    });
  } catch (e) { console.warn('[catalog/profile] rejection log failed:', e); }
}

export async function POST(req: NextRequest) {
  const auth = await verifyOwnerOrPharmacist(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const brandName = String(body?.brand_name ?? '').trim();
    const imageUrl: string | null = typeof body?.image_url === 'string' && body.image_url ? body.image_url : null;
    const hintCategory: string | null = typeof body?.category === 'string' ? body.category : null;
    if (!brandName) return NextResponse.json({ error: 'اسم المنتج مطلوب' }, { status: 400 });

    // ── الحارس الحتمي (1): على الاسم قبل أي استدعاء ──
    const pre = await looksLikeMedicine(brandName);
    if (pre.blocked) {
      const reason = `مطابقة لمادة أو اسم دوائي: ${pre.matched.join('، ')}`;
      await logRejection({ pharmacyId: auth.pharmacyId, userId: auth.userId, brandName, ingredients: [], reason, source: 'blocklist', matched: pre.matched, imageUrl });
      return NextResponse.json({ rejected: true, reason: 'هذا مستحضر دوائي — Vitalix لا يعرض أدوية ولا يقترح علاجاً', detail: reason });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) return NextResponse.json({ error: 'خدمة الذكاء الاصطناعي غير مهيأة' }, { status: 503 });

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    const inlineImage = imageUrl ? await fetchImageAsInlineData(imageUrl) : null;
    const userPrompt = `اسم المنتج: ${brandName}${hintCategory ? `\nالفئة كما اختارها الصيدلاني: ${hintCategory}` : ''}${inlineImage ? '\n(صورة العلبة مرفقة — اقرأ المكونات والتحذيرات منها أولاً)' : '\n(لا صورة — اعتمد على معرفتك بالمنتج واخفض الثقة عند الشك)'}`;
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: userPrompt }];
    if (inlineImage) parts.push({ inlineData: inlineImage });

    let parsed: Record<string, unknown> | null = null;
    let lastErr: unknown = null;
    for (const modelName of GEMINI_MODELS_FALLBACK) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: parts,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: PROFILE_RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            maxOutputTokens: 2000,
          },
        });
        const txt = response.text?.trim();
        if (!txt) continue;
        parsed = JSON.parse(txt);
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[catalog/profile] ${modelName} → ${getErrStatus(e) || 'err'}:`, (e as Error)?.message || e);
        if (getErrStatus(e) === 404) continue;
        break;
      }
    }
    if (!parsed) {
      console.error('[catalog/profile] all models failed:', lastErr);
      return NextResponse.json({ error: 'تعذّر بناء البطاقة السريرية الآن — أعد المحاولة' }, { status: 502 });
    }

    // ── تنظيف حتمي للقوائم المغلقة (لا نثق بالنموذج حتى مع المخطط) ──
    const strList = (v: unknown): string[] => Array.isArray(v) ? v.map(String).filter(Boolean) : [];
    const safety  = (v: unknown): ClinicalProfile['pregnancy'] => (typeof v === 'string' && SAFETY.includes(v) ? v : 'unknown') as ClinicalProfile['pregnancy'];
    const bool    = (v: unknown): boolean | null => typeof v === 'boolean' ? v : null;
    const ingredients = strList(parsed.active_ingredients);
    const profile: ClinicalProfile = {
      active_ingredients: ingredients,
      allergen_tags: strList(parsed.allergen_tags).filter((t): t is ClinicalProfile['allergen_tags'] extends (infer U)[] | undefined ? U : never => (ALLERGEN_TAGS as readonly string[]).includes(t)),
      pregnancy: safety(parsed.pregnancy),
      lactation: safety(parsed.lactation),
      min_age_years: typeof parsed.min_age_years === 'number' && Number.isFinite(parsed.min_age_years) ? parsed.min_age_years : null,
      contains_sugar: bool(parsed.contains_sugar),
      contains_sodium: bool(parsed.contains_sodium),
      contains_caffeine: bool(parsed.contains_caffeine),
      avoid_with_conditions: strList(parsed.avoid_with_conditions).filter((t): t is ClinicalProfile['avoid_with_conditions'] extends (infer U)[] | undefined ? U : never => (CONDITION_TAGS as readonly string[]).includes(t)),
      interacts_with_generics: strList(parsed.interacts_with_generics),
      notes_for_pharmacist: typeof parsed.notes_for_pharmacist === 'string' ? parsed.notes_for_pharmacist.slice(0, 200) : null,
      confidence: typeof parsed.confidence === 'object' && parsed.confidence ? (parsed.confidence as ClinicalProfile['confidence']) : {},
    };

    // ── الحارس الحتمي (2): على المكونات المستخرجة + حكم النموذج ──
    const post = await looksLikeMedicine(brandName, ingredients);
    const aiSaysMedicine = parsed.is_medicine === true;
    if (post.blocked || aiSaysMedicine) {
      const source: 'blocklist' | 'ai' | 'both' = post.blocked && aiSaysMedicine ? 'both' : post.blocked ? 'blocklist' : 'ai';
      const reason = post.blocked ? `مطابقة لمادة أو اسم دوائي: ${post.matched.join('، ')}` : String(parsed.medicine_reason || 'حكم النموذج: مستحضر دوائي');
      await logRejection({ pharmacyId: auth.pharmacyId, userId: auth.userId, brandName, ingredients, reason, source, matched: post.matched, imageUrl });
      return NextResponse.json({ rejected: true, reason: 'هذا مستحضر دوائي — Vitalix لا يعرض أدوية ولا يقترح علاجاً', detail: reason });
    }

    // ── القواعد الصيدلانية الحتمية (3): بعد الحارس وقبل العرض — تشديد فقط، لا تخفيف ──
    const { profile: enforcedProfile, applied: appliedRules } = applyPharmacistRules(profile, brandName);

    // الفئة المقترحة يجب أن تكون ضمن فئات النوع المقترح تحديداً — لا من القائمة الكبرى (مثلاً "كالسيوم" لجهاز)
    const suggestedKind = (PRODUCT_KINDS as readonly string[]).includes(String(parsed.suggested_kind)) ? String(parsed.suggested_kind) : 'supplement';
    const kindCategories = CATEGORIES_FOR_KIND[suggestedKind as ProductKind] as readonly string[];
    const suggestedCategory = kindCategories.includes(String(parsed.suggested_category)) ? String(parsed.suggested_category) : 'uncategorized';

    return NextResponse.json({
      rejected: false,
      suggested_kind: suggestedKind,
      suggested_category: suggestedCategory,
      profile: enforcedProfile,
      applied_rules: appliedRules,
      used_image: !!inlineImage,
    });
  } catch (error) {
    console.error('[catalog/profile] error:', error);
    return NextResponse.json({ error: (error as Error)?.message || 'حدث خطأ في السيرفر' }, { status: 500 });
  }
}
