# تعديل نطاق todayAlerts إلى ±3 أيام

## الأسطر المطلوبة

**استعلام `todayAlerts` الحالي (سطر 227-228):**
```ts
.lte('next_refill_date', new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0])
.gte('next_refill_date', todayStr)
```

**التغيير المقترح (تعديل الرقمين فقط):**
```diff
- .lte('next_refill_date', new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0])
- .gte('next_refill_date', todayStr)
+ .lte('next_refill_date', new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0])
+ .gte('next_refill_date', new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0])
```
لا لمس لأي سطر آخر — `.eq('pharmacy_id', uid)`, `.eq('status', 'active')`, `.order(...)`, `.limit(15)` (سطر 226، 229، 230) تبقى كما هي حرفياً.

---

## سطر `Math.max(0, ...)` (سطر 270)

```ts
const d = Math.max(0, Math.ceil((new Date(item.next_refill_date).getTime() - today.getTime()) / 86400000));
```

## الرأي

**نعم، يجب إزالته أو تعديله — لكن ليس بمعزل عن العرض.**

المشكلة إن تُرك كما هو بعد توسيع `gte` ليشمل المتأخرين: أي مريض متأخر (يوم واحد أو 3 أيام) سيُحسب له `d = Math.max(0, رقم_سالب) = 0` دائماً — أي أن مريضاً تأخر يوماً واحداً ومريضاً تأخر 3 أيام سيظهران **بنفس النص تماماً**: "نفد اليوم" (سطر 389: `item.days_left === 0 ? 'نفد اليوم' : ...`). هذا غير دقيق فعلياً — "نفد اليوم" تعني تأخر صفر أيام، لا 1-3 أيام.

**لكن** إزالة `Math.max(0, ...)` وحدها ستكسر شيئاً آخر: دالة `pluralizeDays` (سطر 114-119):
```ts
function pluralizeDays(days: number): string {
  if (days === 1) return 'يوم واحد';
  if (days === 2) return 'يومان';
  if (days <= 10) return `${days} أيام`;
  return `${days} يوماً`;
}
```
لو مرّرت لها `-2`، الشرط `days <= 10` صحيح (`-2 <= 10`)، فتُرجع حرفياً `"-2 أيام"` — نص عربي مكسور يظهر للمستخدم. والعرض نفسه (سطر 385-390) لا يملك أي فرع لحالة "متأخر":
```ts
item.days_left === 0 ? 'text-rose-700...' : item.days_left <= 2 ? 'text-amber-700...' : 'text-slate-700...'
{item.days_left === 0 ? 'نفد اليوم' : `متبقي ${pluralizeDays(item.days_left)}`}
```

**خلاصة الرأي:** إزالة `Math.max(0,...)` بمفردها **تُنتج خللاً في العرض** ("متبقي -2 أيام")، وليست إصلاحاً كاملاً. الإصلاح الصحيح يحتاج تعديلاً منسّقاً في مكانين معاً: حساب `d` (إزالة `Math.max`) **و** منطق العرض (سطر 385-390) لإضافة فرع "متأخر X أيام" بلون مميز (rose على الأرجح) للقيم السالبة. هذا خارج نطاق "غيّري رقمي الحدين فقط" المطلوب لهذه الخطوة — يُقترح أن يكون تعديلاً منفصلاً تالياً بعد الموافقة، وليس ضمن هذا التعديل.

## بانتظار القرار

- الموافقة على تغيير الحدين (7→3، today→today−3) فقط الآن.
- ترك `Math.max(0,...)` والعرض دون لمس لحين قرار لاحق منفصل بخصوص عرض "متأخر X أيام".
