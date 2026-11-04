import { supabaseAdmin } from '@/lib/supabase-admin';

// عدّاد زيارات /welcome: مسار عام عمداً (بلا جلسة) لأن الزائر غير مسجّل.
// لا يُقرأ ولا يُخزَّن أي IP أو user-agent أو header، والكتابة عبر rpc واحد بمفتاح service role.
const MAX_BODY_BYTES = 2048;
const TAG_RE = /^[a-z0-9-]{1,24}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// الرد ثابت دائماً حتى لا يكشف المسار شيئاً عن صحة الإدخال
const done = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

// قراءة الجسم كتدفّق مع قطع فوري عند تجاوز الحد، فلا نحمّل جسماً ضخماً في الذاكرة
async function readLimited(request: Request): Promise<string | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  if (total === 0) return null;
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

function intInRange(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

export async function POST(request: Request) {
  try {
    const text = await readLimited(request);
    if (!text) return done();

    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return done();
      body = parsed as Record<string, unknown>;
    } catch {
      return done();
    }

    const visitId = body.visit_id;
    if (typeof visitId !== 'string' || !UUID_RE.test(visitId)) return done();

    const activeSeconds = intInRange(body.active_seconds, 0, 1800);
    const maxSection = intInRange(body.max_section, 0, 10);
    if (activeSeconds === null || maxSection === null) return done();

    const src = typeof body.src === 'string' && TAG_RE.test(body.src) ? body.src : 'web';
    const device = body.device === 'mobile' || body.device === 'desktop' ? body.device : null;
    const rawClicks = body.wa_clicks;
    const waClicks =
      Array.isArray(rawClicks) && rawClicks.length <= 10 && rawClicks.every((t) => typeof t === 'string' && TAG_RE.test(t))
        ? (rawClicks as string[])
        : [];

    await supabaseAdmin.rpc('welcome_beacon_upsert', {
      p_visit_id: visitId,
      p_src: src,
      p_device: device,
      p_active_seconds: activeSeconds,
      p_max_section: maxSection,
      p_wa_clicks: waClicks,
    });
  } catch {
    // الصمت مقصود: العدّاد لا يجوز أن يُظهر خطأً أو يؤثر على الزائر
  }
  return done();
}
