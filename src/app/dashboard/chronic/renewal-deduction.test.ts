/**
 * اختبارات خصم المخزون بعد تجديد في صفحة المزمنين.
 * الخلل الذي تحميه: كان الخصم يمرّ على كل أدوية المريض وبعدد العلب القديم المخزَّن، بدل الأدوية التي حُدّدت للتجديد وبالعلب المُدخلة.
 * تُشغَّل بـ node:test بعد ترجمتها. لا تعتمد على أي شيء خارج renewal-deduction.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxesToDeduct, inventoryKey, renewalDeductions, type DeductionSource } from './renewal-deduction.js';

const med = (name: string, boxes: unknown, selected: boolean): DeductionSource => ({ medication_name: name, boxes_count: boxes, selected });

test('السيناريو الأصلي: ثلاثة أدوية لكل منها علبتان محفوظتان، حُدّد الأول فقط وأُدخلت له 3 علب ⇒ يُطرح الأول وحده وبثلاث علب', () => {
  const meds = [med('A', 3, true), med('B', 2, false), med('C', 2, false)];
  assert.deepEqual(renewalDeductions(meds, true), [{ key: 'a', boxes: 3 }]);
});

test('تجديد: الأدوية المحدَّدة فقط وبالترتيب نفسه', () => {
  const meds = [med('Aa', 1, true), med('Bb', 4, false), med('Cc', 2, true), med('Dd', 5, false), med('Ee', 1, true)];
  assert.deepEqual(renewalDeductions(meds, true), [
    { key: 'aa', boxes: 1 },
    { key: 'cc', boxes: 2 },
    { key: 'ee', boxes: 1 },
  ]);
});

test('تجديد دواء واحد محدَّد ⇒ مدخل واحد، وتجديد الكل ⇒ مدخل لكل دواء', () => {
  assert.equal(renewalDeductions([med('X', 1, true)], true).length, 1);
  assert.equal(renewalDeductions([med('X', 1, true), med('Y', 1, true), med('Z', 1, true)], true).length, 3);
});

test('لا دواء محدَّد أو قائمة فارغة ⇒ لا شيء', () => {
  assert.deepEqual(renewalDeductions([med('A', 2, false), med('B', 2, false)], true), []);
  assert.deepEqual(renewalDeductions([], true), []);
  assert.deepEqual(renewalDeductions([], false), []);
});

test('تسجيل جديد (ليس تجديداً) ⇒ لا خصم حتى لو كانت الصفوف محدَّدة', () => {
  assert.deepEqual(renewalDeductions([med('A', 2, true), med('B', 1, true)], false), []);
});

test('يُستعمل عدد العلب المُدخل في النافذة، وليس علبة واحدة افتراضية ولا العدد القديم', () => {
  assert.deepEqual(renewalDeductions([med('A', 1, true)], true), [{ key: 'a', boxes: 1 }]);
  assert.deepEqual(renewalDeductions([med('A', 2, true)], true), [{ key: 'a', boxes: 2 }]);
  assert.deepEqual(renewalDeductions([med('A', 7, true)], true), [{ key: 'a', boxes: 7 }]);
});

test('مفتاح المخزون: تقليم الفراغات وحروف صغيرة، والأسماء العربية كما هي', () => {
  assert.equal(inventoryKey('  Metformin 500mg  '), 'metformin 500mg');
  assert.equal(inventoryKey('GLUCOPHAGE'), 'glucophage');
  assert.equal(inventoryKey('ميتفورمين 500'), 'ميتفورمين 500');
  assert.deepEqual(renewalDeductions([med('  Amlodipine 5MG ', 1, true)], true), [{ key: 'amlodipine 5mg', boxes: 1 }]);
});

test('عدد العلب: لا يقل عن علبة، والنص الرقمي يُقرأ رقماً، وغير الرقمي علبة واحدة، والكسر لا يُقرَّب', () => {
  const cases: Array<[unknown, number]> = [
    [1, 1], [2, 2], [10, 10],
    ['3', 3], [' 4 ', 4],
    [0, 1], [-5, 1], ['0', 1], ['', 1], ['  ', 1],
    [Number.NaN, 1], [undefined, 1], [null, 1], ['abc', 1], [Number.POSITIVE_INFINITY, 1], [Number.NEGATIVE_INFINITY, 1],
    [2.5, 2.5], ['1.5', 1.5], [0.5, 1],
  ];
  for (const [raw, want] of cases) assert.equal(boxesToDeduct(raw), want, `raw=${String(raw)}`);
});

test('قيمة علب غير رقمية في دواء محدَّد تعطي علبة واحدة، وفي دواء غير محدَّد لا تعطي شيئاً ولا ترمي', () => {
  const meds = [med('A', 'abc', true), med('B', undefined, false), med('C', '', true)];
  assert.deepEqual(renewalDeductions(meds, true), [{ key: 'a', boxes: 1 }, { key: 'c', boxes: 1 }]);
});

test('اسمان متطابقان بالمفتاح يبقيان مدخلين منفصلين (كل صرف يُطرح على حدة)', () => {
  const meds = [med('Dup', 1, true), med('dup ', 2, true)];
  assert.deepEqual(renewalDeductions(meds, true), [{ key: 'dup', boxes: 1 }, { key: 'dup', boxes: 2 }]);
});

test('لا تُعدِّل المدخلات', () => {
  const meds = [med('A', '2', true), med('B', 3, false)].map((m) => Object.freeze(m));
  const frozen = Object.freeze(meds);
  const before = JSON.stringify(frozen);
  renewalDeductions(frozen, true);
  renewalDeductions(frozen, false);
  assert.equal(JSON.stringify(frozen), before);
});

test('النتيجة مصفوفة جديدة في كل استدعاء', () => {
  const meds = [med('A', 1, true)];
  assert.notEqual(renewalDeductions(meds, true), renewalDeductions(meds, true));
  assert.notEqual(renewalDeductions(meds, false), renewalDeductions(meds, false));
  assert.notEqual(renewalDeductions([], true), renewalDeductions([], true));
});

// ─────────────── اختبار عشوائي: المتوقع يُبنى مع التوليد نفسه، لا من إعادة كتابة الدالة ───────────────

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

test('عشوائي: المحدَّد فقط وبالعدد المُدخل ومفتاح موحَّد (3000 حالة)', () => {
  const rnd = mulberry32(20261102);
  const int = (a: number, b: number): number => a + Math.floor(rnd() * (b - a + 1));
  const names = ['Metformin', 'amlodipine 5mg', 'GLUCOPHAGE', 'ميتفورمين', 'Aspirin 81', 'bisoprolol'];
  for (let i = 0; i < 3000; i++) {
    const count = int(0, 8);
    const isRenewal = rnd() < 0.8;
    const meds: DeductionSource[] = [];
    const want: Array<{ key: string; boxes: number }> = [];
    for (let k = 0; k < count; k++) {
      const base = names[int(0, names.length - 1)];
      const padL = ' '.repeat(int(0, 2));
      const padR = ' '.repeat(int(0, 2));
      const selected = rnd() < 0.5;
      const kind = int(0, 5);
      let raw: unknown;
      let boxes: number;
      if (kind === 0) { boxes = int(1, 9); raw = boxes; }
      else if (kind === 1) { boxes = int(1, 9); raw = String(boxes); }
      else if (kind === 2) { raw = int(-3, 0); boxes = 1; }
      else if (kind === 3) { raw = ['', 'x', undefined, null, Number.NaN][int(0, 4)]; boxes = 1; }
      else if (kind === 4) { boxes = int(1, 9) + 0.5; raw = boxes; }
      else { boxes = int(1, 9); raw = ` ${boxes} `; }
      meds.push({ medication_name: padL + base + padR, boxes_count: raw, selected });
      if (isRenewal && selected) want.push({ key: base.toLowerCase(), boxes });
    }
    assert.deepEqual(renewalDeductions(meds, isRenewal), want, `case ${i}`);
  }
});
