# تجميع "اتصل اليوم" — صف واحد لكل مريض بدل صف لكل دواء

استكشاف أولاً، ثم اقتراح — بلا تطبيق. الملف: `src/app/dashboard/page.tsx`.

## 1. كيف تُبنى todayAlerts حالياً؟

الاستعلام (سطر 223-229) — **صف واحد لكل دواء**، لا تجميع حسب المريض:
```ts
supabase.from('chronic_medications')
  .select('id, medication_name, next_refill_date, patient_id, patients!inner(name, phone_number)')
  .eq('pharmacy_id', uid).eq('status', 'active')
  .lte('next_refill_date', new Date(today.getTime() + 3 * 86400000).toISOString().split('T')[0])
  .gte('next_refill_date', new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0])
  .order('next_refill_date', { ascending: true })
  .limit(15),
```

البناء النهائي (سطر 262-274) — فلترة على `pipeline_stage` ثم `.map` **مباشر بلا تجميع** ثم `.slice(0,5)`:
```ts
setTodayAlerts(
  ((alertsRes.data as any[]) || [])
    .filter(item => {
      const stage = pipelineStageMap.get(item.patient_id);
      return !stage || stage === 'due';
    })
    .map(item => {
      const d = Math.ceil((new Date(item.next_refill_date).getTime() - today.getTime()) / 86400000);
      const patient = item.patients as { name: string; phone_number: string };
      return { id: item.id, patient_id: item.patient_id, patient_name: patient?.name || 'مريض', phone: patient?.phone_number || '', medication_name: item.medication_name, days_left: d };
    })
    .slice(0, 5)
);
```
كل صف مصدره صف `chronic_medications` واحد (`id: item.id` = معرّف صف الدواء) — لو مريض له دواءان ضمن النافذة الزمنية، يظهر **صفّين منفصلين** بنفس `patient_id` لكن `id` مختلف.

## 2. آلية تجميع chronic حسب المريض

`src/app/dashboard/chronic/page.tsx`، سطر 1730-1746 — `patientMap`:
```ts
const { data: medsData } = await supabase.from('chronic_medications')
  .select('*, patients!inner(id, name, phone_number, gender, birth_date)')
  .eq('pharmacy_id', pid).eq('status', 'active');   // ← بلا فلترة تاريخ على مستوى الاستعلام إطلاقاً
...
const patientMap = new Map<string, { patient: Patient; meds: ChronicMed[] }>();
(medsData || []).forEach((row: any) => {
  const p: Patient = row.patients;
  const m: ChronicMed = { ...row };
  delete (m as any).patients;
  if (!patientMap.has(p.id)) patientMap.set(p.id, { patient: p, meds: [] });
  patientMap.get(p.id)!.meds.push(m);
});
```
ثم حساب "الأعجل" لكل مريض (سطر 1750):
```ts
const daysLeft = Math.min(...meds.map(m => calcDaysLeft(m.next_refill_date)));
```
**ملاحظة مهمة:** `Math.min` تُعطي الأولوية تلقائياً لـ"نافد" (أيام سالبة، أصغر رقم) قبل "اليوم" (0) قبل "الأقرب" (موجب) — بلا حاجة لمنطق شرطي إضافي، لأن الترتيب العددي الطبيعي يطابق ترتيب الأولوية المطلوب تماماً. وأخيراً: `list.sort((a, b) => a.daysLeft - b.daysLeft)` (سطر 1773) يرتّب المرضى تصاعدياً حسب هذا الرقم (الأعجل أولاً).

## 3. بنية QuickAlert الحالية

```ts
interface QuickAlert {
  id: string;              // معرّف صف chronic_medications (دواء واحد)
  patient_id: string;
  patient_name: string;
  phone: string;
  medication_name: string; // ← مفرد، دواء واحد فقط
  days_left: number;
}
```
تحمل **دواءً واحداً**، لا مصفوفة. هذا هو سبب ظهور المريض مرتين.

---

## الخطة المقترحة (بلا تطبيق)

**لن أغيّر استعلام قاعدة البيانات نفسه** (يبقى ±3 أيام كما هو) — التجميع سيحدث client-side بعد الجلب، بنفس فكرة `patientMap` في chronic لكن مطبّقة على الصفوف المفلترة زمنياً أصلاً (وليس كل الأدوية النشطة كما تفعل chronic، لأن استعلام dashboard يبقى محدوداً بالنافذة الزمنية عمداً — قرار سابق متفق عليه).

### أ) `QuickAlert` — إزالة `id`، `medication_name` مصفوفة
```diff
interface QuickAlert {
-  id: string;
  patient_id: string;
  patient_name: string;
  phone: string;
-  medication_name: string;
+  medication_names: string[];
  days_left: number;
}
```
`id` غير مستخدم في أي مكان سوى `key` في React (سطر 369) — سيُستبدل بـ `patient_id` مباشرة (فريد الآن أصلاً بعد التجميع). تحققت: `openWaModal` لا يستخدم `item.id` ولا `item.medication_name` إطلاقاً (فقط `patient_id`/`patient_name`/`phone`) — **لا حاجة لأي تعديل داخل `openWaModal` أو `handleWaConfirm`**.

### ب) بناء `todayAlerts` — تجميع بعد الفلترة، قبل `setTodayAlerts` (يستبدل سطر 262-274)
```ts
const filteredAlerts = ((alertsRes.data as any[]) || []).filter(item => {
  const stage = pipelineStageMap.get(item.patient_id);
  return !stage || stage === 'due';
});

// تجميع الأدوية حسب المريض — صف واحد لكل مريض، بنفس فكرة patientMap في chronic
const alertPatientMap = new Map<string, { patient_id: string; patient_name: string; phone: string; medNames: string[]; daysLeft: number }>();
filteredAlerts.forEach(item => {
  const d = Math.ceil((new Date(item.next_refill_date).getTime() - today.getTime()) / 86400000);
  const patient = item.patients as { name: string; phone_number: string };
  const existing = alertPatientMap.get(item.patient_id);
  if (!existing) {
    alertPatientMap.set(item.patient_id, {
      patient_id: item.patient_id,
      patient_name: patient?.name || 'مريض',
      phone: patient?.phone_number || '',
      medNames: [item.medication_name],
      daysLeft: d,
    });
  } else {
    existing.medNames.push(item.medication_name);
    existing.daysLeft = Math.min(existing.daysLeft, d); // الأعجل بين أدوية نفس المريض — مطابق لمنطق chronic
  }
});

setTodayAlerts(
  Array.from(alertPatientMap.values())
    .sort((a, b) => a.daysLeft - b.daysLeft) // الأعجل أولاً — مطابق لترتيب chronic (سطر 1773)
    .slice(0, 5)
    .map(p => ({ patient_id: p.patient_id, patient_name: p.patient_name, phone: p.phone, medication_names: p.medNames, days_left: p.daysLeft }))
);
```

### ج) العرض (سطر 367-378)
```diff
  {todayAlerts.map(item => {
    return (
-     <div key={item.id} className="px-6 py-4 ...">
+     <div key={item.patient_id} className="px-6 py-4 ...">
        ...
        <div className="text-xs font-medium text-slate-500 flex items-center w-fit gap-1" dir="ltr">
-          <span className="truncate">{item.medication_name}</span>
+          <span className="truncate">{item.medication_names.join(' · ')}</span>
        </div>
```
الفاصل `' · '` مطابق حرفياً لأسلوب chronic نفسه في عرض أدوية المريض المتعددة (`chronic/page.tsx` سطر 1563: `meds.map(m => m.medication_name).join(' · ')`).

### د) الضغط على الزر → WaMsgModal بكل الأدوية

**لا تغيير مطلوب هنا فعلياً.** `openWaModal` (الموجودة حالياً) تجلب أصلاً *كل* الأدوية النشطة للمريض من `chronic_medications` عند الضغط (بغضّ النظر عمّا في `item`)، وليس فقط تلك التي ضمن نافذة ±3 أيام:
```ts
const openWaModal = async (item: QuickAlert) => {
  const { data } = await supabase.from('chronic_medications')
    .select('*')
    .eq('pharmacy_id', pharmacyId).eq('patient_id', item.patient_id).eq('status', 'active');
  setWaMsgModal({ patient: {...}, meds: (data as ChronicMed[]) || [] });
};
```
هذا يعني أن `WaMsgModal` كانت تعمل بكل أدوية المريض **حتى قبل هذا التعديل** — المشكلة كانت فقط في **عرض القائمة** (صف مكرر لكل دواء)، وليس في سلوك الفتح. لا لمس لـ `handleWaConfirm`/`upsertPipeline`/`WaMsgModal` — كل ما يخص الإرسال والتأكيد يبقى كما هو 100%.

## نقطة تحتاج قرارك: هل `limit(15)` كافٍ بعد التجميع؟

قبل هذا التعديل: 15 صف دواء → بعد فلترة pipeline → `slice(0,5)` صفوف (كل صف = دواء واحد، أي حتى 5 أدوية معروضة كحد أقصى بغضّ النظر عن عدد المرضى).

بعد التعديل: 15 صف دواء → فلترة → **تجميع حسب المريض** → `slice(0,5)` مرضى. بما أن أغلب المرضى المزمنين لديهم دواء أو دواءين ضمن أي نافذة زمنية معطاة (وليس 15)، فإن 15 صف دواء غالباً ستكفي لتغطية 5 مرضى مختلفين أو أكثر في الحالة النموذجية. **لكن نظرياً**: لو صادف أن مريضاً واحداً له عدد كبير من الأدوية ضمن النافذة (حالة نادرة لكن ممكنة)، فقد تُستهلك حصة كبيرة من الـ 15 صفاً على مريض واحد، فيظهر عدد مرضى أقل من 5 رغم وجود مرضى آخرين مؤهلين لم تصلهم الحصة.

**خياران:**
1. الإبقاء على `limit(15)` كما هو (تقدير كافٍ في الغالبية العظمى من الحالات، ولا داعٍ للتعقيد لحالة نادرة).
2. رفعه إلى رقم أعلى (مثلاً `limit(30)`) كهامش أمان إضافي بعد التجميع.

أميل إلى الخيار 1 (الإبقاء على 15) ما لم تُخبرني أن الصيدليات الفعلية لديها مرضى بعدد كبير من الأدوية المزمنة المتزامنة — لكن القرار لك.

## التحقق من القيود

- `WaMsgModal` المشترك و`upsertPipeline` المشتركة — **لم يُلمَسا، لا تغيير في الاستيراد أو الاستخدام**.
- منطق الإرسال/التأكيد (`handleWaConfirm`, `handleConfirmSent`) — **لم يُلمَس إطلاقاً**.
- `chronic/page.tsx` — **لم يُلمَس**.
- `limit`/`slice` — نوقشت أعلاه، بانتظار قرارك.

## بانتظار القرار

1. الموافقة على خطة التجميع (أ-د) كما هي.
2. `limit(15)` يبقى أم يُرفع؟ وإلى كم؟
