/**
 * مركز الإشعارات — محرّك القواعد.
 *
 * دوال نقية بالكامل: لا شبكة، ولا React، ولا Supabase، ولا Date.now(). كل ما يلزم يُمرَّر من الخارج،
 * فيمكن فحصها بالأرقام وحدها (انظر engine.test.ts).
 *
 * الفكرة: الإشعار «حالة حيّة» تُحسب من البيانات الموجودة، وليس رسالة تُرسَل ثم تنتهي.
 *  - لا يتكرر: السطر نفسه موجود ما دام سببه قائماً، ويتحدّث عدده مع كل جلب.
 *  - تتغيّر شدّته مع الوقت (عنبري ← أحمر) والصياغة تتبع الحالة.
 *  - يختفي حين ينتهي سببه (أُرسلت الرسالة، أُكّد المخزون، أُغلقت الملاحظة...).
 *  - يرى كل دور ما يقدر على التصرف فيه فقط.
 *
 * التواريخ: «اليوم» بتوقيت عمّان (UTC+3 ثابت، كبقية النظام).
 */

// ───────────────────────── الأنواع العامة ─────────────────────────

export type Role = 'owner' | 'pharmacist' | 'assistant' | 'staff';
export type Severity = 'urgent' | 'action' | 'info';
export type SectionKey = 'home' | 'chronic' | 'inventory' | 'requests' | 'catalog' | 'patients' | 'account';

export const SECTION_KEYS: readonly SectionKey[] = ['home', 'chronic', 'inventory', 'requests', 'catalog', 'patients', 'account'];

export type LineKind =
  | 'refill_ran_out'
  | 'refill_urgent'
  | 'refill_soon'
  | 'refill_no_response'
  | 'inventory'
  | 'requests_overdue'
  | 'requests_action'
  | 'requests_follow_up'
  | 'requests_neglected'
  | 'catalog_review'
  | 'catalog_empty'
  | 'catalog_idle'
  | 'subscription'
  | 'birthdays'
  | 'notes'
  | 'request_notes';

// ───────────────────────── الإدخال (يجهّزه الـ adapter من بيانات النظام الحقيقية) ─────────────────────────

export type RefillStage = 'ok' | 'due' | 'messaged' | 'no_response' | 'renewed' | 'archived';

/** مريض مزمن واحد. المرحلة كما تشتقّها صفحة المزمنين تماماً. */
export interface RefillPatient {
  patientId: string;
  name: string;
  /** أصغر عدد أيام متبقية بين أدوية المريض الفعّالة؛ السالب = نفد الدواء. */
  daysLeft: number;
  stage: RefillStage;
  /** ISO — وقت إرسال الرسالة (reminded_at). */
  remindedAt: string | null;
  /** ISO — وقت دخول المرحلة الحالية (stage_changed_at). */
  stageChangedAt: string | null;
}

/** صنف في نافذة «جهّز مخزونك». */
export interface InventoryItem {
  key: string;
  name: string;
  daysLeft: number;
  /** هل لديه تأكيد مخزون ساري. */
  confirmed: boolean;
}

export type RequestAttentionKind = 'overdue' | 'action' | 'follow_up';

/** طلب مريض واحد يحتاج انتباهاً (يصنّفه الـ adapter بقواعد النظام الحالية). */
export interface RequestAttention {
  id: string;
  patientName: string;
  kind: RequestAttentionKind;
  /** منذ كم يوماً صار في هذه الحالة. */
  ageDays: number;
}

export interface CatalogInput {
  totalProducts: number;
  /** عدد الأصناف دون تأكيد ملف (نفس عدّ صفحة الكتالوج). */
  unconfirmed: number;
  /** ISO — أحدث created_at بين منتجات الصيدلية. */
  lastAddedAt: string | null;
}

export type SubscriptionPhase = 'active' | 'trial' | 'grace' | 'expired';

export interface SubscriptionInput {
  phase: SubscriptionPhase;
  /** الأيام المتبقية (≥ 0) أو null إن لم تُعرف. */
  daysLeft: number | null;
}

export interface BirthdayPatient {
  patientId: string;
  name: string;
}

/** ملاحظة كادر على ملف مريض. */
export interface OpenNote {
  id: string;
  patientId: string;
  patientName: string;
  authorStaffId: string | null;
  authorName: string;
  /** ISO */
  createdAt: string;
  /** ISO أو null إن كانت مفتوحة. */
  closedAt: string | null;
}

/** ملاحظة كادر داخل طلب مريض (حدث kind='note' في سجل الطلب). */
export interface RequestNote {
  id: string;
  requestId: string;
  patientName: string;
  authorStaffId: string | null;
  authorName: string;
  /** ISO */
  createdAt: string;
}

/** أي جزء غير معرَّف = لم يُحمَّل بعد (لا أسطر له، ولا يُعلَن أن «كل شيء مُنجَز»). */
export interface NotifyInput {
  refill?: RefillPatient[];
  inventory?: InventoryItem[];
  requests?: RequestAttention[];
  catalog?: CatalogInput;
  subscription?: SubscriptionInput;
  birthdays?: BirthdayPatient[];
  notes?: OpenNote[];
  requestNotes?: RequestNote[];
}

export interface NotifyContext {
  /** الآن بالميلي ثانية (Date.now()). */
  now: number;
  role: Role;
  /** هوية الموظف الحالي (لاستبعاد ملاحظاته هو). */
  staffId: string | null;
  /**
   * اسم الموظف الحالي — احتياط لحالة واحدة فقط: حساب بلا staffId (المالك غالباً) كتب ملاحظة بلا author_staff_id.
   * يُقارَن بـauthorName عندما يكون staffId وauthorStaffId كلاهما null. لا أثر له إن عُرف staffId.
   */
  staffName?: string | null;
}

export interface Routes {
  home: string;
  chronic: string;
  inventory: string;
  requests: string;
  catalog: string;
  patients: string;
  account: string;
  patient: (patientId: string) => string;
}

export interface Thresholds {
  /** NEXT_PUBLIC_MSG_EXPIRY_DAYS: مضت هذه الأيام على الرسالة دون رد ⇒ «بلا رد». */
  msgExpiryDays: number;
  /** نافذة «قارب النفاذ» بالأيام. */
  refillWindowDays: number;
  /** من نفد دواؤهم يبقون في الجرس هذه المدة فقط. */
  ranOutGraceDays: number;
  /** «بلا رد» يتحول للأحمر بعد أكثر من هذه الأيام. */
  noResponseRedAfterDays: number;
  /** إن كان للنظام أرشفة تلقائية لمن لا يردّون: أيامها، وإلا null. */
  noResponseArchiveDays: number | null;
  inventoryWindowDays: number;
  inventoryUrgentDays: number;
  /** طلب متأخر/ينتظر إجراءً منذ هذه الأيام أو أكثر ⇒ يظهر للمالك كـ«لم يُتابَع». */
  neglectedAfterDays: number;
  catalogIdleDays: number;
  subscriptionWarnDays: number;
  subscriptionUrgentDays: number;
  noteMaxAgeDays: number;
  /** أكثر من هذا العدد من الملاحظات الجديدة ⇒ سطر مجمّع واحد. */
  noteAggregateAbove: number;
}

export interface NotifyConfig extends Thresholds {
  routes: Routes;
}

export const DEFAULT_THRESHOLDS: Omit<Thresholds, 'msgExpiryDays'> = {
  refillWindowDays: 3,
  ranOutGraceDays: 14,
  noResponseRedAfterDays: 7,
  noResponseArchiveDays: null,
  inventoryWindowDays: 14,
  inventoryUrgentDays: 7,
  neglectedAfterDays: 3,
  catalogIdleDays: 14,
  subscriptionWarnDays: 14,
  subscriptionUrgentDays: 7,
  noteMaxAgeDays: 7,
  noteAggregateAbove: 3,
};

/** msgExpiryDays إلزامي عمداً: يجب أن يُقرأ من نفس المتغيّر الذي تقرؤه صفحة المزمنين. */
export function makeConfig(routes: Routes, msgExpiryDays: number, overrides: Partial<Thresholds> = {}): NotifyConfig {
  const m = Number.isFinite(msgExpiryDays) ? Math.max(1, Math.floor(msgExpiryDays)) : 1;
  return { ...DEFAULT_THRESHOLDS, ...overrides, msgExpiryDays: m, routes };
}

// ───────────────────────── الإخراج ─────────────────────────

export interface LineItem {
  label: string;
  href?: string;
}

export interface NotificationLine {
  /** ثابت لكل نوع (وللملاحظة الفردية notes:<id>) — أساس «رأيتُه/أجّلتُه» لاحقاً. */
  id: string;
  kind: LineKind;
  section: SectionKey;
  severity: Severity;
  /** عدد الكيانات (مرضى، أصناف، طلبات...). */
  count: number;
  /** ما يضيفه السطر إلى رقم الشارة والمجموع. 0 = تلميح هادئ لا يُحسب. */
  badge: number;
  title: string;
  detail?: string;
  href: string;
  items?: LineItem[];
  moreCount?: number;
  priority: number;
}

export interface SectionSummary {
  badge: number;
  severity: Severity | null;
}

export interface NotificationSummary {
  lines: NotificationLine[];
  total: number;
  bySection: Record<SectionKey, SectionSummary>;
  topSeverity: Severity | null;
  /** كل ما يخص هذا الدور حُمِّل. */
  complete: boolean;
  /** كل شيء مُنجَز (مكتمل ولا شيء في الرقم). */
  allClear: boolean;
  encouragement: string | null;
}

// ───────────────────────── الزمن (عمّان UTC+3) ─────────────────────────

const HOUR = 3_600_000;
const DAY = 86_400_000;
const AMMAN_OFFSET = 3 * HOUR;

function dayNo(ms: number): number {
  return Math.floor((ms + AMMAN_OFFSET) / DAY);
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** أيام تقويمية (بتوقيت عمّان) مضت منذ ms؛ لا تقل عن 0. */
function daysSinceMs(ms: number | null, now: number): number | null {
  if (ms === null) return null;
  return Math.max(0, dayNo(now) - dayNo(ms));
}

// ───────────────────────── العربية: العدد والمعدود ─────────────────────────

interface Forms {
  one: string;
  two: string;
  few: string;
  many: string;
  big: string;
}

const PATIENTS: Forms = { one: 'مريض واحد', two: 'مريضان', few: 'مرضى', many: 'مريضاً', big: 'مريض' };
const ITEMS: Forms = { one: 'صنف واحد', two: 'صنفان', few: 'أصناف', many: 'صنفاً', big: 'صنف' };
const REQUESTS: Forms = { one: 'طلب واحد', two: 'طلبان', few: 'طلبات', many: 'طلباً', big: 'طلب' };
const NOTES: Forms = { one: 'ملاحظة واحدة', two: 'ملاحظتان', few: 'ملاحظات', many: 'ملاحظة', big: 'ملاحظة' };

/** «مريض واحد» / «مريضان» / «5 مرضى» / «12 مريضاً» / «100 مريض». */
export function counted(n: number, f: Forms): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  if (n >= 3 && n <= 10) return `${n} ${f.few}`;
  if (n >= 11 && n <= 99) return `${n} ${f.many}`;
  return `${n} ${f.big}`;
}

/** لاحقة الضمير المتصل: دواؤه / دواؤهما / دواؤهم. */
function sfx(n: number): string {
  return n === 1 ? 'ه' : n === 2 ? 'هما' : 'هم';
}

/** فعل مضارع للمعدود غير العاقل: يحتاج / يحتاجان / تحتاج. */
function verbThing(n: number, sing: string, dual: string, plur: string): string {
  return n === 1 ? sing : n === 2 ? dual : plur;
}

/** المدة بصيغة المجرور بعد «منذ/خلال/أكثر من»: يوم / يومين / 5 أيام / 12 يوماً. */
function daysGen(days: number): string {
  const d = Math.max(1, Math.floor(days));
  if (d === 1) return 'يوم';
  if (d === 2) return 'يومين';
  if (d <= 10) return `${d} أيام`;
  return `${d} يوماً`;
}

function ago(days: number): string {
  const d = Math.max(0, Math.floor(days));
  return d === 0 ? 'اليوم' : `منذ ${daysGen(d)}`;
}

function within(days: number): string {
  return `خلال ${daysGen(days)}`;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** رقم الشارة كما يُعرض. */
export function formatBadge(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}

// ───────────────────────── مساعدات ─────────────────────────

const SEV_RANK: Record<Severity, number> = { urgent: 3, action: 2, info: 1 };

function maxSeverity(a: Severity | null, b: Severity): Severity {
  return a === null || SEV_RANK[b] > SEV_RANK[a] ? b : a;
}

function sample(labels: string[], max = 3): { items: LineItem[]; moreCount?: number } {
  const items = labels.slice(0, max).map((label) => ({ label }));
  const more = labels.length - items.length;
  return more > 0 ? { items, moreCount: more } : { items };
}

function canSeeCatalog(role: Role): boolean {
  return role === 'owner' || role === 'pharmacist';
}

function isOwner(role: Role): boolean {
  return role === 'owner';
}

function nameOr(name: string | null | undefined, fallback: string): string {
  const t = (name ?? '').trim();
  return t ? t : fallback;
}

// ───────────────────────── الأسطر ─────────────────────────

interface EffectiveStage {
  stage: RefillStage;
  sinceMs: number | null;
}

/** «رسالة أُرسلت ومضت مهلتها» تعدّ «بلا رد» حتى قبل أن تكتبها صفحة المزمنين في القاعدة. */
function effectiveStage(p: RefillPatient, now: number, cfg: NotifyConfig): EffectiveStage {
  const reminded = parseMs(p.remindedAt);
  if (p.stage === 'messaged') {
    const d = daysSinceMs(reminded, now);
    if (reminded !== null && d !== null && d >= cfg.msgExpiryDays) {
      return { stage: 'no_response', sinceMs: reminded + cfg.msgExpiryDays * DAY };
    }
    return { stage: 'messaged', sinceMs: reminded };
  }
  if (p.stage === 'no_response') {
    const changed = parseMs(p.stageChangedAt);
    const since = changed !== null ? changed : reminded !== null ? reminded + cfg.msgExpiryDays * DAY : null;
    return { stage: 'no_response', sinceMs: since };
  }
  return { stage: p.stage, sinceMs: parseMs(p.stageChangedAt) };
}

function refillLines(list: RefillPatient[], ctx: NotifyContext, cfg: NotifyConfig): NotificationLine[] {
  const seen = new Set<string>();
  const ranOut: RefillPatient[] = [];
  const urgent: RefillPatient[] = [];
  const soon: RefillPatient[] = [];
  const noResp: { p: RefillPatient; age: number }[] = [];

  for (const p of list) {
    if (!p || seen.has(p.patientId)) continue;
    seen.add(p.patientId);
    if (!Number.isFinite(p.daysLeft)) continue;
    const eff = effectiveStage(p, ctx.now, cfg);
    if (eff.stage === 'due') {
      if (p.daysLeft > cfg.refillWindowDays) continue;
      if (p.daysLeft < -cfg.ranOutGraceDays) continue;
      if (p.daysLeft < 0) ranOut.push(p);
      else if (p.daysLeft <= 1) urgent.push(p);
      else soon.push(p);
    } else if (eff.stage === 'no_response') {
      const age = daysSinceMs(eff.sinceMs, ctx.now) ?? 0;
      if (cfg.noResponseArchiveDays !== null && age > cfg.noResponseArchiveDays) continue;
      noResp.push({ p, age });
    }
  }

  const out: NotificationLine[] = [];
  const byDays = (a: RefillPatient, b: RefillPatient) => a.daysLeft - b.daysLeft || cmp(a.name, b.name);

  if (ranOut.length) {
    ranOut.sort(byDays);
    const n = ranOut.length;
    const oldest = Math.max(...ranOut.map((p) => Math.ceil(-p.daysLeft)));
    out.push({
      id: 'refill_ran_out',
      kind: 'refill_ran_out',
      section: 'chronic',
      severity: 'urgent',
      count: n,
      badge: n,
      title: `${counted(n, PATIENTS)} نفد دواؤ${sfx(n)} دون إرسال رسالة`,
      detail: n === 1 ? ago(oldest) : `أقدم حالة ${ago(oldest)}`,
      href: cfg.routes.chronic,
      ...sample(ranOut.map((p) => nameOr(p.name, 'مريض'))),
      priority: 98,
    });
  }
  if (urgent.length) {
    urgent.sort(byDays);
    const n = urgent.length;
    out.push({
      id: 'refill_urgent',
      kind: 'refill_urgent',
      section: 'chronic',
      severity: 'urgent',
      count: n,
      badge: n,
      title: `${counted(n, PATIENTS)} ينتهي دواؤ${sfx(n)} اليوم أو غداً`,
      detail: 'لم يُرسَل تذكير بعد',
      href: cfg.routes.chronic,
      ...sample(urgent.map((p) => nameOr(p.name, 'مريض'))),
      priority: 96,
    });
  }
  if (soon.length) {
    soon.sort(byDays);
    const n = soon.length;
    out.push({
      id: 'refill_soon',
      kind: 'refill_soon',
      section: 'chronic',
      severity: 'action',
      count: n,
      badge: n,
      title: `${counted(n, PATIENTS)} ينتهي دواؤ${sfx(n)} ${within(cfg.refillWindowDays)}`,
      detail: 'لم يُرسَل تذكير بعد',
      href: cfg.routes.chronic,
      ...sample(soon.map((p) => nameOr(p.name, 'مريض'))),
      priority: 85,
    });
  }
  if (noResp.length) {
    noResp.sort((a, b) => b.age - a.age || cmp(a.p.name, b.p.name));
    const n = noResp.length;
    const oldest = noResp[0].age;
    const red = oldest > cfg.noResponseRedAfterDays;
    const verb = n === 1 ? 'لم يردّ' : n === 2 ? 'لم يردّا' : 'لم يردّوا';
    const when = oldest === 0 ? 'انتهت مهلة الردّ اليوم' : n === 1 ? `دون ردّ ${ago(oldest)}` : `أقدم حالة دون ردّ ${ago(oldest)}`;
    out.push({
      id: 'refill_no_response',
      kind: 'refill_no_response',
      section: 'chronic',
      severity: red ? 'urgent' : 'action',
      count: n,
      badge: n,
      title: `${counted(n, PATIENTS)} ${verb} على الرسالة`,
      detail: when,
      href: cfg.routes.chronic,
      ...sample(noResp.map((x) => nameOr(x.p.name, 'مريض'))),
      priority: red ? 90 : 60,
    });
  }
  return out;
}

function inventoryLines(list: InventoryItem[], cfg: NotifyConfig): NotificationLine[] {
  const seen = new Set<string>();
  const need: InventoryItem[] = [];
  for (const it of list) {
    if (!it || seen.has(it.key)) continue;
    seen.add(it.key);
    if (!Number.isFinite(it.daysLeft)) continue;
    if (it.confirmed) continue;
    if (it.daysLeft > cfg.inventoryWindowDays) continue;
    need.push(it);
  }
  if (!need.length) return [];
  need.sort((a, b) => a.daysLeft - b.daysLeft || cmp(a.name, b.name));
  const n = need.length;
  const k = need.filter((it) => it.daysLeft <= cfg.inventoryUrgentDays).length;
  const urgent = k > 0;
  return [
    {
      id: 'inventory',
      kind: 'inventory',
      section: 'inventory',
      severity: urgent ? 'urgent' : 'action',
      count: n,
      badge: n,
      title: `${counted(n, ITEMS)} ${verbThing(n, 'يحتاج', 'يحتاجان', 'تحتاج')} تجهيزاً`,
      detail: urgent ? (k === 1 ? 'منها صنف واحد عاجل' : `منها ${k} عاجلة`) : undefined,
      href: cfg.routes.inventory,
      ...sample(need.map((it) => nameOr(it.name, 'صنف'))),
      priority: urgent ? 92 : 70,
    },
  ];
}

function requestLines(list: RequestAttention[], ctx: NotifyContext, cfg: NotifyConfig): NotificationLine[] {
  // طلب واحد لا يظهر في أكثر من فئة: المتأخر ثم الإجراء ثم المتابعة.
  const rank: Record<RequestAttentionKind, number> = { overdue: 3, action: 2, follow_up: 1 };
  const byId = new Map<string, RequestAttention>();
  for (const r of list) {
    if (!r) continue;
    const cur = byId.get(r.id);
    if (!cur || rank[r.kind] > rank[cur.kind]) byId.set(r.id, r);
  }
  const all = [...byId.values()].map((r) => ({ ...r, ageDays: Number.isFinite(r.ageDays) ? Math.max(0, Math.floor(r.ageDays)) : 0 }));
  const overdue = all.filter((r) => r.kind === 'overdue');
  const action = all.filter((r) => r.kind === 'action');
  const follow = all.filter((r) => r.kind === 'follow_up');
  const oldestFirst = (a: { ageDays: number; patientName: string }, b: { ageDays: number; patientName: string }) =>
    b.ageDays - a.ageDays || cmp(a.patientName, b.patientName);
  const out: NotificationLine[] = [];

  if (overdue.length) {
    overdue.sort(oldestFirst);
    const n = overdue.length;
    const oldest = overdue[0].ageDays;
    out.push({
      id: 'requests_overdue',
      kind: 'requests_overdue',
      section: 'requests',
      severity: 'urgent',
      count: n,
      badge: n,
      title: `${counted(n, REQUESTS)} ${verbThing(n, 'متأخر', 'متأخران', 'متأخرة')}`,
      detail: oldest >= 1 ? (n === 1 ? ago(oldest) : `أقدمها ${ago(oldest)}`) : undefined,
      href: cfg.routes.requests,
      ...sample(overdue.map((r) => nameOr(r.patientName, 'مريض'))),
      priority: 94,
    });
  }
  if (action.length) {
    action.sort(oldestFirst);
    const n = action.length;
    out.push({
      id: 'requests_action',
      kind: 'requests_action',
      section: 'requests',
      severity: 'action',
      count: n,
      badge: n,
      title: `${counted(n, REQUESTS)} ${verbThing(n, 'ينتظر', 'ينتظران', 'تنتظر')} إجراءً`,
      href: cfg.routes.requests,
      ...sample(action.map((r) => nameOr(r.patientName, 'مريض'))),
      priority: 80,
    });
  }
  if (follow.length) {
    follow.sort(oldestFirst);
    const n = follow.length;
    out.push({
      id: 'requests_follow_up',
      kind: 'requests_follow_up',
      section: 'requests',
      severity: 'info',
      count: n,
      badge: 0, // متابعة هادئة: طلب عند المورد ضمن مهلته، لا يملك الكادر ما يفعله فيه، فلا يدخل الأرقام ولا يطفئ «لا شيء ينتظركم»
      title: `${counted(n, REQUESTS)} ${verbThing(n, 'ينتظر', 'ينتظران', 'تنتظر')} المتابعة`,
      href: cfg.routes.requests,
      ...sample(follow.map((r) => nameOr(r.patientName, 'مريض'))),
      priority: 50,
    });
  }
  if (isOwner(ctx.role)) {
    const neglected = all.filter((r) => (r.kind === 'overdue' || r.kind === 'action') && r.ageDays >= cfg.neglectedAfterDays);
    if (neglected.length) {
      neglected.sort(oldestFirst);
      const n = neglected.length;
      const verb = n === 1 ? 'لم يُتابَع' : n === 2 ? 'لم يُتابَعا' : 'لم تُتابَع';
      out.push({
        id: 'requests_neglected',
        kind: 'requests_neglected',
        section: 'requests',
        severity: 'urgent',
        count: n,
        badge: 0, // إعادة صياغة لما سبق للمالك؛ لا تضاعف الرقم
        title: `${counted(n, REQUESTS)} ${verb} منذ أكثر من ${daysGen(cfg.neglectedAfterDays)}`,
        detail: 'تنبيه للمالك',
        href: cfg.routes.requests,
        ...sample(neglected.map((r) => nameOr(r.patientName, 'مريض'))),
        priority: 93,
      });
    }
  }
  return out;
}

function catalogLines(c: CatalogInput, ctx: NotifyContext, cfg: NotifyConfig): NotificationLine[] {
  const total = Number.isFinite(c.totalProducts) ? Math.max(0, Math.floor(c.totalProducts)) : 0;
  const unconfirmed = Number.isFinite(c.unconfirmed) ? Math.max(0, Math.floor(c.unconfirmed)) : 0;
  const out: NotificationLine[] = [];

  if (unconfirmed > 0) {
    out.push({
      id: 'catalog_review',
      kind: 'catalog_review',
      section: 'catalog',
      severity: 'action',
      count: unconfirmed,
      badge: 1, // مهمة واحدة («راجعوا الكتالوج») مهما كبر العدد
      title: `${counted(unconfirmed, ITEMS)} بحاجة مراجعة`,
      href: cfg.routes.catalog,
      priority: 70,
    });
  }
  if (total === 0) {
    out.push({
      id: 'catalog_empty',
      kind: 'catalog_empty',
      section: 'catalog',
      severity: 'action',
      count: 0,
      badge: 1,
      title: 'كتالوجكم فارغ',
      detail: 'ابدؤوا بإضافة منتجاتكم الأولى',
      href: cfg.routes.catalog,
      priority: 74,
    });
  } else {
    // خمول: يعمل لأي حجم كتالوج (لا هدف عددياً). تلميح هادئ يظهر في اللوحة ولا يُحسب في الرقم.
    const age = daysSinceMs(parseMs(c.lastAddedAt), ctx.now);
    if (age !== null && age >= cfg.catalogIdleDays) {
      out.push({
        id: 'catalog_idle',
        kind: 'catalog_idle',
        section: 'catalog',
        severity: 'info',
        count: 0,
        badge: 0,
        title: `لم تُضَف منتجات جديدة ${ago(age)}`,
        detail: 'إضافة المزيد تجعل نتائج النظام أدق',
        href: cfg.routes.catalog,
        priority: 20,
      });
    }
  }
  return out;
}

function subscriptionLines(s: SubscriptionInput, cfg: NotifyConfig): NotificationLine[] {
  const base = { section: 'account' as const, kind: 'subscription' as const, id: 'subscription', count: 1, badge: 1, href: cfg.routes.account };
  if (s.phase === 'expired') {
    return [{ ...base, severity: 'urgent', title: 'انتهى اشتراككم', detail: 'الحساب للقراءة فقط حتى التجديد', priority: 99 }];
  }
  if (s.phase === 'grace') {
    return [{ ...base, severity: 'urgent', title: 'اشتراككم في مهلة السماح', detail: 'جدّدوا لتستمروا دون انقطاع', priority: 97 }];
  }
  const d = s.daysLeft;
  if (d === null || !Number.isFinite(d) || d < 0 || d > cfg.subscriptionWarnDays) return [];
  const days = Math.floor(d);
  const subject = s.phase === 'trial' ? 'الفترة التجريبية' : 'اشتراككم';
  const verb = s.phase === 'trial' ? 'تنتهي' : 'ينتهي';
  const when = days === 0 ? 'اليوم' : days === 1 ? 'غداً' : within(days);
  const urgent = days <= cfg.subscriptionUrgentDays;
  return [{ ...base, severity: urgent ? 'urgent' : 'action', title: `${verb} ${subject} ${when}`, priority: urgent ? 91 : 72 }];
}

function birthdayLines(list: BirthdayPatient[], cfg: NotifyConfig): NotificationLine[] {
  const seen = new Set<string>();
  const people: BirthdayPatient[] = [];
  for (const b of list) {
    if (!b || seen.has(b.patientId)) continue;
    seen.add(b.patientId);
    people.push(b);
  }
  if (!people.length) return [];
  const n = people.length;
  const names = people.map((b) => nameOr(b.name, 'مريض'));
  const who = n === 1 ? names[0] : n === 2 ? `${names[0]} و${names[1]}` : `${n} ${n <= 10 ? 'مرضى' : 'مريضاً'}`;
  return [
    {
      id: 'birthdays',
      kind: 'birthdays',
      section: 'home',
      severity: 'info',
      count: n,
      badge: n,
      title: `اليوم عيد ميلاد ${who}`,
      detail: 'لم تُرسَل التهنئة بعد',
      href: cfg.routes.home,
      ...sample(names),
      priority: 30,
    },
  ];
}

/** ملاحظة كتبها الموظف الحالي نفسه: بالمعرّف، أو باسمه فقط حين لا معرّف لأيٍّ من الطرفين. */
function isOwnNote(n: { authorStaffId: string | null; authorName: string }, ctx: NotifyContext): boolean {
  if (ctx.staffId !== null) return n.authorStaffId === ctx.staffId;
  if (n.authorStaffId !== null) return false;
  const me = (ctx.staffName ?? '').trim();
  return me !== '' && (n.authorName ?? '').trim() === me;
}

function noteLines(list: OpenNote[], ctx: NotifyContext, cfg: NotifyConfig): NotificationLine[] {
  const seen = new Set<string>();
  const fresh: { n: OpenNote; age: number }[] = [];
  for (const n of list) {
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    if (n.closedAt) continue;
    if (isOwnNote(n, ctx)) continue;
    const age = daysSinceMs(parseMs(n.createdAt), ctx.now);
    if (age === null || age > cfg.noteMaxAgeDays) continue;
    fresh.push({ n, age });
  }
  if (!fresh.length) return [];
  fresh.sort((a, b) => a.age - b.age || cmp(a.n.id, b.n.id));

  // السطر المجمَّع يفتح قائمة المرضى، وهي لا تعرض لغير المالك شيئاً قبل البحث (مبدأ الحاجة للمعرفة)، فيصل إلى صفحة فارغة.
  // لذلك يُجمَّع للمالك وحده، ولكل غيره سطر لكل ملاحظة يفتح ملف مريضه مباشرة (الملف مفتوح لكل الأدوار). أي دور غير owner يأخذ هذا الطريق.
  if (fresh.length <= cfg.noteAggregateAbove || !isOwner(ctx.role)) {
    return fresh.map(({ n, age }) => ({
      id: `notes:${n.id}`,
      kind: 'notes' as const,
      section: 'patients' as const,
      severity: 'action' as const,
      count: 1,
      badge: 1,
      title: `ملاحظة جديدة من ${nameOr(n.authorName, 'زميل')} على المريض ${nameOr(n.patientName, '')}`.trim(),
      detail: ago(age),
      href: cfg.routes.patient(n.patientId),
      priority: 78 - Math.min(age, 7) * 0.1,
    }));
  }
  const count = fresh.length;
  return [
    {
      id: 'notes',
      kind: 'notes',
      section: 'patients',
      severity: 'action',
      count,
      badge: count,
      title: `${counted(count, NOTES)} جديدة من زملائكم`,
      detail: `أحدثها ${ago(fresh[0].age)}`,
      href: cfg.routes.patients,
      ...sample(fresh.map(({ n }) => `${nameOr(n.authorName, 'زميل')} — ${nameOr(n.patientName, 'مريض')}`)),
      priority: 78,
    },
  ];
}

/**
 * ملاحظات الكادر داخل الطلبات: كل ما يلزم تصفيته قبل المحرّك (الطلب مفتوح، آخر 7 أيام) يتكفّل به الاستعلام؛
 * هنا: استبعاد ملاحظاتي أنا، والعمر، والتكرار. لا إغلاق لهذه الملاحظات في النظام، فتخرج من الجرس بـ«رأيتُ» (خارج المحرّك) أو بعد noteMaxAgeDays.
 */
function requestNoteLines(list: RequestNote[], ctx: NotifyContext, cfg: NotifyConfig): NotificationLine[] {
  const seen = new Set<string>();
  const fresh: { n: RequestNote; age: number }[] = [];
  for (const n of list) {
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    if (isOwnNote(n, ctx)) continue;
    const age = daysSinceMs(parseMs(n.createdAt), ctx.now);
    if (age === null || age > cfg.noteMaxAgeDays) continue;
    fresh.push({ n, age });
  }
  if (!fresh.length) return [];
  fresh.sort((a, b) => a.age - b.age || cmp(a.n.id, b.n.id));

  if (fresh.length <= cfg.noteAggregateAbove) {
    return fresh.map(({ n, age }) => ({
      id: `request_notes:${n.id}`,
      kind: 'request_notes' as const,
      section: 'requests' as const,
      severity: 'action' as const,
      count: 1,
      badge: 1,
      title: `ملاحظة جديدة من ${nameOr(n.authorName, 'زميل')} على طلب المريض ${nameOr(n.patientName, '')}`.trim(),
      detail: ago(age),
      href: `${cfg.routes.requests}?open=${encodeURIComponent(n.requestId)}`,
      priority: 77 - Math.min(age, 7) * 0.1,
    }));
  }
  const count = fresh.length;
  return [
    {
      id: 'request_notes',
      kind: 'request_notes',
      section: 'requests',
      severity: 'action',
      count,
      badge: count,
      title: `${counted(count, NOTES)} جديدة على الطلبات`,
      detail: `أحدثها ${ago(fresh[0].age)}`,
      href: cfg.routes.requests,
      ...sample(fresh.map(({ n }) => `${nameOr(n.authorName, 'زميل')} — ${nameOr(n.patientName, 'مريض')}`)),
      priority: 77,
    },
  ];
}

// ───────────────────────── المحرّك ─────────────────────────

export const ALL_CLEAR_TEXT = 'لا شيء ينتظركم الآن، أحسنتم';

export function computeNotifications(input: NotifyInput, ctx: NotifyContext, cfg: NotifyConfig): NotificationSummary {
  const lines: NotificationLine[] = [];
  const role = ctx.role;

  if (input.refill) lines.push(...refillLines(input.refill, ctx, cfg));
  if (input.inventory) lines.push(...inventoryLines(input.inventory, cfg));
  if (input.requests) lines.push(...requestLines(input.requests, ctx, cfg));
  if (input.catalog && canSeeCatalog(role)) lines.push(...catalogLines(input.catalog, ctx, cfg));
  if (input.subscription && isOwner(role)) lines.push(...subscriptionLines(input.subscription, cfg));
  if (input.birthdays) lines.push(...birthdayLines(input.birthdays, cfg));
  if (input.notes) lines.push(...noteLines(input.notes, ctx, cfg));
  if (input.requestNotes) lines.push(...requestNoteLines(input.requestNotes, ctx, cfg));

  lines.sort(
    (a, b) =>
      SEV_RANK[b.severity] - SEV_RANK[a.severity] ||
      b.priority - a.priority ||
      b.count - a.count ||
      cmp(a.id, b.id),
  );

  const bySection = {} as Record<SectionKey, SectionSummary>;
  for (const k of SECTION_KEYS) bySection[k] = { badge: 0, severity: null };
  let total = 0;
  let top: Severity | null = null;
  for (const l of lines) {
    if (l.badge <= 0) continue;
    total += l.badge;
    const s = bySection[l.section];
    s.badge += l.badge;
    s.severity = maxSeverity(s.severity, l.severity);
    top = maxSeverity(top, l.severity);
  }

  const needed: (keyof NotifyInput)[] = ['refill', 'inventory', 'requests', 'birthdays', 'notes', 'requestNotes'];
  if (canSeeCatalog(role)) needed.push('catalog');
  if (isOwner(role)) needed.push('subscription');
  const complete = needed.every((k) => input[k] !== undefined);
  const allClear = complete && total === 0;

  return { lines, total, bySection, topSeverity: top, complete, allClear, encouragement: allClear ? ALL_CLEAR_TEXT : null };
}
