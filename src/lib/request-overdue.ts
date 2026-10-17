// قواعد تأخر طلبات المواد (دوال نقية بلا React). كل الأوقات بتوقيت Asia/Amman، وأيام عمل المستودع من
// السبت إلى الخميس (الجمعة ليست يوم عمل، ولا عطل أخرى حالياً). الساعة المعتمدة لكل بند هي
// item.stage_changed_at لمرحلته الحالية، وللعربون المعلّق cancelled_at للطلب.
//
// الثوابت كلها هنا في مكان واحد (دقائق منذ منتصف الليل لساعات اليوم، وأيام تقويمية لانتظار المريض والعربون).

/** طلب مسجّل حتى هذه الساعة (أو قبلها) من يوم عمل يُطلب من المورد ويصل في اليوم نفسه */
export const SAME_DAY_ORDER_UNTIL = 11 * 60;
/** تسجيل البند في أو بعد هذه الساعة (أو يوم الجمعة) يؤجّل موعد طلبه إلى يوم العمل التالي */
export const LATE_RECORD_FROM = 15 * 60;
/** إغلاق المستودع: آخر موعد لطلب البند من المورد */
export const WAREHOUSE_CLOSE = 16 * 60;
/** أيام تقويمية (كلها بما فيها الجمعة) قبل أن يُعدّ انتظار المريض لصنف وصل تأخراً */
export const PATIENT_WAIT_DAYS = 1;
/** أيام تقويمية قبل أن يُعدّ عربون الطلب الملغى غير المُرجَع تأخراً */
export const REFUND_WAIT_DAYS = 1;

/** حدث نافذة يُطلَق بعد كل كتابة ناجحة في شاشات الطلبات ليحدّث غيرها (الرئيسية، الهيدر) عدّاداتها */
export const REQUESTS_CHANGED_EVENT = 'requests:changed';

export function notifyRequestsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REQUESTS_CHANGED_EVENT));
}

// ═══════════════════════════════════════════════════════
// الوقت بتوقيت عمّان
// ═══════════════════════════════════════════════════════
const AMMAN_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// أسماء الأيام مفهرسة بـ dow (الأحد = 0 … السبت = 6)
const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const FRIDAY = 5;

/** «الآن» لكل الدوال: في التطوير فقط يمكن السفر بالزمن بـ ?asOf=<ISO> في عنوان الصفحة؛ في الإنتاج لا أثر له */
export function getNow(): Date {
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    const raw = new URLSearchParams(window.location.search).get('asOf');
    if (raw) {
      // «+» في إزاحة المنطقة يتحوّل إلى مسافة في الاستعلام
      const d = new Date(raw.replace(' ', '+'));
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

// يوم تقويمي بعمّان كرقم صحيح (أيام منذ 1970-01-01) ودقائق اليوم، فيصير حساب الأيام جمعاً وطرحاً
function toAmman(d: Date): { dayNum: number; minutes: number; local: number } {
  const p: Record<string, string> = {};
  for (const part of AMMAN_PARTS.formatToParts(d)) p[part.type] = part.value;
  const dayNum = Math.floor(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86400000);
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return { dayNum, minutes, local: dayNum * 1440 + minutes };
}

const dowOf = (dayNum: number): number => (((dayNum % 7) + 4) % 7 + 7) % 7; // 1970-01-01 كان خميساً

export const isWorkingDay = (dayNum: number): boolean => dowOf(dayNum) !== FRIDAY;

/** أول يوم عمل بعد اليوم المعطى (يتخطى الجمعة) */
export function nextWorkingDay(dayNum: number): number {
  let d = dayNum + 1;
  while (!isWorkingDay(d)) d += 1;
  return d;
}

function formatDayNum(dayNum: number): string {
  const d = new Date(dayNum * 86400000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** عدد الأيام بصياغة عربية سليمة: يوم واحد / يومين / N أيام / N يوماً */
export function daysPhrase(n: number): string {
  if (n <= 0) return 'أقل من يوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

// ═══════════════════════════════════════════════════════
// المواعيد
// ═══════════════════════════════════════════════════════
/** موعد طلب البند «المسجّل» من المورد: يوم العمل قبل 15:00 ← 16:00 اليوم نفسه، وإلا ← 16:00 يوم العمل التالي */
export function getOrderDeadline(recordedAt: Date | string): { dayNum: number; local: number } {
  const p = toAmman(toDate(recordedAt));
  const sameDay = isWorkingDay(p.dayNum) && p.minutes < LATE_RECORD_FROM;
  const dayNum = sameDay ? p.dayNum : nextWorkingDay(p.dayNum);
  return { dayNum, local: dayNum * 1440 + WAREHOUSE_CLOSE };
}

/** يوم الوصول المتوقع للبند «المطلوب»: يوم عمل حتى 11:00 ← اليوم نفسه، بعدها ← يوم العمل التالي، والجمعة ← السبت */
export function getExpectedArrival(orderedAt: Date | string): number {
  const p = toAmman(toDate(orderedAt));
  if (!isWorkingDay(p.dayNum)) return nextWorkingDay(p.dayNum);
  return p.minutes <= SAME_DAY_ORDER_UNTIL ? p.dayNum : nextWorkingDay(p.dayNum);
}

/** نص الشارة الرمادية للوصول المتوقع (للبند غير المتأخر) */
export function getExpectedLabel(expectedDay: number, now: Date = getNow()): string {
  const today = toAmman(now).dayNum;
  if (expectedDay === today) return 'متوقع اليوم مساءً';
  if (expectedDay === today + 1) return 'متوقع غداً';
  return `متوقع ${WEEKDAYS[dowOf(expectedDay)]}`;
}

// ═══════════════════════════════════════════════════════
// أسباب التأخر
// ═══════════════════════════════════════════════════════
export type OverdueType = 'notOrdered' | 'supplier' | 'awaitingPatient' | 'refund';

export interface OverdueReason {
  type: OverdueType;
  /** معرّفات وأسماء البنود المعنية (فارغة للعربون فهو للطلب لا لبند) */
  itemIds: string[];
  itemNames: string[];
  /** نص السبب بلا اسم الصنف: يُجمَّع به أكثر من بند */
  detail: string;
  /** النص الكامل للعرض: «<صنف>: <detail>» لبند واحد، و«<detail>: <أصناف>» لعدة بنود */
  label: string;
  /** ساعات التأخر منذ تجاوز الحد؛ للفرز (الأكثر تأخراً أولاً) */
  lateness: number;
}

export interface OverdueItem { id?: string; product_name?: string; stage: string; stage_changed_at?: string | null }

export interface OverdueInput {
  status: string;
  deposit: number | null;
  deposit_returned: boolean | null;
  cancelled_at: string | null;
  items: OverdueItem[];
}

/** شارة الوصول المتوقع لبند «مطلوب» لم يتأخر بعد؛ null لغيره */
export function getExpectedChipLabel(item: OverdueItem, now: Date = getNow()): string | null {
  if (item.stage !== 'ordered' || !item.stage_changed_at) return null;
  const expected = getExpectedArrival(item.stage_changed_at);
  if (toAmman(now).dayNum > expected) return null; // متأخر: يظهر في أسباب التأخر لا كشارة
  return getExpectedLabel(expected, now);
}

interface ItemOverdue { type: OverdueType; detail: string; short: string; lateness: number }

// تأخر بند واحد بالقواعد نفسها: detail للتجميع في سطر الطلب، وshort للشارة الصغيرة بجانب البند
function itemOverdue(it: OverdueItem, n: ReturnType<typeof toAmman>): ItemOverdue | null {
  if (!it.stage_changed_at) return null;
  if (it.stage === 'recorded') {
    const deadline = getOrderDeadline(it.stage_changed_at);
    if (n.local <= deadline.local) return null;
    return { type: 'notOrdered', detail: 'لم يُطلب من المورد — فات موعد الطلب', short: 'فات موعد الطلب', lateness: (n.local - deadline.local) / 60 };
  }
  if (it.stage === 'ordered') {
    const expected = getExpectedArrival(it.stage_changed_at);
    if (n.dayNum <= expected) return null;
    const ago = n.dayNum - expected;
    const when = ago === 1 ? 'أمس' : ago <= 6 ? WEEKDAYS[dowOf(expected)] : formatDayNum(expected);
    const text = `لم يصل — كان متوقعاً ${when}`;
    return { type: 'supplier', detail: text, short: text, lateness: (n.local - (expected + 1) * 1440) / 60 };
  }
  if (it.stage === 'arrived') {
    const since = toAmman(new Date(it.stage_changed_at)).dayNum;
    const days = n.dayNum - since;
    if (days < PATIENT_WAIT_DAYS) return null;
    const text = `بانتظار المريض منذ ${daysPhrase(days)}`;
    return { type: 'awaitingPatient', detail: text, short: text, lateness: (n.local - (since + PATIENT_WAIT_DAYS) * 1440) / 60 };
  }
  return null;
}

/** السبب القصير لتأخر بند واحد (للشارة بجانب مرحلته) أو null؛ بالقواعد نفسها ولطلب `open` فقط */
export function getItemOverdue(item: OverdueItem, req: Pick<OverdueInput, 'status'>, now: Date = getNow()): string | null {
  if (req.status !== 'open') return null;
  return itemOverdue(item, toAmman(now))?.short ?? null;
}

/**
 * أسباب تأخر طلب في «المفتوحة» (open أو ملغى بعربون معلّق): تُحسب لكل بند متأخر ثم تُجمَّع الأسباب
 * المتطابقة في النوع ونص التفصيل في سطر واحد يسرد أسماء بنودها (تأخره = الأكبر)، مرتبة بالتأخر تنازلياً.
 * طلب مسلَّم أو ملغى بلا عربون معلّق يعطي مصفوفة فارغة.
 */
export function getOverdueReasons(req: OverdueInput, now: Date = getNow()): OverdueReason[] {
  const n = toAmman(now);
  const groups = new Map<string, OverdueReason>();

  if (req.status === 'open') {
    for (const it of req.items) {
      const late = itemOverdue(it, n);
      if (!late) continue;
      const key = `${late.type}|${late.detail}`;
      const g = groups.get(key) ?? { type: late.type, itemIds: [], itemNames: [], detail: late.detail, label: late.detail, lateness: late.lateness };
      if (it.id) g.itemIds.push(it.id);
      if (it.product_name) g.itemNames.push(it.product_name);
      g.lateness = Math.max(g.lateness, late.lateness);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      if (g.itemNames.length === 1) g.label = `${g.itemNames[0]}: ${g.detail}`;
      else if (g.itemNames.length > 1) g.label = `${g.detail}: ${g.itemNames.join('، ')}`;
    }
  } else if (req.status === 'cancelled' && Number(req.deposit ?? 0) > 0 && req.deposit_returned === false && req.cancelled_at) {
    const since = toAmman(new Date(req.cancelled_at)).dayNum;
    const days = n.dayNum - since;
    if (days >= REFUND_WAIT_DAYS) {
      const detail = `العربون بانتظار الإرجاع منذ ${daysPhrase(days)}`;
      groups.set('refund', { type: 'refund', itemIds: [], itemNames: [], detail, label: detail, lateness: (n.local - (since + REFUND_WAIT_DAYS) * 1440) / 60 });
    }
  }

  return [...groups.values()].sort((a, b) => b.lateness - a.lateness);
}

// ═══════════════════════════════════════════════════════
// ملخص الطلبات المتأخرة (للبطاقة في الرئيسية وعدّاد القائمة العلوية)
// ═══════════════════════════════════════════════════════

/** مرشح PostgREST للطلبات «المفتوحة»: open أو ملغى بعربون لم يُرجَع (نسخة صفحة الطلبات نفسها) */
export const OPEN_REQUESTS_FILTER = 'status.eq.open,and(status.eq.cancelled,deposit.gt.0,deposit_returned.eq.false)';

/** حقول الاستعلام الخفيف: ما يلزم لحساب التأخر وعرض سطر الرئيسية فقط */
export const OVERDUE_SUMMARY_SELECT =
  'id, request_number, request_year, status, deposit, deposit_returned, cancelled_at, patient:patients(name), items:patient_request_items(id, product_name, stage, stage_changed_at)';

export interface OverdueRequestRow extends OverdueInput {
  id: string;
  request_number: number;
  request_year: number;
  patient: { name: string } | { name: string }[] | null;
}

export interface OverdueRequestSummary {
  id: string;
  request_number: number;
  request_year: number;
  patientName: string;
  reasons: OverdueReason[];
  maxLateness: number;
}

/** الطلبات المتأخرة فقط، الأكثر تأخراً أولاً (الفرز ثابت: التعادل يحفظ ترتيب المصدر) */
export function summarizeOverdue(rows: OverdueRequestRow[], now: Date = getNow()): OverdueRequestSummary[] {
  const out: OverdueRequestSummary[] = [];
  for (const r of rows) {
    const reasons = getOverdueReasons(r, now);
    if (reasons.length === 0) continue;
    const patient = Array.isArray(r.patient) ? r.patient[0] : r.patient;
    out.push({
      id: r.id, request_number: r.request_number, request_year: r.request_year,
      patientName: patient?.name ?? '', reasons, maxLateness: reasons[0].lateness,
    });
  }
  return out.sort((a, b) => b.maxLateness - a.maxLateness);
}
