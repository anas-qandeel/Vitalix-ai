/**
 * اختبارات N5: سطر «ملاحظات الزملاء» المجمَّع يفتح قائمة المرضى، وهذه القائمة لا تعرض لغير المالك شيئاً قبل البحث (مبدأ الحاجة للمعرفة).
 * فيصل غير المالك إلى صفحة فارغة. لذلك يُجمَّع للمالك وحده، ولكل غيره سطر لكل ملاحظة يفتح ملف مريضه مباشرة.
 * تُشغَّل بـ node:test بعد ترجمتها. لا تعتمد على أي شيء خارج engine.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNotifications,
  makeConfig,
  type NotifyContext,
  type NotifyInput,
  type OpenNote,
  type Role,
  type Routes,
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
const ctx = (role: Role, staffId: string | null = 's1'): NotifyContext => ({ now: NOW, role, staffId });
const run = (input: NotifyInput, role: Role, staffId: string | null = 's1') => computeNotifications(input, ctx(role, staffId), cfg);

const note = (id: string, o: Partial<OpenNote> = {}): OpenNote => ({
  id,
  patientId: `p${id}`,
  patientName: `م${id}`,
  authorStaffId: 's2',
  authorName: 'سمر',
  createdAt: at(0),
  closedAt: null,
  ...o,
});
const five = (): OpenNote[] => ['1', '2', '3', '4', '5'].map((id) => note(id));

const OWNER: Role = 'owner';
const NOT_OWNER: Role[] = ['pharmacist', 'assistant', 'staff'];
const ALL: Role[] = [OWNER, ...NOT_OWNER];

test('المالك: أكثر من ثلاث ملاحظات ⇒ سطر مجمَّع واحد إلى قائمة المرضى (كما كان)', () => {
  const s = run({ notes: five() }, OWNER);
  assert.deepEqual(s.lines.map((l) => l.id), ['notes']);
  assert.equal(s.lines[0].href, routes.patients);
  assert.equal(s.lines[0].count, 5);
  assert.equal(s.lines[0].badge, 5);
  assert.equal(s.total, 5);
});

for (const role of NOT_OWNER) {
  test(`غير المالك (${role}): أكثر من ثلاث ملاحظات ⇒ سطر لكل ملاحظة يفتح ملف مريضه، ولا سطر يقود إلى قائمة المرضى`, () => {
    const s = run({ notes: five() }, role);
    assert.deepEqual(s.lines.map((l) => l.id).sort(), ['notes:1', 'notes:2', 'notes:3', 'notes:4', 'notes:5']);
    for (const l of s.lines) {
      const id = l.id.slice('notes:'.length);
      assert.equal(l.kind, 'notes');
      assert.equal(l.section, 'patients');
      assert.equal(l.count, 1);
      assert.equal(l.badge, 1);
      assert.equal(l.href, `/dashboard/patients/p${id}`);
      assert.notEqual(l.href, routes.patients);
    }
    assert.equal(s.total, 5);
    assert.equal(s.bySection.patients.badge, 5);
  });
}

test('حدّ الثلاث: عند ثلاث ملاحظات سطر لكل ملاحظة لكل الأدوار، وعند أربع يُجمَّع للمالك وحده', () => {
  for (const role of ALL) {
    const three = run({ notes: [note('1'), note('2'), note('3')] }, role);
    assert.equal(three.lines.length, 3, role);
    assert.ok(three.lines.every((l) => l.href.startsWith('/dashboard/patients/p')), role);
    const four = run({ notes: [note('1'), note('2'), note('3'), note('4')] }, role);
    if (role === OWNER) assert.deepEqual(four.lines.map((l) => l.id), ['notes']);
    else assert.equal(four.lines.length, 4, role);
    assert.equal(four.total, 4, role);
  }
});

test('الأحدث أولاً لغير المالك أيضاً', () => {
  const list = [note('a', { createdAt: at(3) }), note('b', { createdAt: at(0) }), note('c', { createdAt: at(2) }), note('d', { createdAt: at(1) }), note('e', { createdAt: at(4) })];
  for (const role of NOT_OWNER) {
    assert.deepEqual(run({ notes: list }, role).lines.map((l) => l.id), ['notes:b', 'notes:d', 'notes:c', 'notes:a', 'notes:e'], role);
  }
});

test('الاستثناءات كما هي لغير المالك: ملاحظاتي والمغلقة والأقدم من سبعة أيام', () => {
  const list = [
    note('1'),
    note('2', { authorStaffId: 's1' }), // أنا
    note('3', { closedAt: at(0) }), // مغلقة
    note('4', { createdAt: at(7) }), // عمرها 7: تبقى
    note('5', { createdAt: at(8) }), // 8: تخرج
    note('6'),
    note('7'),
    note('8'),
  ];
  for (const role of NOT_OWNER) {
    const s = run({ notes: list }, role);
    assert.deepEqual(s.lines.map((l) => l.id).sort(), ['notes:1', 'notes:4', 'notes:6', 'notes:7', 'notes:8'], role);
    assert.equal(s.total, 5, role);
  }
  // والمالك: العدد نفسه لكن مجمَّعاً
  const o = run({ notes: list }, OWNER);
  assert.deepEqual(o.lines.map((l) => l.id), ['notes']);
  assert.equal(o.lines[0].count, 5);
});

test('أي قيمة دور غير owner (مثل «none» أو نص مجهول) ⇒ لا تجميع (الآمن عند الشك)', () => {
  for (const bad of ['none', '', 'admin', 'Owner']) {
    const s = computeNotifications({ notes: five() }, { now: NOW, role: bad as unknown as Role, staffId: 's1' }, cfg);
    assert.equal(s.lines.length, 5, bad);
    assert.ok(s.lines.every((l) => l.href !== routes.patients), bad);
  }
});

test('لا سطر من أي نوع يقود غير المالك إلى قائمة المرضى، وللمالك يبقى السطر المجمَّع', () => {
  const input: NotifyInput = {
    refill: [
      { patientId: 'r1', name: 'م1', daysLeft: -3, stage: 'due', remindedAt: null, stageChangedAt: null },
      { patientId: 'r2', name: 'م2', daysLeft: 2, stage: 'no_response', remindedAt: at(5), stageChangedAt: at(5) },
    ],
    inventory: [{ key: 'i1', name: 'د1', daysLeft: 3, confirmed: false }],
    requests: [
      { id: 'q1', patientName: 'ط1', kind: 'overdue', ageDays: 5 },
      { id: 'q2', patientName: 'ط2', kind: 'action', ageDays: 1 },
    ],
    birthdays: [{ patientId: 'b1', name: 'س1' }],
    notes: five(),
    requestNotes: ['1', '2', '3', '4', '5'].map((id) => ({
      id,
      requestId: `r${id}`,
      patientName: 'خالد',
      authorStaffId: 's2',
      authorName: 'سمر',
      createdAt: at(0),
    })),
    catalog: { totalProducts: 500, unconfirmed: 40, lastAddedAt: at(40) },
    subscription: { phase: 'grace', daysLeft: 3 },
  };
  for (const role of NOT_OWNER) {
    const s = run(input, role);
    assert.ok(s.lines.length > 5, role);
    for (const l of s.lines) assert.notEqual(l.href, routes.patients, `${role}: ${l.id} leads to the patients list`);
  }
  const o = run(input, OWNER);
  assert.ok(o.lines.some((l) => l.id === 'notes' && l.href === routes.patients));
});

// ─────────────── اختبار عشوائي بمقارنة مستقلة بالمتوقع ───────────────

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

test('عشوائي: العدد والروابط والتجميع حسب الدور (2000 حالة)', () => {
  const rnd = mulberry32(20261102);
  const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));
  for (let i = 0; i < 2000; i++) {
    const role = ALL[int(0, ALL.length - 1)];
    const staffId = rnd() < 0.2 ? null : 's1';
    const count = int(0, 12);
    const list: OpenNote[] = Array.from({ length: count }, (_, k) =>
      note(`n${k}`, {
        authorStaffId: rnd() < 0.3 ? 's1' : 's2',
        createdAt: at(int(0, 10)),
        closedAt: rnd() < 0.2 ? at(0) : null,
      }),
    );
    // المتوقع مستقلاً عن المحرّك: غير مغلقة، ليست لي (حين تُعرف هويتي)، وعمرها ≤ 7 أيام
    const expected = list.filter((n) => n.closedAt === null && (staffId === null || n.authorStaffId !== staffId) && Math.round((NOW - Date.parse(n.createdAt)) / DAY) <= 7);
    const s = run({ notes: list }, role, staffId);
    const lines = s.lines.filter((l) => l.kind === 'notes');
    assert.equal(s.total, expected.length);
    if (role === OWNER && expected.length > 3) {
      assert.equal(lines.length, 1);
      assert.equal(lines[0].id, 'notes');
      assert.equal(lines[0].count, expected.length);
      assert.equal(lines[0].href, routes.patients);
    } else {
      assert.equal(lines.length, expected.length);
      assert.deepEqual(lines.map((l) => l.id).sort(), expected.map((n) => `notes:${n.id}`).sort());
      for (const l of lines) {
        assert.equal(l.count, 1);
        assert.ok(l.href.startsWith('/dashboard/patients/p'));
      }
    }
    if (role !== OWNER) for (const l of s.lines) assert.notEqual(l.href, routes.patients);
  }
});
