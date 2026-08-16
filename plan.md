# إعادة بناء نص رسالة المريض — حالة لكل دواء

يُلغي/يُغطّي هذا التعديل المقترحَ السابق في `plan.md` (صياغة الجملة الواحدة "قد نفد/سيكفيكم") — استُبدل بقالب أكثر تفصيلاً بناءً على طلب لاحق. لم يُطبَّق أي شيء بعد.

الملف: `src/components/WaMsgModal.tsx` (مكوّن مشترك بين dashboard وchronic).

## إجابات الأسئلة

### 1. حساب `days` لكل دواء حالياً

`calcDaysLeft(m.next_refill_date)` — مستوردة من `@/lib/chronic` (سطر 4). تُستخدم في:
- سطر 14: `urgentMeds = meds.filter(m => calcDaysLeft(m.next_refill_date) <= 3)`
- سطر 15: `optionalMeds = meds.filter(m => { const d = calcDaysLeft(...); return d > 3 && d <= 5; })`
- سطر 71، 97: حساب `d` لكل دواء داخل قوائم المعاينة بالواجهة (لا علاقة لها بنص الرسالة نفسه)

### 2. دالة الجمع العربي المتاحة

في `@/lib/chronic` يوجد:
- `pluralizeDaysLeft` (**مُصدَّرة**) — تُنتج جملة كاملة ("متبقي يوم واحد"، "ينفد اليوم"، "متأخر 3 أيام") — **لا تطابق** الصياغة المطلوبة هنا ("يكفي"/"يكفيكم").
- `pluralizeDays` (**غير مُصدَّرة** — خاصة بالملف) — دالة الجمع **الخام** بلا بادئة (`يوم واحد`/`يومان`/`X أيام`/`X يوماً`) — **هذه المطلوبة بالضبط**.

**المقترح:** تصدير `pluralizeDays` من `lib/chronic.ts` (إضافة `export` فقط):
```diff
-function pluralizeDays(days: number): string {
+export function pluralizeDays(days: number): string {
   if (days === 1) return 'يوم واحد';
   if (days === 2) return 'يومان';
   if (days <= 10) return `${days} أيام`;
   return `${days} يوماً`;
 }
```
لا يغيّر أي سلوك حالي (لا في هذا الملف ولا في `chronic/page.tsx`/`dashboard/page.tsx` — كلاهما له نسخته المحلية المنفصلة بنفس الاسم، غير متأثرة).

## نقطتان تحتاجان تأكيداً

1. **msg2 (الرسالة الثانية):** الطلب لا يذكر `msgType` إطلاقاً. بناءً على الاتفاق السابق (msg2 لا تحتوي تناقضاً، صياغتها "تذكّرنا بكم واحتفظنا بـ..." محايدة أصلاً) — **القالب الجديد يُطبَّق على `msg1` فقط، وmsg2 تبقى دون أي تغيير.**
2. **اسم الصيدلية:** القالب المطلوب لا يذكر `{pharmacyName}` إطلاقاً (خلافاً للنص الحالي "نُبلّغكم من {الصيدلية}"). نُفِّذ القالب حرفياً بلا اسم الصيدلية أدناه — إن أردت إضافته أخبرني.

---

## الكود المقترح (بلا تطبيق)

### `src/lib/chronic.ts`
```diff
-function pluralizeDays(days: number): string {
+export function pluralizeDays(days: number): string {
   if (days === 1) return 'يوم واحد';
   if (days === 2) return 'يومان';
   if (days <= 10) return `${days} أيام`;
   return `${days} يوماً`;
 }
```

### `src/components/WaMsgModal.tsx`

الاستيراد:
```diff
-import { Patient, ChronicMed, calcDaysLeft } from '@/lib/chronic';
+import { Patient, ChronicMed, calcDaysLeft, pluralizeDays } from '@/lib/chronic';
```

بناء النص (يستبدل حساب `previewMsg` الحالي، سطر 27-36):
```ts
const previewMeds = [
  ...urgentMeds,
  ...optionalMeds.filter(m => optionalSelected.has(m.id)),
];
const names = previewMeds.map(m => m.medication_name).join(' و'); // لا يزال يُستخدم في msg2 فقط
const firstName = patient.name.split(' ')[0];

// حالة الدواء بصياغة القائمة (سطر لكل دواء): "يكفي {مدة}" بلا "كم"
const medStatusForList = (m: ChronicMed): string => {
  const d = calcDaysLeft(m.next_refill_date);
  if (d < 0) return 'بحاجة للتجديد';
  if (d === 0) return 'ينفد اليوم';
  return `يكفي ${pluralizeDays(d)}`;
};

// حالة الدواء بصياغة الجملة المفردة: "يكفيكم {مدة}"
const medStatusSingular = (m: ChronicMed): string => {
  const d = calcDaysLeft(m.next_refill_date);
  if (d < 0) return 'بحاجة للتجديد';
  if (d === 0) return 'ينفد اليوم';
  return `يكفيكم ${pluralizeDays(d)}`;
};

const previewMsg = msgType === 'msg1'
  ? previewMeds.length === 0
    ? `مرحباً ${firstName} 😊\nنودّ تذكيركم بمواعيد أدويتكم. نسعد بخدمتكم في أقرب وقت. 🌿`
    : previewMeds.length === 1
      ? `مرحباً ${firstName} 😊\nنودّ تذكيركم بأن دواء (${previewMeds[0].medication_name}) ${medStatusSingular(previewMeds[0])}. نسعد بخدمتكم في أقرب وقت. 🌿`
      : `مرحباً ${firstName} 😊\nنودّ تذكيركم بأدويتكم:\n${previewMeds.map(m => `- ${m.medication_name} — ${medStatusForList(m)}`).join('\n')}\nنسعد بخدمتكم لتجديدها في أقرب وقت. 🌿`
  : `مرحباً ${firstName} 🌿\nمعكم ${pharmacyName}.\n\nتذكّرنا بكم واحتفظنا بـ (${names || '...'}) جاهزاً لكم.\n\nعندما يناسبكم، نحن هنا 😊`;
```

**ملاحظات على القيود:**
- `previewMeds.length === 0` حالة نادرة (`urgentMeds` تُختار تلقائياً دائماً) لكنها ممكنة نظرياً — أُضيف نص احتياطي عام محافظ على نفس الأسلوب.
- منطق اختيار الأدوية (`urgentMeds`, `optionalMeds`, `toggleOptional`, `allSelectedIds`) والإرسال (`onConfirm`) — **لم يُلمَس إطلاقاً**.
- `useEffect` الذي يحمي تعديل المستخدم اليدوي (`if (!userEdited) setCustomMsg(previewMsg)`) — **لم يُلمَس**، يستمر بحماية أي تعديل يدوي كما هو.
- قوائم معاينة الأدوية في الواجهة (سطر 63-118، "أدوية ستُذكر في الرسالة"، "أدوية تقترب من النفاذ") — **لم تُلمَس**.

---

## الأمثلة الخمسة المطلوبة

### أ) دواء واحد نافد (بندول، d = -2)
```
مرحباً أحمد 😊
نودّ تذكيركم بأن دواء (بندول) بحاجة للتجديد. نسعد بخدمتكم في أقرب وقت. 🌿
```

### ب) دواء واحد قريب — يومان (بندول، d = 2)
```
مرحباً أحمد 😊
نودّ تذكيركم بأن دواء (بندول) يكفيكم يومان. نسعد بخدمتكم في أقرب وقت. 🌿
```

### ج) دواء واحد ينفد اليوم (بندول، d = 0)
```
مرحباً أحمد 😊
نودّ تذكيركم بأن دواء (بندول) ينفد اليوم. نسعد بخدمتكم في أقرب وقت. 🌿
```

### د) عدة أدوية مختلطة (بندول d=-2، إنسولين d=0، كونكور d=3)
```
مرحباً أحمد 😊
نودّ تذكيركم بأدويتكم:
- بندول — بحاجة للتجديد
- إنسولين — ينفد اليوم
- كونكور — يكفي 3 أيام
نسعد بخدمتكم لتجديدها في أقرب وقت. 🌿
```

### هـ) عدة أدوية كلها قريبة (بندول d=1، كونكور d=3)
```
مرحباً أحمد 😊
نودّ تذكيركم بأدويتكم:
- بندول — يكفي يوم واحد
- كونكور — يكفي 3 أيام
نسعد بخدمتكم لتجديدها في أقرب وقت. 🌿
```

## بانتظار القرار

1. الموافقة على الكود كما هو.
2. تأكيد: القالب الجديد لـ`msg1` فقط، وmsg2 دون تغيير؟
3. تأكيد: بلا اسم الصيدلية في الرسالة، كما كُتب القالب حرفياً؟
