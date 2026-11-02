/**
 * مركز الإشعارات — «رأيتُ».
 *
 * ملاحظة الزميل (في ملف المريض أو داخل طلب) تخرج من الجرس حين تُفتح الشاشة التي تعرضها، دون أن تُغلَق الملاحظة نفسها
 * (ملاحظة مثل «خصم ثابت 10%» تبقى مفتوحة في الملف ولا تحتاج «تمّت»).
 *
 * التخزين: localStorage لكل جهاز ولكل موظف (المفتاح يحمل الصيدلية والموظف)، فعلى جهاز مشترك لا يُخفي موظفٌ إشعارَ غيره.
 * لا كتابة في القاعدة ولا جدول جديد. القراءة والكتابة داخل try/catch دائماً، مع نسخة في الذاكرة احتياطاً (وضع خاص/تخزين محجوب).
 * وحدة نقية من React وSupabase كي تُفحص بـ node:test وحدها.
 */

export type SeenKind = 'pn' | 'rn'; // pn = ملاحظة ملف مريض، rn = ملاحظة داخل طلب

const PREFIX = 'vd-notif-seen:v1:';
const KEEP_MS = 30 * 86_400_000; // أطول بكثير من نافذة الإشعار (7 أيام)
const MAX_ENTRIES = 500;

type SeenMap = Record<string, number>;

const memory = new Map<string, SeenMap>();
const listeners = new Set<() => void>();

/** هوية صاحب الجهاز: الصيدلية + الموظف (المعرّف، وإلا الاسم). بلا هوية = مفتاح مشترك لأصحاب الحسابات بلا موظف. */
export function seenKeyOf(t: { pharmacyId?: string | null; staffId?: string | null; staffName?: string | null }): string {
  const who = t.staffId ? t.staffId : t.staffName ? `n:${t.staffName}` : '';
  return `${t.pharmacyId ?? ''}:${who}`;
}

export const seenId = (kind: SeenKind, id: string): string => `${kind}:${id}`;

function parse(raw: string | null): SeenMap | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const out: SeenMap = {};
    for (const [k, t] of Object.entries(v as Record<string, unknown>)) {
      if (typeof t === 'number' && Number.isFinite(t)) out[k] = t;
    }
    return out;
  } catch {
    return null;
  }
}

function read(key: string): SeenMap {
  try {
    const m = parse(globalThis.localStorage?.getItem(PREFIX + key) ?? null);
    if (m) return m;
  } catch { /* تخزين محجوب: نكمل بالذاكرة */ }
  return memory.get(key) ?? {};
}

function write(key: string, map: SeenMap): void {
  memory.set(key, map);
  try {
    globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(map));
  } catch { /* ممتلئ أو محجوب: تبقى نسخة الذاكرة لهذه الجلسة */ }
}

/** المعرّفات التي رآها هذا الموظف على هذا الجهاز (صيغة kind:id). */
export function loadSeen(key: string): Set<string> {
  return new Set(Object.keys(read(key)));
}

/** يسجّل المعرّفات «مرئية». يُشعر المشتركين فقط إن أضاف جديداً. يقصّ ما تجاوز 30 يوماً وما زاد على 500 (الأقدم أولاً). */
export function addSeen(key: string, ids: readonly string[], now: number = Date.now()): boolean {
  if (!ids.length) return false;
  const map = read(key);
  let added = false;
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(map, id)) { map[id] = now; added = true; }
  }
  if (!added) return false;
  for (const [id, t] of Object.entries(map)) if (now - t > KEEP_MS) delete map[id];
  const entries = Object.entries(map);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [id] of entries.slice(MAX_ENTRIES)) delete map[id];
  }
  write(key, map);
  listeners.forEach((l) => l());
  return true;
}

function onStorage(e: StorageEvent): void {
  if (e.key === null || e.key.startsWith(PREFIX)) listeners.forEach((l) => l());
}

/** اشتراك في التغيّر: من هذا التبويب (addSeen) ومن تبويبات أخرى (حدث storage). */
export function subscribeSeen(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}
