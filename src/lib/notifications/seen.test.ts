/**
 * اختبارات «رأيتُ» (seen.ts): تخزين لكل جهاز وموظف، قصّ، قصّ العدد، تخزين محجوب، واشتراك.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { addSeen, loadSeen, seenId, seenKeyOf, subscribeSeen } from './seen.js';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-01T10:00:00Z');

class FakeStorage {
  data = new Map<string, string>();
  fail: 'none' | 'get' | 'set' | 'both' = 'none';
  getItem(k: string): string | null {
    if (this.fail === 'get' || this.fail === 'both') throw new Error('blocked');
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    if (this.fail === 'set' || this.fail === 'both') throw new Error('quota');
    this.data.set(k, v);
  }
}

const g = globalThis as unknown as { localStorage?: FakeStorage };
function withStorage(fn: (st: FakeStorage) => void): void {
  const prev = g.localStorage;
  const st = new FakeStorage();
  g.localStorage = st;
  try { fn(st); } finally { g.localStorage = prev; }
}
let n = 0;
const fresh = (): string => `ph${++n}:staff${n}`;

test('seenKeyOf: الصيدلية + الموظف (المعرّف أولاً ثم الاسم)، ولا يتصادم موظفان', () => {
  assert.equal(seenKeyOf({ pharmacyId: 'p', staffId: 's1', staffName: 'سمر' }), 'p:s1');
  assert.equal(seenKeyOf({ pharmacyId: 'p', staffId: null, staffName: 'المالك' }), 'p:n:المالك');
  assert.equal(seenKeyOf({ pharmacyId: 'p', staffId: null, staffName: null }), 'p:');
  assert.equal(seenKeyOf({}), ':');
  assert.notEqual(seenKeyOf({ pharmacyId: 'p', staffId: 's1' }), seenKeyOf({ pharmacyId: 'p', staffId: 's2' }));
  assert.notEqual(seenKeyOf({ pharmacyId: 'p1', staffId: 's1' }), seenKeyOf({ pharmacyId: 'p2', staffId: 's1' }));
});

test('seenId: النوع يسبق المعرّف فلا يتصادم جدولان', () => {
  assert.equal(seenId('pn', 'x'), 'pn:x');
  assert.equal(seenId('rn', 'x'), 'rn:x');
  assert.notEqual(seenId('pn', 'x'), seenId('rn', 'x'));
});

test('addSeen/loadSeen: يحفظ ويقرأ، ويعيد false حين لا جديد', () => {
  withStorage(() => {
    const k = fresh();
    assert.equal(loadSeen(k).size, 0);
    assert.equal(addSeen(k, ['pn:1', 'rn:2'], T0), true);
    assert.deepEqual([...loadSeen(k)].sort(), ['pn:1', 'rn:2']);
    assert.equal(addSeen(k, ['pn:1'], T0 + 1000), false);
    assert.equal(addSeen(k, [], T0), false);
  });
});

test('addSeen: يكتب صيغة JSON صالحة تحت مفتاح الإصدار الأول', () => {
  withStorage((st) => {
    const k = fresh();
    addSeen(k, ['pn:a'], T0);
    const raw = st.data.get(`vd-notif-seen:v1:${k}`);
    assert.ok(raw);
    assert.deepEqual(JSON.parse(raw), { 'pn:a': T0 });
  });
});

test('العزل: كل موظف على الجهاز نفسه له قائمته', () => {
  withStorage(() => {
    const a = fresh(), b = fresh();
    addSeen(a, ['pn:1'], T0);
    assert.equal(loadSeen(a).has('pn:1'), true);
    assert.equal(loadSeen(b).has('pn:1'), false);
  });
});

test('القصّ: ما تجاوز 30 يوماً يسقط عند أول كتابة جديدة، وما دونه يبقى', () => {
  withStorage(() => {
    const k = fresh();
    addSeen(k, ['pn:old'], T0);
    addSeen(k, ['pn:mid'], T0 + 20 * DAY);
    addSeen(k, ['pn:new'], T0 + 31 * DAY);
    const s = loadSeen(k);
    assert.equal(s.has('pn:old'), false);
    assert.equal(s.has('pn:mid'), true);
    assert.equal(s.has('pn:new'), true);
  });
});

test('القصّ بالعدد: الأحدث 500 فقط', () => {
  withStorage(() => {
    const k = fresh();
    const ids = Array.from({ length: 520 }, (_, i) => `pn:${i}`);
    for (let i = 0; i < ids.length; i++) addSeen(k, [ids[i]], T0 + i * 1000);
    const s = loadSeen(k);
    assert.equal(s.size, 500);
    assert.equal(s.has('pn:519'), true);
    assert.equal(s.has('pn:20'), true);
    assert.equal(s.has('pn:19'), false);
    assert.equal(s.has('pn:0'), false);
  });
});

test('تخزين محجوب أو ممتلئ: لا استثناء، وتبقى القائمة في الذاكرة لهذه الجلسة', () => {
  withStorage((st) => {
    const k = fresh();
    st.fail = 'both';
    assert.doesNotThrow(() => addSeen(k, ['pn:1'], T0));
    assert.equal(loadSeen(k).has('pn:1'), true);
    st.fail = 'set';
    assert.doesNotThrow(() => addSeen(k, ['pn:2'], T0));
    assert.equal(loadSeen(k).has('pn:2'), true);
  });
});

test('بلا localStorage أصلاً (خادم): لا استثناء', () => {
  const prev = g.localStorage;
  g.localStorage = undefined;
  try {
    const k = fresh();
    assert.doesNotThrow(() => addSeen(k, ['pn:1'], T0));
    assert.equal(loadSeen(k).has('pn:1'), true);
  } finally { g.localStorage = prev; }
});

test('محتوى تالف في التخزين يُتجاهل ولا يكسر القراءة ولا الكتابة', () => {
  withStorage((st) => {
    const k = fresh();
    for (const bad of ['{not json', '[1,2]', '"x"', 'null', '123']) {
      st.data.set(`vd-notif-seen:v1:${k}`, bad);
      assert.equal(loadSeen(k).size, 0, bad);
    }
    st.data.set(`vd-notif-seen:v1:${k}`, JSON.stringify({ 'pn:ok': T0, 'pn:bad': 'x', 'pn:nan': null }));
    assert.deepEqual([...loadSeen(k)], ['pn:ok']);
    assert.equal(addSeen(k, ['pn:new'], T0), true);
    assert.deepEqual([...loadSeen(k)].sort(), ['pn:new', 'pn:ok']);
  });
});

test('الاشتراك: يُستدعى عند إضافة جديد فقط، ويتوقف بعد الإلغاء', () => {
  withStorage(() => {
    const k = fresh();
    let calls = 0;
    const off = subscribeSeen(() => { calls++; });
    addSeen(k, ['pn:1'], T0);
    assert.equal(calls, 1);
    addSeen(k, ['pn:1'], T0); // لا جديد
    assert.equal(calls, 1);
    addSeen(k, ['pn:2'], T0);
    assert.equal(calls, 2);
    off();
    addSeen(k, ['pn:3'], T0);
    assert.equal(calls, 2);
  });
});

test('الاشتراك: مشتركان مستقلان، وإلغاء أحدهما لا يوقف الآخر', () => {
  withStorage(() => {
    const k = fresh();
    let a = 0, b = 0;
    const offA = subscribeSeen(() => { a++; });
    const offB = subscribeSeen(() => { b++; });
    addSeen(k, ['pn:1'], T0);
    offA();
    addSeen(k, ['pn:2'], T0);
    assert.deepEqual([a, b], [1, 2]);
    offB();
  });
});
