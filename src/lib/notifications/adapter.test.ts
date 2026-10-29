/**
 * اختبارات محوّلات الإشعارات (adapter.ts). تُشغَّل بـ node:test بعد ترجمتها مع engine.ts.
 * الصفوف هنا بأشكالها الحقيقية (أعمدة الاستعلامات نفسها)، ودالة التأخر وحساب الأيام مُمرَّران كما يفعل المشغّل.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapBirthdays,
  mapCatalog,
  mapInventory,
  mapNotes,
  mapRefill,
  mapRequests,
  mapSubscription,
  type ChronicMedRow,
  type NoteRow,
  type OverdueReasonsFn,
  type PipelineRow,
  type RequestRow,
  type StockRow,
} from './adapter.js';
import { computeNotifications, makeConfig, type Routes } from './engine.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-29T09:00:00+03:00');
const TODAY_UTC = Date.parse('2026-10-29T00:00:00Z');

/** بديل calcDaysLeft: أيام تقويمية بين تاريخ الموعد (YYYY-MM-DD) و«اليوم» الثابت */
const daysLeftOf = (d: string): number => Math.round((Date.parse(`${d}T00:00:00Z`) - TODAY_UTC) / DAY);
/** تاريخ موعد يبعد n يوماً عن اليوم */
const due = (n: number): string => new Date(TODAY_UTC + n * DAY).toISOString().slice(0, 10);

const cashPipe = (over: Partial<PipelineRow> = {}): PipelineRow => ({
  payment_type: 'cash',
  pipeline_stage: 'due',
  reminded_at: null,
  stage_changed_at: '2026-10-20T08:00:00Z',
  ...over,
});

function med(patientId: string, name: string, drug: string, daysLeft: number, pipes: PipelineRow[] = []): ChronicMedRow {
  return {
    patient_id: patientId,
    medication_name: drug,
    next_refill_date: due(daysLeft),
    patients: { name, refill_tracking_pipeline: pipes },
  };
}

// ───────────────────────── المزمنون ─────────────────────────

test('refill: أصغر daysLeft بين أدوية المريض، ومريض واحد لكل patient_id', () => {
  const out = mapRefill([med('p1', 'سامي', 'A', 5), med('p1', 'سامي', 'B', 2), med('p1', 'سامي', 'C', 9)], daysLeftOf);
  assert.equal(out.length, 1);
  assert.equal(out[0].daysLeft, 2);
  assert.equal(out[0].name, 'سامي');
  assert.equal(out[0].stage, 'due');
});

test('refill: الحد 3 مقابل 4 أيام', () => {
  const out = mapRefill([med('a', 'ثلاثة', 'X', 3), med('b', 'أربعة', 'X', 4)], daysLeftOf);
  assert.deepEqual(out.map((p) => p.patientId), ['a']);
});

test('refill: السالب يمرّ كما هو (-14 و-15) ولا يقصّه المحوّل', () => {
  const out = mapRefill([med('a', 'أ', 'X', -14), med('b', 'ب', 'X', -15)], daysLeftOf);
  assert.deepEqual(out.map((p) => [p.patientId, p.daysLeft]).sort(), [['a', -14], ['b', -15]]);
});

test('refill: يُعتمد مسار payment_type = cash فقط', () => {
  // مسار غير نقدي بمرحلة messaged يُتجاهل، فيُعامَل المريض بلا مسار ⇒ due
  const rows = [med('a', 'أ', 'X', 1, [cashPipe({ payment_type: 'insurance', pipeline_stage: 'messaged', reminded_at: '2026-10-27T08:00:00Z' })])];
  const out = mapRefill(rows, daysLeftOf);
  assert.equal(out[0].stage, 'due');
  assert.equal(out[0].remindedAt, null);
  // والنقدي يُؤخذ حتى لو جاء بعد غير النقدي
  const rows2 = [med('a', 'أ', 'X', 1, [
    cashPipe({ payment_type: 'insurance', pipeline_stage: 'archived' }),
    cashPipe({ pipeline_stage: 'messaged', reminded_at: '2026-10-27T08:00:00Z' }),
  ])];
  assert.equal(mapRefill(rows2, daysLeftOf)[0].stage, 'messaged');
});

test('refill: تحويل المرحلة كما تشتقّها صفحة المزمنين', () => {
  const stage = (daysLeft: number, pipe: PipelineRow | null) =>
    mapRefill([med('a', 'أ', 'X', daysLeft, pipe ? [pipe] : [])], daysLeftOf)[0]?.stage;
  assert.equal(stage(2, null), 'due');
  assert.equal(stage(10, null), undefined); // ok وأيامه > 3: لا يُمرَّر
  assert.equal(stage(2, cashPipe({ pipeline_stage: 'renewed' })), 'due'); // جُدِّد ثم اقترب موعده ثانيةً
  assert.equal(stage(10, cashPipe({ pipeline_stage: 'renewed' })), undefined);
  assert.equal(stage(1, cashPipe({ pipeline_stage: 'archived' })), 'archived');
  assert.equal(stage(1, cashPipe({ pipeline_stage: 'pending' })), 'ok'); // قيمة قديمة بلا تبويب
  assert.equal(stage(20, cashPipe({ pipeline_stage: 'messaged', reminded_at: '2026-10-25T08:00:00Z' })), 'messaged');
  assert.equal(stage(20, cashPipe({ pipeline_stage: 'no_response' })), 'no_response');
});

test('refill: messaged يمرّ بالمخزَّن ومعه الطوابع، والاشتقاق للمحرّك', () => {
  const out = mapRefill([med('a', 'أ', 'X', -2, [cashPipe({ pipeline_stage: 'messaged', reminded_at: '2026-10-20T08:00:00Z', stage_changed_at: '2026-10-20T08:00:01Z' })])], daysLeftOf);
  assert.equal(out[0].stage, 'messaged'); // لا نكتب no_response هنا حتى لو انتهت المهلة
  assert.equal(out[0].remindedAt, '2026-10-20T08:00:00Z');
  assert.equal(out[0].stageChangedAt, '2026-10-20T08:00:01Z');
});

test('refill: تواريخ تالفة تُهمَل، والمسار المضمّن كائناً لا مصفوفة مقبول', () => {
  const bad: ChronicMedRow = { patient_id: 'x', medication_name: 'X', next_refill_date: 'not-a-date', patients: { name: 'س', refill_tracking_pipeline: [] } };
  const none: ChronicMedRow = { patient_id: 'y', medication_name: 'X', next_refill_date: null, patients: null };
  const single: ChronicMedRow = { patient_id: 'z', medication_name: 'X', next_refill_date: due(1), patients: [{ name: 'ع', refill_tracking_pipeline: cashPipe({ pipeline_stage: 'no_response' }) }] };
  const out = mapRefill([bad, none, single], (d) => (Number.isNaN(Date.parse(d)) ? NaN : daysLeftOf(d)));
  assert.deepEqual(out.map((p) => p.patientId), ['z']);
  assert.equal(out[0].stage, 'no_response');
});

// ───────────────────────── المخزون ─────────────────────────

const stockRow = (key: string, over: Partial<StockRow> = {}): StockRow => ({
  med_key: key,
  confirmed_at: '2026-10-28T08:00:00Z',
  boxes_remaining: 3,
  ...over,
});

test('inventory: تجميع بالاسم المطبَّع وأقرب موعد، ونافذة 14 يوماً', () => {
  const rows = [
    med('p1', 'أ', ' Metformin ', 10),
    med('p2', 'ب', 'metformin', 6),
    med('p3', 'ج', 'Insulin', 14),
    med('p4', 'د', 'Aspirin', 15),
  ];
  const items = mapInventory(rows, [], daysLeftOf);
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.deepEqual(Object.keys(byKey).sort(), ['insulin', 'metformin']);
  assert.equal(byKey.metformin.daysLeft, 6);
  assert.equal(byKey.metformin.name, 'Metformin');
  assert.equal(byKey.insulin.daysLeft, 14);
  assert.equal(byKey.metformin.confirmed, false);
});

test('inventory: التأكيد ساري فقط مع confirmed_at وboxes_remaining > 0', () => {
  const rows = [med('p1', 'أ', 'A', 5), med('p2', 'ب', 'B', 5), med('p3', 'ج', 'C', 5)];
  const stock = [
    stockRow('a'),
    stockRow('b', { confirmed_at: null }),
    stockRow('c', { boxes_remaining: 0 }),
  ];
  const items = Object.fromEntries(mapInventory(rows, stock, daysLeftOf).map((i) => [i.key, i.confirmed]));
  assert.deepEqual(items, { a: true, b: false, c: false });
});

test('inventory: مرضى المرحلة archived مستبعدون، وغيرهم يُحسبون حتى لو لم يقتربوا', () => {
  const rows = [
    med('arch', 'أ', 'Statin', 4, [cashPipe({ pipeline_stage: 'archived' })]),
    med('msg', 'ب', 'Statin', 9, [cashPipe({ pipeline_stage: 'messaged', reminded_at: '2026-10-28T08:00:00Z' })]),
    med('ok', 'ج', 'Beta', 12),
  ];
  const items = mapInventory(rows, [], daysLeftOf);
  assert.equal(items.find((i) => i.key === 'statin')?.daysLeft, 9);
  assert.ok(items.some((i) => i.key === 'beta'));
});

test('inventory: أسماء فارغة تُهمَل', () => {
  const blank: ChronicMedRow = { ...med('p1', 'أ', 'X', 3), medication_name: '   ' };
  assert.deepEqual(mapInventory([blank], [], daysLeftOf), []);
});

// ───────────────────────── الطلبات ─────────────────────────

/** بديل getOverdueReasons: البند متأخر إن كانت stage_changed_at قبل 2026-10-20 (يكفي لفحص التصنيف والعمر) */
const fakeOverdue: OverdueReasonsFn = (req) => {
  const late = req.items.filter((it) => it.stage !== 'delivered' && it.stage !== 'cancelled' && it.stage_changed_at && it.stage_changed_at < '2026-10-20');
  return late.length ? [{ itemIds: late.map((it) => it.id ?? '') }] : [];
};

function request(id: string, items: { id: string; stage: string; at: string }[], over: Partial<RequestRow> = {}): RequestRow {
  return {
    id,
    status: 'open',
    deposit: null,
    deposit_returned: null,
    cancelled_at: null,
    patient: { name: `مريض ${id}` },
    items: items.map((i) => ({ id: i.id, product_name: `منتج ${i.id}`, stage: i.stage, stage_changed_at: i.at })),
    ...over,
  };
}

test('requests: الأسبقية متأخر ثم إجراء ثم متابعة', () => {
  const rows = [
    request('late', [{ id: 'l1', stage: 'ordered', at: '2026-10-10T08:00:00Z' }, { id: 'l2', stage: 'recorded', at: '2026-10-28T08:00:00Z' }]),
    request('act', [{ id: 'a1', stage: 'ordered', at: '2026-10-28T08:00:00Z' }, { id: 'a2', stage: 'arrived', at: '2026-10-28T08:00:00Z' }]),
    request('fol', [{ id: 'f1', stage: 'ordered', at: '2026-10-28T08:00:00Z' }]),
  ];
  const out = mapRequests(rows, NOW, fakeOverdue);
  assert.deepEqual(Object.fromEntries(out.map((r) => [r.id, r.kind])), { late: 'overdue', act: 'action', fol: 'follow_up' });
});

test('requests: recorded يحتاج إجراء، وarrived كذلك', () => {
  const out = mapRequests([
    request('r', [{ id: '1', stage: 'recorded', at: '2026-10-28T08:00:00Z' }]),
    request('a', [{ id: '2', stage: 'arrived', at: '2026-10-28T08:00:00Z' }]),
  ], NOW, fakeOverdue);
  assert.deepEqual(out.map((r) => r.kind), ['action', 'action']);
});

test('requests: الملغى والمُسلَّم مستبعدان، وبنود delivered/cancelled لا تصنّف', () => {
  const rows = [
    request('c', [{ id: '1', stage: 'recorded', at: '2026-10-28T08:00:00Z' }], { status: 'cancelled' }),
    request('d', [{ id: '2', stage: 'delivered', at: '2026-10-28T08:00:00Z' }], { status: 'delivered' }),
    request('open-done', [{ id: '3', stage: 'delivered', at: '2026-10-28T08:00:00Z' }, { id: '4', stage: 'cancelled', at: '2026-10-28T08:00:00Z' }]),
    request('mixed', [{ id: '5', stage: 'delivered', at: '2026-10-01T08:00:00Z' }, { id: '6', stage: 'ordered', at: '2026-10-28T08:00:00Z' }]),
  ];
  const out = mapRequests(rows, NOW, fakeOverdue);
  assert.deepEqual(out.map((r) => [r.id, r.kind]), [['mixed', 'follow_up']]);
});

test('requests: ageDays بالأيام التقويمية لعمّان عبر منتصف الليل', () => {
  const age = (at: string) => mapRequests([request('x', [{ id: '1', stage: 'recorded', at }])], NOW, fakeOverdue)[0].ageDays;
  // الآن 29/10 الساعة 09:00 عمّان
  assert.equal(age('2026-10-28T21:30:00Z'), 0); // 00:30 يوم 29 بعمّان
  assert.equal(age('2026-10-28T20:59:00Z'), 1); // 23:59 يوم 28 بعمّان
  assert.equal(age('2026-10-27T21:00:00Z'), 1); // 00:00 يوم 28 بعمّان
  assert.equal(age('2026-10-25T09:00:00Z'), 4);
  // بعد منتصف الليل بدقيقة: «أمس» 23:59 يعدّ يوماً كاملاً
  const justAfter = Date.parse('2026-10-29T00:01:00+03:00');
  assert.equal(mapRequests([request('x', [{ id: '1', stage: 'recorded', at: '2026-10-28T20:59:00Z' }])], justAfter, fakeOverdue)[0].ageDays, 1);
});

test('requests: العمر من أقدم بند حسم الفئة لا من أحدثها', () => {
  const rows = [
    request('o', [
      { id: 'old', stage: 'ordered', at: '2026-10-10T08:00:00Z' }, // متأخر ⇒ يحسم overdue
      { id: 'new', stage: 'recorded', at: '2026-10-28T08:00:00Z' },
    ]),
    request('a', [
      { id: 'a1', stage: 'recorded', at: '2026-10-26T08:00:00Z' },
      { id: 'a2', stage: 'arrived', at: '2026-10-28T08:00:00Z' },
      { id: 'a3', stage: 'ordered', at: '2026-10-01T08:00:00Z' }, // لا يحسم الإجراء
    ]),
  ];
  const out = Object.fromEntries(mapRequests(rows, NOW, fakeOverdue).map((r) => [r.id, r]));
  assert.equal(out.o.ageDays, 19); // 10/10 → 29/10
  assert.equal(out.a.kind, 'overdue'); // a3 قديم جداً فهو متأخر بالبديل
  const rows2 = [request('b', [{ id: 'b1', stage: 'recorded', at: '2026-10-26T08:00:00Z' }, { id: 'b2', stage: 'arrived', at: '2026-10-28T08:00:00Z' }, { id: 'b3', stage: 'ordered', at: '2026-10-22T08:00:00Z' }])];
  const b = mapRequests(rows2, NOW, fakeOverdue)[0];
  assert.equal(b.kind, 'action');
  assert.equal(b.ageDays, 3); // أقدم بندي الإجراء (26/10)، لا بند ordered
});

test('requests: اسم المريض من كائن أو مصفوفة أو غائب، وبنود null لا تكسر', () => {
  const arr = request('a', [{ id: '1', stage: 'ordered', at: '2026-10-28T08:00:00Z' }], { patient: [{ name: '  ليلى ' }] });
  const none = request('b', [{ id: '2', stage: 'ordered', at: '2026-10-28T08:00:00Z' }], { patient: null });
  const nullItems: RequestRow = { ...request('c', []), items: null };
  const out = mapRequests([arr, none, nullItems], NOW, fakeOverdue);
  assert.deepEqual(out.map((r) => [r.id, r.patientName]), [['a', 'ليلى'], ['b', '']]);
});

// ───────────────────────── الكتالوج والاشتراك ─────────────────────────

test('catalog: عدّاد فاشل ⇒ undefined، وإلا القيم كما هي', () => {
  assert.equal(mapCatalog(null, 3, null), undefined);
  assert.equal(mapCatalog(10, null, null), undefined);
  assert.deepEqual(mapCatalog(0, 0, null), { totalProducts: 0, unconfirmed: 0, lastAddedAt: null });
  assert.deepEqual(mapCatalog(12, 4, '2026-10-01T08:00:00Z'), { totalProducts: 12, unconfirmed: 4, lastAddedAt: '2026-10-01T08:00:00Z' });
});

test('subscription: المراحل والأيام', () => {
  assert.equal(mapSubscription('', null, NOW), undefined);
  assert.equal(mapSubscription(undefined, null, NOW), undefined);
  assert.deepEqual(mapSubscription('active', null, NOW), { phase: 'active', daysLeft: null });
  assert.deepEqual(mapSubscription('grace', '2026-10-25', NOW), { phase: 'grace', daysLeft: 0 }); // لا يقل عن 0
  assert.equal(mapSubscription('expired', '2026-10-01', NOW)?.phase, 'expired');
  assert.equal(mapSubscription('trial', '2026-11-05', NOW)?.phase, 'trial');
  assert.equal(mapSubscription('something-else', '2026-11-05', NOW)?.phase, 'trial'); // كالهيدر: غير النشط «تجريبي»
  assert.equal(mapSubscription('active', '2026-11-12T09:00:00+03:00', NOW)?.daysLeft, 14);
  assert.equal(mapSubscription('active', '2026-11-12T09:00:01+03:00', NOW)?.daysLeft, 15); // ceil
  assert.equal(mapSubscription('active', 'garbage', NOW)?.daysLeft, null);
});

// ───────────────────────── الميلاد والملاحظات ─────────────────────────

test('birthdays: مطابقة الشهر واليوم واستبعاد من هُنّئ', () => {
  const patients = [
    { id: '1', name: 'اليوم', birth_date: '1980-10-29' },
    { id: '2', name: 'مُهنّأ', birth_date: '1991-10-29' },
    { id: '3', name: 'غداً', birth_date: '1980-10-30' },
    { id: '4', name: 'بلا تاريخ', birth_date: null },
    { id: '5', name: 'تالف', birth_date: '29/10' },
    { id: '6', name: 'شهر آخر', birth_date: '1980-09-29' },
  ];
  const out = mapBirthdays(patients, [{ patient_id: '2' }], 10, 29);
  assert.deepEqual(out, [{ patientId: '1', name: 'اليوم' }]);
});

test('birthdays: الأصفار البادئة وغياب أحد التهنئات', () => {
  const out = mapBirthdays([{ id: '1', name: 'ن', birth_date: '2000-01-05' }], [], 1, 5);
  assert.equal(out.length, 1);
  assert.equal(mapBirthdays([{ id: '1', name: 'ن', birth_date: '2000-01-05' }], [], 5, 1).length, 0);
});

test('notes: تحويل بلا نص ملاحظة أبداً', () => {
  const rows: NoteRow[] = [
    { id: 'n1', patient_id: 'p1', author_staff_id: 's1', author_name: ' منى ', created_at: '2026-10-28T08:00:00Z', closed_at: null, patient: { name: 'خالد' } },
    { id: 'n2', patient_id: 'p2', author_staff_id: null, author_name: null, created_at: '2026-10-27T08:00:00Z', closed_at: null, patient: [{ name: 'سلمى' }] },
  ];
  const out = mapNotes(rows);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { id: 'n1', patientId: 'p1', patientName: 'خالد', authorStaffId: 's1', authorName: 'منى', createdAt: '2026-10-28T08:00:00Z', closedAt: null });
  assert.equal(out[1].authorStaffId, null);
  assert.equal(out[1].patientName, 'سلمى');
  for (const n of out) assert.ok(!('body' in n), 'لا حقل body في مدخل الإشعار');
});

// ───────────────────────── تكامل مع المحرّك ─────────────────────────

const routes: Routes = {
  home: '/dashboard', chronic: '/dashboard/chronic', inventory: '/dashboard/chronic?view=inventory', requests: '/dashboard/requests',
  catalog: '/dashboard/pharmacy-catalog-manager', patients: '/dashboard/patients', account: '/dashboard/profile', patient: (id) => `/dashboard/patients/${id}`,
};

test('integration: مخرجات المحوّلات تدخل المحرّك وتعطي أرقاماً متسقة', () => {
  const meds = [
    med('p1', 'سامي', 'Metformin', 1),
    med('p2', 'ليلى', 'Metformin', 8),
    med('p3', 'نور', 'Statin', 2, [cashPipe({ pipeline_stage: 'messaged', reminded_at: '2026-10-20T08:00:00Z' })]),
  ];
  const input = {
    refill: mapRefill(meds, daysLeftOf),
    inventory: mapInventory(meds, [], daysLeftOf),
    requests: mapRequests([request('r1', [{ id: 'i1', stage: 'recorded', at: '2026-10-28T08:00:00Z' }])], NOW, fakeOverdue),
    birthdays: mapBirthdays([{ id: 'b', name: 'ب', birth_date: '1990-10-29' }], [], 10, 29),
    notes: mapNotes([]),
  };
  const s = computeNotifications(input, { now: NOW, role: 'staff', staffId: 's1' }, makeConfig(routes, 5));
  assert.equal(s.complete, true);
  assert.equal(s.bySection.chronic.badge, 2); // سامي (يوم واحد) + نور (بلا رد: مضت 9 أيام > مهلة 5)
  assert.equal(s.bySection.inventory.badge, 2); // Metformin + Statin
  assert.equal(s.bySection.requests.badge, 1);
  assert.equal(s.bySection.home.badge + s.bySection.patients.badge, 1); // عيد الميلاد
});

test('integration: مصدر ناقص (undefined) لا يعلن أن كل شيء مُنجَز', () => {
  const s = computeNotifications({ refill: [], inventory: [], requests: [], notes: [] }, { now: NOW, role: 'staff', staffId: null }, makeConfig(routes, 5));
  assert.equal(s.complete, false);
  assert.equal(s.allClear, false);
});
