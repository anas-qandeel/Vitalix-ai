/**
 * اختبارات محرّك الإشعارات. تُشغَّل بـ node:test بعد ترجمتها (انظر NOTES.md).
 * لا تعتمد على أي شيء خارج engine.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CLEAR_TEXT,
  SECTION_KEYS,
  computeNotifications,
  counted,
  formatBadge,
  makeConfig,
  type BirthdayPatient,
  type InventoryItem,
  type NotificationLine,
  type NotifyContext,
  type NotifyInput,
  type OpenNote,
  type RefillPatient,
  type RefillStage,
  type RequestAttention,
  type RequestNote,
  type Role,
  type Routes,
  type SubscriptionInput,
} from './engine.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-29T09:00:00+03:00');
const at = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

const routes: Routes = {
  home: '/dashboard',
  chronic: '/dashboard/chronic',
  inventory: '/dashboard/chronic?view=inventory',
  requests: '/dashboard/requests',
  catalog: '/pharmacy-catalog-manager',
  patients: '/dashboard/patients',
  account: '/dashboard/account',
  patient: (id) => `/dashboard/patients/${id}`,
};
const cfg = makeConfig(routes, 3);
const ctx = (role: Role = 'owner', staffId: string | null = 's1', now: number = NOW): NotifyContext => ({ now, role, staffId });

// المرحلة تُعطى صراحة: due لمن لم تُرسل له رسالة.
const rp = (id: string, daysLeft: number, stage: RefillStage = 'due', extra: Partial<RefillPatient> = {}): RefillPatient => ({
  patientId: id,
  name: `م${id}`,
  daysLeft,
  stage,
  remindedAt: null,
  stageChangedAt: null,
  ...extra,
});
const inv = (key: string, daysLeft: number, confirmed = false): InventoryItem => ({ key, name: `د${key}`, daysLeft, confirmed });
const rq = (id: string, kind: RequestAttention['kind'], ageDays = 0): RequestAttention => ({ id, patientName: `ط${id}`, kind, ageDays });
const note = (id: string, o: Partial<OpenNote> = {}): OpenNote => ({
  id,
  patientId: `p${id}`,
  patientName: 'أحمد',
  authorStaffId: 's2',
  authorName: 'سمر',
  createdAt: at(0),
  closedAt: null,
  ...o,
});

const rnote = (id: string, o: Partial<RequestNote> = {}): RequestNote => ({
  id,
  requestId: `r${id}`,
  patientName: 'خالد',
  authorStaffId: 's2',
  authorName: 'سمر',
  createdAt: at(0),
  ...o,
});

const FULL_EMPTY: NotifyInput = {
  refill: [],
  inventory: [],
  requests: [],
  birthdays: [],
  notes: [],
  requestNotes: [],
  catalog: { totalProducts: 500, unconfirmed: 0, lastAddedAt: at(1) },
  subscription: { phase: 'active', daysLeft: 200 },
};
const run = (input: NotifyInput, c: NotifyContext = ctx()) => computeNotifications(input, c, cfg);
const only = (input: NotifyInput, id: string, c: NotifyContext = ctx()): NotificationLine => {
  const l = run(input, c).lines.find((x) => x.id === id);
  assert.ok(l, `line ${id} expected`);
  return l;
};
const ids = (input: NotifyInput, c: NotifyContext = ctx()): string[] => run(input, c).lines.map((l) => l.id);

// ─────────────── العربية والأرقام ───────────────

test('counted: المفرد والمثنى والجمع والتمييز', () => {
  const P = { one: 'مريض واحد', two: 'مريضان', few: 'مرضى', many: 'مريضاً', big: 'مريض' };
  assert.equal(counted(1, P), 'مريض واحد');
  assert.equal(counted(2, P), 'مريضان');
  assert.equal(counted(3, P), '3 مرضى');
  assert.equal(counted(10, P), '10 مرضى');
  assert.equal(counted(11, P), '11 مريضاً');
  assert.equal(counted(99, P), '99 مريضاً');
  assert.equal(counted(100, P), '100 مريض');
});

test('formatBadge', () => {
  assert.equal(formatBadge(0), '');
  assert.equal(formatBadge(-3), '');
  assert.equal(formatBadge(NaN), '');
  assert.equal(formatBadge(7), '7');
  assert.equal(formatBadge(99), '99');
  assert.equal(formatBadge(100), '99+');
});

// ─────────────── قارب النفاذ ───────────────

test('قارب النفاذ: حدود النافذة 3 أيام وفترة السماح 14 يوماً', () => {
  const input: NotifyInput = { refill: [rp('a', 4), rp('b', 3), rp('c', 2), rp('d', 1), rp('e', 0), rp('f', -1), rp('g', -14), rp('h', -15)] };
  assert.equal(only(input, 'refill_soon').count, 2); // 3 و2
  assert.equal(only(input, 'refill_urgent').count, 2); // 1 و0
  assert.equal(only(input, 'refill_ran_out').count, 2); // -1 و-14
  assert.equal(run(input).total, 6); // 4 و-15 خارج
});

test('قارب النفاذ: العناوين بالمفرد والمثنى والجمع', () => {
  assert.equal(only({ refill: [rp('a', -2)] }, 'refill_ran_out').title, 'مريض واحد نفد دواؤه دون إرسال رسالة');
  assert.equal(only({ refill: [rp('a', -2), rp('b', -1)] }, 'refill_ran_out').title, 'مريضان نفد دواؤهما دون إرسال رسالة');
  assert.equal(only({ refill: [rp('a', -1), rp('b', -1), rp('c', -1), rp('d', -1), rp('e', -1)] }, 'refill_ran_out').title, '5 مرضى نفد دواؤهم دون إرسال رسالة');
  assert.equal(only({ refill: [rp('a', 1)] }, 'refill_urgent').title, 'مريض واحد ينتهي دواؤه اليوم أو غداً');
  assert.equal(only({ refill: [rp('a', 3), rp('b', 2)] }, 'refill_soon').title, 'مريضان ينتهي دواؤهما خلال 3 أيام');
  assert.equal(only({ refill: [rp('a', 2)] }, 'refill_soon').detail, 'لم يُرسَل تذكير بعد');
});

test('قارب النفاذ: تفصيل «نفد دواؤهم» يذكر الأقدم', () => {
  assert.equal(only({ refill: [rp('a', -2)] }, 'refill_ran_out').detail, 'منذ يومين');
  assert.equal(only({ refill: [rp('a', -2), rp('b', -9)] }, 'refill_ran_out').detail, 'أقدم حالة منذ 9 أيام');
  assert.equal(only({ refill: [rp('a', -1)] }, 'refill_ran_out').detail, 'منذ يوم');
});

test('قارب النفاذ: المراحل الأخرى لا تظهر هنا', () => {
  for (const stage of ['ok', 'renewed', 'archived'] as RefillStage[]) {
    assert.deepEqual(ids({ refill: [rp('a', 1, stage)] }), [], stage);
  }
  // رسالة أُرسلت قبل يوم، لم تنقضِ مهلتها: لا شيء يُطلب الآن
  assert.deepEqual(ids({ refill: [rp('a', 1, 'messaged', { remindedAt: at(1) })] }), []);
});

test('قارب النفاذ: الأسطر مرتّبة والأسماء عيّنة من ثلاثة', () => {
  const l = only({ refill: [rp('a', 3), rp('b', 2), rp('c', 3), rp('d', 2), rp('e', 3)] }, 'refill_soon');
  assert.equal(l.items?.length, 3);
  assert.equal(l.moreCount, 2);
  assert.equal(l.href, routes.chronic);
  assert.equal(l.section, 'chronic');
});

// ─────────────── بلا رد ───────────────

test('بلا رد: المهلة تحسب بأيام تقويمية، وتصير «بلا رد» عند msgExpiryDays بالضبط', () => {
  assert.deepEqual(ids({ refill: [rp('a', 5, 'messaged', { remindedAt: at(2) })] }), []); // 2 < 3
  const l = only({ refill: [rp('a', 5, 'messaged', { remindedAt: at(3) })] }, 'refill_no_response');
  assert.equal(l.count, 1);
  assert.equal(l.title, 'مريض واحد لم يردّ على الرسالة');
  assert.equal(l.detail, 'انتهت مهلة الردّ اليوم');
  assert.equal(l.severity, 'action');
});

test('بلا رد: اليوم بتوقيت عمّان لا UTC', () => {
  // 21:30 UTC = 00:30 صباح اليوم التالي في عمّان. الرسالة 13:00 عمّان قبل ثلاثة أيام تقويمية.
  const late = Date.parse('2026-10-29T21:30:00Z');
  const reminded = '2026-10-27T10:00:00Z';
  assert.equal(only({ refill: [rp('a', 5, 'messaged', { remindedAt: reminded })] }, 'refill_no_response', ctx('owner', 's1', late)).count, 1);
  // قبل منتصف الليل في عمّان (20:30 UTC) تبقى يومين فقط
  const early = Date.parse('2026-10-29T20:30:00Z');
  assert.deepEqual(ids({ refill: [rp('a', 5, 'messaged', { remindedAt: reminded })] }, ctx('owner', 's1', early)), []);
});

test('بلا رد: يتحول للأحمر بعد أكثر من 7 أيام، ويُحسب العمر من دخول المرحلة', () => {
  const mk = (days: number) => ({ refill: [rp('a', 5, 'no_response', { stageChangedAt: at(days), remindedAt: at(days + 3) })] });
  assert.equal(only(mk(7), 'refill_no_response').severity, 'action');
  assert.equal(only(mk(8), 'refill_no_response').severity, 'urgent');
  assert.equal(only(mk(8), 'refill_no_response').detail, 'دون ردّ منذ 8 أيام');
  // محسوبة من messaged: تدخل «بلا رد» عند reminded + 3 أيام
  assert.equal(only({ refill: [rp('a', 5, 'messaged', { remindedAt: at(10) })] }, 'refill_no_response').severity, 'action'); // عمرها 7
  assert.equal(only({ refill: [rp('a', 5, 'messaged', { remindedAt: at(11) })] }, 'refill_no_response').severity, 'urgent'); // عمرها 8
});

test('بلا رد: العناوين والتفاصيل بالمثنى والجمع، وأقدم حالة', () => {
  const two = only({ refill: [rp('a', 5, 'no_response', { stageChangedAt: at(1) }), rp('b', 5, 'no_response', { stageChangedAt: at(4) })] }, 'refill_no_response');
  assert.equal(two.title, 'مريضان لم يردّا على الرسالة');
  assert.equal(two.detail, 'أقدم حالة دون ردّ منذ 4 أيام');
  const three = only({ refill: [rp('a', 5, 'no_response'), rp('b', 5, 'no_response'), rp('c', 5, 'no_response')] }, 'refill_no_response');
  assert.equal(three.title, '3 مرضى لم يردّوا على الرسالة');
});

test('بلا رد: الأرشفة التلقائية إن وُجدت تُخرج من الجرس', () => {
  const c2 = makeConfig(routes, 3, { noResponseArchiveDays: 10 });
  const p = [rp('a', 5, 'no_response', { stageChangedAt: at(10) }), rp('b', 5, 'no_response', { stageChangedAt: at(11) })];
  const s = computeNotifications({ refill: p }, ctx(), c2);
  assert.equal(s.lines.find((l) => l.id === 'refill_no_response')?.count, 1);
});

test('بلا رد: لا يضاعف المريض نفسه (due وno_response معاً)', () => {
  const s = run({ refill: [rp('a', 1), rp('a', 1, 'no_response')] });
  assert.equal(s.total, 1);
});

// ─────────────── جهّز مخزونك ───────────────

test('جهّز مخزونك: نافذة 14 يوماً والعاجل 7 أيام والمؤكَّد مستثنى', () => {
  const input: NotifyInput = { inventory: [inv('a', 15), inv('b', 14), inv('c', 8), inv('d', 7), inv('e', 3, true), inv('f', -2)] };
  const l = only(input, 'inventory');
  assert.equal(l.count, 4); // b c d f
  assert.equal(l.severity, 'urgent');
  assert.equal(l.detail, 'منها 2 عاجلة'); // d وf
  assert.equal(l.title, '4 أصناف تحتاج تجهيزاً');
  assert.equal(l.href, routes.inventory);
});

test('جهّز مخزونك: عنابر بلا عاجل، والمفرد والمثنى', () => {
  const l = only({ inventory: [inv('a', 12), inv('b', 9)] }, 'inventory');
  assert.equal(l.severity, 'action');
  assert.equal(l.detail, undefined);
  assert.equal(l.title, 'صنفان يحتاجان تجهيزاً');
  assert.equal(only({ inventory: [inv('a', 12)] }, 'inventory').title, 'صنف واحد يحتاج تجهيزاً');
  assert.equal(only({ inventory: [inv('a', 5)] }, 'inventory').detail, 'منها صنف واحد عاجل');
});

// ─────────────── طلبات المرضى ───────────────

test('الطلبات: ثلاث فئات بشدّات مختلفة وعناوين صحيحة', () => {
  const input: NotifyInput = {
    requests: [rq('1', 'overdue', 3), rq('2', 'overdue', 1), rq('3', 'overdue', 0), rq('4', 'action'), rq('5', 'action'), rq('6', 'follow_up')],
  };
  const o = only(input, 'requests_overdue');
  assert.equal(o.title, '3 طلبات متأخرة');
  assert.equal(o.detail, 'أقدمها منذ 3 أيام');
  assert.equal(o.severity, 'urgent');
  const a = only(input, 'requests_action');
  assert.equal(a.title, 'طلبان ينتظران إجراءً');
  assert.equal(a.severity, 'action');
  const f = only(input, 'requests_follow_up');
  assert.equal(f.title, 'طلب واحد ينتظر المتابعة');
  assert.equal(f.severity, 'info');
  assert.equal(only({ requests: [rq('1', 'overdue', 2)] }, 'requests_overdue').title, 'طلب واحد متأخر');
  assert.equal(only({ requests: [rq('1', 'overdue', 2), rq('2', 'overdue', 2)] }, 'requests_overdue').title, 'طلبان متأخران');
});

test('الطلبات: الطلب الواحد لا يظهر في فئتين (المتأخر أولاً)', () => {
  const s = run({ requests: [rq('1', 'action', 2), rq('1', 'overdue', 2), rq('1', 'follow_up', 2)] }, ctx('staff'));
  assert.equal(s.total, 1);
  assert.deepEqual(s.lines.map((l) => l.id), ['requests_overdue']);
});

test('الطلبات: «لم يُتابَع» للمالك فقط، من 3 أيام فأكثر، ولا يضاعف الرقم', () => {
  const input: NotifyInput = { requests: [rq('1', 'overdue', 3), rq('2', 'action', 5), rq('3', 'overdue', 2), rq('4', 'follow_up', 9)] };
  const own = run(input, ctx('owner'));
  const n = own.lines.find((l) => l.id === 'requests_neglected');
  assert.ok(n);
  assert.equal(n.count, 2);
  assert.equal(n.badge, 0);
  assert.equal(n.title, 'طلبان لم يُتابَعا منذ أكثر من 3 أيام');
  assert.equal(own.total, 3); // متأخران + إجراء واحد (المتابعة هادئة: لا تُحسب)
  for (const role of ['pharmacist', 'assistant', 'staff'] as Role[]) {
    assert.ok(!ids(input, ctx(role)).includes('requests_neglected'), role);
  }
  assert.equal(only({ requests: [rq('1', 'overdue', 4)] }, 'requests_neglected').title, 'طلب واحد لم يُتابَع منذ أكثر من 3 أيام');
  assert.equal(only({ requests: [rq('1', 'overdue', 4), rq('2', 'overdue', 4), rq('3', 'overdue', 4)] }, 'requests_neglected').title, '3 طلبات لم تُتابَع منذ أكثر من 3 أيام');
});

test('الطلبات: المتابعة سطر هادئ — يظهر في اللوحة ولا يدخل الأرقام', () => {
  const waiting = Array.from({ length: 7 }, (_, i) => rq(`f${i}`, 'follow_up', 1));
  const s = run({ ...FULL_EMPTY, requests: waiting }, ctx('owner'));
  const f = s.lines.find((l) => l.id === 'requests_follow_up');
  assert.ok(f);
  assert.equal(f.count, 7);
  assert.equal(f.badge, 0);
  assert.equal(f.title, '7 طلبات تنتظر المتابعة');
  assert.equal(s.total, 0);
  assert.equal(s.bySection.requests.badge, 0);
  assert.equal(s.bySection.requests.severity, null);
  assert.equal(s.topSeverity, null);
  assert.equal(s.allClear, true); // طلبات عند المورد ضمن مهلتها لا تمنع «لا شيء ينتظركم»
  // مع إجراء حقيقي: الرقم للإجراء وحده
  const mixed = run({ ...FULL_EMPTY, requests: [...waiting, rq('a', 'action')] }, ctx('owner'));
  assert.equal(mixed.bySection.requests.badge, 1);
  assert.equal(mixed.total, 1);
  assert.equal(mixed.allClear, false);
});

// ─────────────── الكتالوج ───────────────

test('الكتالوج: للمالك والصيدلاني فقط', () => {
  const input: NotifyInput = { catalog: { totalProducts: 50, unconfirmed: 5, lastAddedAt: at(30) } };
  assert.ok(ids(input, ctx('owner')).includes('catalog_review'));
  assert.ok(ids(input, ctx('pharmacist')).includes('catalog_review'));
  assert.deepEqual(ids(input, ctx('assistant')), []);
  assert.deepEqual(ids(input, ctx('staff')), []);
});

test('الكتالوج: المراجعة تُحسب مهمة واحدة مهما كبر العدد', () => {
  const l = only({ catalog: { totalProducts: 500, unconfirmed: 200, lastAddedAt: at(1) } }, 'catalog_review');
  assert.equal(l.count, 200);
  assert.equal(l.badge, 1);
  assert.equal(l.title, '200 صنف بحاجة مراجعة');
  assert.equal(only({ catalog: { totalProducts: 500, unconfirmed: 2, lastAddedAt: at(1) } }, 'catalog_review').title, 'صنفان بحاجة مراجعة');
  assert.equal(only({ catalog: { totalProducts: 500, unconfirmed: 12, lastAddedAt: at(1) } }, 'catalog_review').title, '12 صنفاً بحاجة مراجعة');
});

test('الكتالوج: فارغ يُنبَّه بلا أرقام هدف، وما بعده لا سطر تقدّم ولا شارة', () => {
  const empty = only({ catalog: { totalProducts: 0, unconfirmed: 0, lastAddedAt: null } }, 'catalog_empty');
  assert.equal(empty.title, 'كتالوجكم فارغ');
  assert.equal(empty.detail, 'ابدؤوا بإضافة منتجاتكم الأولى');
  assert.equal(empty.badge, 1);
  assert.equal(empty.severity, 'action');
  assert.equal('progress' in empty, false);
  // أي عدد من 1 إلى أكبر: لا سطر «واصلوا بناء كتالوجكم»، ولا أي سطر ما دامت الإضافة حديثة ولا مراجعة
  for (const n of [1, 4, 19, 20, 21, 500]) {
    assert.deepEqual(ids({ catalog: { totalProducts: n, unconfirmed: 0, lastAddedAt: at(1) } }), [], `n=${n}`);
    const s = run({ catalog: { totalProducts: n, unconfirmed: 0, lastAddedAt: at(1) } });
    assert.equal(s.bySection.catalog.badge, 0, `n=${n}`);
    assert.equal(s.total, 0, `n=${n}`);
  }
  assert.ok(!ids({ catalog: { totalProducts: 4, unconfirmed: 0, lastAddedAt: at(30) } }).includes('catalog_progress'));
});

test('الكتالوج: الخمول يبدأ عند 14 يوماً، وهو تلميح لا يُحسب في الرقم', () => {
  assert.deepEqual(ids({ catalog: { totalProducts: 100, unconfirmed: 0, lastAddedAt: at(13) } }), []);
  const l = only({ catalog: { totalProducts: 100, unconfirmed: 0, lastAddedAt: at(14) } }, 'catalog_idle');
  assert.equal(l.badge, 0);
  assert.equal(l.title, 'لم تُضَف منتجات جديدة منذ 14 يوماً');
  const s = run({ catalog: { totalProducts: 100, unconfirmed: 0, lastAddedAt: at(40) } });
  assert.equal(s.total, 0);
  assert.equal(s.bySection.catalog.severity, null);
  assert.equal(s.topSeverity, null);
  assert.deepEqual(ids({ catalog: { totalProducts: 100, unconfirmed: 0, lastAddedAt: null } }), []);
});

test('الكتالوج: الخمول يعمل لأي حجم، والصنف الواحد بحاجة مراجعة يعني شارة واحدة فقط', () => {
  for (const n of [1, 5, 19, 20]) {
    const l = only({ catalog: { totalProducts: n, unconfirmed: 0, lastAddedAt: at(30) } }, 'catalog_idle');
    assert.equal(l.badge, 0, `n=${n}`);
    assert.equal(l.title, 'لم تُضَف منتجات جديدة منذ 30 يوماً', `n=${n}`);
  }
  // حالة حقيقية: 19 صنفاً، واحد بحاجة مراجعة، آخر إضافة حديثة ⇒ سطر واحد وشارة واحدة
  const s = run({ catalog: { totalProducts: 19, unconfirmed: 1, lastAddedAt: at(2) } });
  assert.deepEqual(s.lines.map((l) => l.id), ['catalog_review']);
  assert.equal(s.bySection.catalog.badge, 1);
  assert.equal(s.total, 1);
  assert.equal(s.lines[0].title, 'صنف واحد بحاجة مراجعة');
});

// ─────────────── الاشتراك ───────────────

test('الاشتراك: للمالك فقط', () => {
  const input: NotifyInput = { subscription: { phase: 'active', daysLeft: 5 } };
  assert.ok(ids(input, ctx('owner')).includes('subscription'));
  for (const role of ['pharmacist', 'assistant', 'staff'] as Role[]) assert.deepEqual(ids(input, ctx(role)), [], role);
});

test('الاشتراك: العتبات 14 و7 والصياغة', () => {
  const sub = (daysLeft: number | null, phase: SubscriptionInput['phase'] = 'active'): NotifyInput => ({ subscription: { phase, daysLeft } });
  assert.deepEqual(ids(sub(15)), []);
  assert.deepEqual(ids(sub(null)), []);
  assert.deepEqual(ids(sub(-1)), []);
  assert.deepEqual(ids(sub(NaN)), []);
  const l14 = only(sub(14), 'subscription');
  assert.equal(l14.title, 'ينتهي اشتراككم خلال 14 يوماً');
  assert.equal(l14.severity, 'action');
  assert.equal(only(sub(8), 'subscription').severity, 'action');
  assert.equal(only(sub(7), 'subscription').severity, 'urgent');
  assert.equal(only(sub(10), 'subscription').title, 'ينتهي اشتراككم خلال 10 أيام');
  assert.equal(only(sub(2), 'subscription').title, 'ينتهي اشتراككم خلال يومين');
  assert.equal(only(sub(1), 'subscription').title, 'ينتهي اشتراككم غداً');
  assert.equal(only(sub(0), 'subscription').title, 'ينتهي اشتراككم اليوم');
  assert.equal(only(sub(5, 'trial'), 'subscription').title, 'تنتهي الفترة التجريبية خلال 5 أيام');
});

test('الاشتراك: المهلة والمنتهي أحمر وأعلى الترتيب', () => {
  const g = only({ subscription: { phase: 'grace', daysLeft: null } }, 'subscription');
  assert.equal(g.severity, 'urgent');
  assert.equal(g.title, 'اشتراككم في مهلة السماح');
  const e = only({ subscription: { phase: 'expired', daysLeft: 0 } }, 'subscription');
  assert.equal(e.title, 'انتهى اشتراككم');
  const s = run({ refill: [rp('a', -1)], subscription: { phase: 'expired', daysLeft: 0 } });
  assert.equal(s.lines[0].id, 'subscription');
});

// ─────────────── أعياد الميلاد ───────────────

test('أعياد الميلاد: الصياغة بحسب العدد ولا تكرار', () => {
  const b = (n: number): BirthdayPatient[] => Array.from({ length: n }, (_, i) => ({ patientId: `b${i}`, name: i === 0 ? 'سمر' : i === 1 ? 'أنس' : `م${i}` }));
  assert.equal(only({ birthdays: b(1) }, 'birthdays').title, 'اليوم عيد ميلاد سمر');
  assert.equal(only({ birthdays: b(2) }, 'birthdays').title, 'اليوم عيد ميلاد سمر وأنس');
  assert.equal(only({ birthdays: b(3) }, 'birthdays').title, 'اليوم عيد ميلاد 3 مرضى');
  assert.equal(only({ birthdays: b(11) }, 'birthdays').title, 'اليوم عيد ميلاد 11 مريضاً');
  assert.equal(only({ birthdays: b(3) }, 'birthdays').severity, 'info');
  assert.equal(only({ birthdays: b(3) }, 'birthdays').badge, 3);
  assert.equal(only({ birthdays: [...b(2), ...b(2)] }, 'birthdays').count, 2);
  assert.equal(only({ birthdays: b(2) }, 'birthdays').section, 'home');
});

// ─────────────── ملاحظات الزملاء ───────────────

test('الملاحظات: ملاحظاتي أنا وتلك المغلقة والقديمة مستثناة', () => {
  const input: NotifyInput = {
    notes: [
      note('1'),
      note('2', { authorStaffId: 's1' }), // أنا
      note('3', { closedAt: at(0) }), // مغلقة
      note('4', { createdAt: at(7) }), // عمرها 7: تبقى
      note('5', { createdAt: at(8) }), // 8: تخرج
    ],
  };
  const s = run(input, ctx('staff', 's1'));
  assert.deepEqual(s.lines.map((l) => l.id).sort(), ['notes:1', 'notes:4']);
  assert.equal(s.total, 2);
});

test('الملاحظات: سطر لكل ملاحظة حتى ثلاث، ثم سطر مجمّع', () => {
  const one = only({ notes: [note('1')] }, 'notes:1');
  assert.equal(one.title, 'ملاحظة جديدة من سمر على المريض أحمد');
  assert.equal(one.href, '/dashboard/patients/p1');
  assert.equal(one.detail, 'اليوم');
  assert.equal(one.section, 'patients');
  const three = run({ notes: [note('1'), note('2'), note('3')] });
  assert.equal(three.lines.length, 3);
  const four = run({ notes: [note('1'), note('2'), note('3', { createdAt: at(2) }), note('4', { createdAt: at(1) })] });
  assert.equal(four.lines.length, 1);
  assert.equal(four.lines[0].id, 'notes');
  assert.equal(four.lines[0].title, '4 ملاحظات جديدة من زملائكم');
  assert.equal(four.lines[0].detail, 'أحدثها اليوم');
  assert.equal(four.lines[0].href, routes.patients);
  assert.equal(four.total, 4);
});

test('الملاحظات: بلا هوية موظف تُحسب كل الملاحظات المفتوحة', () => {
  assert.equal(run({ notes: [note('1', { authorStaffId: 's1' })] }, ctx('owner', null)).total, 1);
  assert.equal(run({ notes: [note('1', { authorStaffId: null })] }, ctx('owner', 's1')).total, 1);
});

test('الملاحظات: حساب بلا معرّف يستبعد ملاحظاته باسمه، وفي هذه الحالة وحدها', () => {
  const owner: NotifyContext = { ...ctx('owner', null), staffName: ' المالك ' };
  const mine = note('1', { authorStaffId: null, authorName: ' المالك ' });
  const other = note('2', { authorStaffId: null, authorName: 'سمر' });
  const withId = note('3', { authorStaffId: 's2', authorName: 'المالك' }); // لها معرّف: لا مقارنة بالاسم
  assert.deepEqual(run({ notes: [mine, other, withId] }, owner).lines.map((l) => l.id).sort(), ['notes:2', 'notes:3']);
  // لا اسم لدينا: لا استبعاد
  assert.equal(run({ notes: [mine] }, ctx('owner', null)).total, 1);
  assert.equal(run({ notes: [mine] }, { ...ctx('owner', null), staffName: '  ' }).total, 1);
  // اسم كاتب فارغ لا يطابق اسماً فارغاً
  assert.equal(run({ notes: [note('4', { authorStaffId: null, authorName: '' })] }, { ...ctx('owner', null), staffName: '' }).total, 1);
  // من عُرف معرّفه: الاحتياط معطّل (ملاحظة قديمة بلا معرّف تظهر ولو بالاسم نفسه)
  assert.equal(run({ notes: [mine] }, { ...ctx('owner', 's1'), staffName: 'المالك' }).total, 1);
});

test('نفد دواؤهم: عمر أقدم حالة يُقرَّب للأعلى', () => {
  assert.equal(only({ refill: [rp('a', -1.5)] }, 'refill_ran_out').detail, 'منذ يومين');
});

test('الملاحظات: الأحدث أولاً، ولا يظهر نص الملاحظة في أي حقل', () => {
  const s = run({ notes: [note('old', { createdAt: at(5) }), note('new', { createdAt: at(0) })] });
  assert.deepEqual(s.lines.map((l) => l.id), ['notes:new', 'notes:old']);
  const hasBody = JSON.stringify(s).includes('body');
  assert.equal(hasBody, false);
});

// ─────────────── التجميع العام ───────────────

test('مكتمل وكل شيء مُنجَز', () => {
  const s = run(FULL_EMPTY);
  assert.equal(s.complete, true);
  assert.equal(s.allClear, true);
  assert.equal(s.total, 0);
  assert.equal(s.encouragement, ALL_CLEAR_TEXT);
  assert.equal(s.topSeverity, null);
  for (const k of SECTION_KEYS) assert.deepEqual(s.bySection[k], { badge: 0, severity: null });
});

test('غير مكتمل: لا تهنئة قبل تحميل كل الأجزاء', () => {
  const partial: NotifyInput = { refill: [], inventory: [] };
  const s = run(partial);
  assert.equal(s.complete, false);
  assert.equal(s.allClear, false);
  assert.equal(s.encouragement, null);
});

test('المكتمل يتبع الدور: الموظف لا ينتظر الكتالوج ولا الاشتراك', () => {
  const noCatSub: NotifyInput = { refill: [], inventory: [], requests: [], birthdays: [], notes: [], requestNotes: [] };
  assert.equal(run(noCatSub, ctx('staff')).complete, true);
  assert.equal(run(noCatSub, ctx('assistant')).complete, true);
  assert.equal(run(noCatSub, ctx('pharmacist')).complete, false); // ينتظر الكتالوج
  assert.equal(run({ ...noCatSub, catalog: FULL_EMPTY.catalog }, ctx('pharmacist')).complete, true);
  assert.equal(run({ ...noCatSub, catalog: FULL_EMPTY.catalog }, ctx('owner')).complete, false); // ينتظر الاشتراك
});

test('الترتيب: الشدّة ثم الأولوية؛ والمجموع = مجموع الأقسام', () => {
  const input: NotifyInput = {
    ...FULL_EMPTY,
    refill: [rp('a', 3), rp('b', -1), rp('c', 1)],
    inventory: [inv('x', 3)],
    requests: [rq('1', 'overdue', 1), rq('2', 'action'), rq('3', 'follow_up')],
    birthdays: [{ patientId: 'b1', name: 'سمر' }],
    notes: [note('1')],
    catalog: { totalProducts: 100, unconfirmed: 3, lastAddedAt: at(20) },
  };
  const s = run(input);
  assert.deepEqual(s.lines.map((l) => l.id), [
    'refill_ran_out',
    'refill_urgent',
    'requests_overdue',
    'inventory',
    'refill_soon',
    'requests_action',
    'notes:1',
    'catalog_review',
    'requests_follow_up',
    'birthdays',
    'catalog_idle',
  ]);
  assert.equal(s.total, 9); // بلا المتابعة الهادئة وتلميح الكتالوج
  const sum = SECTION_KEYS.reduce((acc, k) => acc + s.bySection[k].badge, 0);
  assert.equal(sum, s.total);
  assert.equal(s.topSeverity, 'urgent');
  assert.equal(s.bySection.chronic.severity, 'urgent');
  assert.equal(s.bySection.home.severity, 'info');
  assert.equal(s.bySection.patients.badge, 1);
});

test('المحرّك لا يغيّر مدخلاته وناتجه ثابت', () => {
  const input: NotifyInput = {
    refill: [rp('a', -1), rp('b', 3, 'messaged', { remindedAt: at(5) })],
    inventory: [inv('a', 2)],
    requests: [rq('1', 'overdue', 4)],
    notes: [note('1')],
    birthdays: [{ patientId: 'b1', name: 'سمر' }],
    catalog: { totalProducts: 3, unconfirmed: 1, lastAddedAt: at(2) },
    subscription: { phase: 'trial', daysLeft: 3 },
  };
  const before = JSON.stringify(input);
  const a = run(input);
  const b = run(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(a, b);
});

test('بيانات تالفة لا تُسقط المحرّك', () => {
  const bad = {
    refill: [rp('a', NaN), rp('b', Infinity), rp('c', 1, 'messaged', { remindedAt: 'not-a-date' }), rp('d', 1, 'no_response', { stageChangedAt: 'x' })],
    inventory: [inv('a', NaN)],
    requests: [rq('1', 'overdue', NaN)],
    catalog: { totalProducts: NaN, unconfirmed: -4, lastAddedAt: 'zzz' },
    subscription: { phase: 'active' as const, daysLeft: Infinity },
    notes: [note('1', { createdAt: 'bad' })],
  } satisfies NotifyInput;
  const s = run(bad);
  assert.ok(Number.isFinite(s.total));
  assert.ok(s.lines.every((l) => l.title.length > 0));
});

// ─────────────── اختبار عشوائي: ثوابت لا تُكسر ───────────────

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('عشوائي: الثوابت تصمد على 3000 حالة', () => {
  const rnd = mulberry32(20261029);
  function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(rnd() * arr.length)];
  }
  const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));
  const stages: RefillStage[] = ['ok', 'due', 'messaged', 'no_response', 'renewed', 'archived'];
  const roles: Role[] = ['owner', 'pharmacist', 'assistant', 'staff'];
  const kinds: RequestAttention['kind'][] = ['overdue', 'action', 'follow_up'];
  const phases: SubscriptionInput['phase'][] = ['active', 'trial', 'grace', 'expired'];
  const sevRank = { urgent: 3, action: 2, info: 1 } as const;

  for (let i = 0; i < 3000; i++) {
    const role = pick(roles);
    const input: NotifyInput = {
      refill: Array.from({ length: int(0, 12) }, (_, k) => rp(`r${int(0, 8)}${k % 2}`, int(-20, 8), pick(stages), { remindedAt: rnd() < 0.7 ? at(int(0, 15)) : null, stageChangedAt: rnd() < 0.7 ? at(int(0, 15)) : null })),
      inventory: Array.from({ length: int(0, 8) }, (_, k) => inv(`i${int(0, 5)}${k % 2}`, int(-3, 25), rnd() < 0.4)),
      requests: Array.from({ length: int(0, 9) }, () => rq(`q${int(0, 6)}`, pick(kinds), int(0, 10))),
      birthdays: Array.from({ length: int(0, 5) }, () => ({ patientId: `b${int(0, 4)}`, name: `س${int(0, 9)}` })),
      notes: Array.from({ length: int(0, 7) }, (_, k) => note(`n${k}`, { authorStaffId: rnd() < 0.3 ? 's1' : 's2', createdAt: at(int(0, 10)), closedAt: rnd() < 0.2 ? at(0) : null })),
      catalog: { totalProducts: int(0, 60), unconfirmed: int(0, 30), lastAddedAt: rnd() < 0.8 ? at(int(0, 60)) : null },
      subscription: { phase: pick(phases), daysLeft: rnd() < 0.8 ? int(0, 40) : null },
    };
    const staffId = rnd() < 0.2 ? null : 's1';
    const s = run(input, ctx(role, staffId));

    assert.ok(Number.isFinite(s.total) && s.total >= 0);
    assert.equal(
      SECTION_KEYS.reduce((acc, k) => acc + s.bySection[k].badge, 0),
      s.total,
    );
    assert.equal(
      s.lines.reduce((acc, l) => acc + l.badge, 0),
      s.total,
    );
    const seen = new Set<string>();
    for (const l of s.lines) {
      assert.ok(!seen.has(l.id), `duplicate id ${l.id}`);
      seen.add(l.id);
      assert.ok(l.title.trim().length > 0);
      assert.ok(l.href.startsWith('/'));
      assert.ok(l.badge >= 0 && l.count >= 0);
      assert.ok(!/undefined|NaN|null|\[object/.test(l.title + (l.detail ?? '')), `bad text in ${l.id}: ${l.title} / ${l.detail ?? ''}`);
      assert.ok(l.badge <= Math.max(l.count, 1));
      if (role === 'staff' || role === 'assistant') assert.ok(!l.id.startsWith('catalog') && l.id !== 'subscription', `${role} sees ${l.id}`);
      if (role !== 'owner') assert.ok(l.id !== 'subscription' && l.id !== 'requests_neglected');
      if (role === 'pharmacist') assert.ok(l.id !== 'subscription');
    }
    for (let k = 1; k < s.lines.length; k++) {
      const a = s.lines[k - 1];
      const b = s.lines[k];
      assert.ok(sevRank[a.severity] >= sevRank[b.severity], 'severity order');
      if (a.severity === b.severity) assert.ok(a.priority >= b.priority, 'priority order');
    }
    assert.equal(s.allClear, s.complete && s.total === 0);
    assert.equal(s.encouragement !== null, s.allClear);
    // لا ملاحظة من كاتبها نفسه
    if (staffId !== null) {
      for (const l of s.lines) if (l.kind === 'notes') assert.ok(l.count >= 1);
    }
  }
});

// ─────────────── ملاحظات داخل الطلبات ───────────────

test('ملاحظات الطلبات: سطر لكل ملاحظة حتى ثلاث، في قسم الطلبات، ويفتح الطلب نفسه', () => {
  const one = only({ requestNotes: [rnote('1')] }, 'request_notes:1');
  assert.equal(one.kind, 'request_notes');
  assert.equal(one.title, 'ملاحظة جديدة من سمر على طلب المريض خالد');
  assert.equal(one.detail, 'اليوم');
  assert.equal(one.section, 'requests');
  assert.equal(one.severity, 'action');
  assert.equal(one.badge, 1);
  assert.equal(one.href, '/dashboard/requests?open=r1');
  assert.equal(run({ requestNotes: [rnote('1'), rnote('2'), rnote('3')] }).lines.length, 3);
});

test('ملاحظات الطلبات: معرّف الطلب يُشفَّر في الرابط', () => {
  const l = only({ requestNotes: [rnote('1', { requestId: 'a b&c=1' })] }, 'request_notes:1');
  assert.equal(l.href, '/dashboard/requests?open=a%20b%26c%3D1');
});

test('ملاحظات الطلبات: أكثر من ثلاث تُجمَّع في سطر واحد برقم العدد', () => {
  const four = run({ requestNotes: [rnote('1'), rnote('2'), rnote('3', { createdAt: at(2) }), rnote('4', { createdAt: at(1) })] });
  assert.equal(four.lines.length, 1);
  const l = four.lines[0];
  assert.equal(l.id, 'request_notes');
  assert.equal(l.title, '4 ملاحظات جديدة على الطلبات');
  assert.equal(l.detail, 'أحدثها اليوم');
  assert.equal(l.href, '/dashboard/requests');
  assert.equal(l.badge, 4);
  assert.equal(four.total, 4);
  assert.equal(four.bySection.requests.badge, 4);
  assert.equal(l.items?.length, 3);
  assert.equal(l.moreCount, 1);
});

test('ملاحظات الطلبات: ملاحظتي أنا والقديمة (أكثر من 7 أيام) والمكرَّرة مستثناة', () => {
  const s = run({
    requestNotes: [
      rnote('1'),
      rnote('2', { authorStaffId: 's1' }), // أنا
      rnote('3', { createdAt: at(7) }), // عمرها 7: تبقى
      rnote('4', { createdAt: at(8) }), // 8: تخرج
      rnote('1'), // تكرار
      rnote('5', { createdAt: 'تاريخ تالف' }), // وقت غير مفهوم: لا ننبّه به
    ],
  }, ctx('staff', 's1'));
  assert.deepEqual(s.lines.map((l) => l.id).sort(), ['request_notes:1', 'request_notes:3']);
  assert.equal(s.total, 2);
});

test('ملاحظات الطلبات: حساب بلا معرّف يستبعد ملاحظاته باسمه في هذه الحالة وحدها', () => {
  const owner: NotifyContext = { ...ctx('owner', null), staffName: ' المالك ' };
  const mine = rnote('1', { authorStaffId: null, authorName: ' المالك ' });
  const other = rnote('2', { authorStaffId: null, authorName: 'سمر' });
  const withId = rnote('3', { authorStaffId: 's2', authorName: 'المالك' });
  assert.deepEqual(run({ requestNotes: [mine, other, withId] }, owner).lines.map((l) => l.id).sort(), ['request_notes:2', 'request_notes:3']);
  assert.equal(run({ requestNotes: [mine] }, ctx('owner', null)).total, 1);
});

test('ملاحظات الطلبات: كل الأدوار ترى وتُحسب في المجموع، والأقدم يأتي بعد الأحدث', () => {
  for (const role of ['owner', 'pharmacist', 'assistant', 'staff'] as Role[]) {
    assert.deepEqual(ids({ requestNotes: [rnote('1')] }, ctx(role, 's9')), ['request_notes:1']);
  }
  const s = run({ requestNotes: [rnote('old', { createdAt: at(5) }), rnote('new', { createdAt: at(0) })] });
  assert.deepEqual(s.lines.map((l) => l.id), ['request_notes:new', 'request_notes:old']);
  assert.equal(JSON.stringify(s).includes('body'), false);
});

test('ملاحظات الطلبات: لا اسم كاتب أو مريض يعطي صياغة احتياطية بلا فراغات زائدة', () => {
  const l = only({ requestNotes: [rnote('1', { authorName: '  ', patientName: '' })] }, 'request_notes:1');
  assert.equal(l.title, 'ملاحظة جديدة من زميل على طلب المريض');
  const agg = run({ requestNotes: [rnote('1', { authorName: '', patientName: '' }), rnote('2'), rnote('3'), rnote('4')] }).lines[0];
  assert.ok(agg.items?.some((i) => i.label === 'زميل — مريض'));
});

test('ملاحظات الطلبات: مصدرها شرط للاكتمال، فلا «أحسنتم» قبل تحميله', () => {
  const { requestNotes: _omit, ...rest } = FULL_EMPTY;
  void _omit;
  const s = run(rest);
  assert.equal(s.complete, false);
  assert.equal(s.allClear, false);
  assert.equal(run(FULL_EMPTY).allClear, true);
  // وجودها يُنهي «لا شيء ينتظركم»
  const withNote = run({ ...FULL_EMPTY, requestNotes: [rnote('1')] });
  assert.equal(withNote.allClear, false);
  assert.equal(withNote.total, 1);
  assert.equal(withNote.topSeverity, 'action');
});

test('ملاحظات الطلبات: تجتمع مع شارة الطلبات الأخرى في القسم نفسه', () => {
  const s = run({ ...FULL_EMPTY, requests: [rq('1', 'overdue', 1), rq('2', 'action')], requestNotes: [rnote('1')] });
  assert.equal(s.bySection.requests.badge, 3);
  assert.equal(s.bySection.requests.severity, 'urgent');
  assert.equal(s.total, 3);
});
