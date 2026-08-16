# استكشاف: بنية المرضى قبل ميزة "إدارة المرضى"

استكشاف فقط — لا تعديل على أي كود.

## 1. حقول جدول `patients` الكاملة

لا يوجد ملف schema مركزي — الحقول 
استُنتجت من كل الاستعلامات والـ interfaces عبر الكود:

**من `src/app/dashboard/patients/[id]/page.tsx` (سطر 12-21) — الأشمل:**
```ts
interface PatientDetail {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
  height: number | null;
  diagnosed_conditions: string[] | null;
  created_at: string;
}
```

**من عمليات الإنشاء (`insert`)** — يُضاف أيضاً `pharmacy_id` (غير موجود في الـ interfaces أعلاه لأنه لا يُعرض للصيدلي، لكنه عمود فعلي):
- `src/app/dashboard/vitals/page.tsx` سطر 181-188:
  ```ts
  const { data, error } = await supabase.from('patients').insert({
    pharmacy_id: session.user.id,
    name: name.trim(),
    phone_number: normalizePhone(phone),
    gender,
    birth_date: dob,
    diagnosed_conditions: conditions,
  }).select().single();
  ```
- `src/app/dashboard/chronic/page.tsx` سطر 405-407:
  ```ts
  const { data, error } = await supabase.from('patients').insert({
    pharmacy_id: pid, name: name.trim(), phone_number: normalizePhone(query), gender, birth_date: dob, diagnosed_conditions: [],
  }).select().single();
  ```

**النسخة المُصغَّرة المشتركة** (`src/lib/chronic.ts`، تُستخدم في `WaMsgModal`/`chronic`/`dashboard`) لا تحمل إلا الحقول الأساسية:
```ts
export interface Patient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
}
```

**الحقول الكاملة المؤكَّدة فعلياً في الجدول:**
`id, pharmacy_id, name, phone_number, gender, birth_date, height, diagnosed_conditions, created_at`

لا يوجد عمود بريد إلكتروني، عنوان، أو رقم هوية — فقط ما سبق.

## 2. كيف يُنشأ مريض جديد حالياً؟

**شاشة الفحوصات** (`vitals/page.tsx`) — مودال إنشاء مريض ضمن نفس الصفحة (سطر 175-192، معروض أعلاه) — نموذج بسيط: اسم، هاتف، جنس، تاريخ ميلاد، أمراض مشخَّصة (`diagnosed_conditions` كمصفوفة نصوص).

**شاشة الأدوية المزمنة** (`chronic/page.tsx`) — نفس الفكرة، جزء من مودال "إضافة مريض/تجديد" (سطر 405-408) — نفس الحقول تقريباً، لكن `diagnosed_conditions: []` تُترك فارغة دائماً عند الإنشاء من هنا (لا يوجد حقل لإدخالها في هذا المسار تحديداً).

**لا يوجد مسار إنشاء ثالث مستقل** — الإنشاء يحدث فقط كجزء من تدفق "فحص جديد" أو "دواء جديد"، وليس كشاشة "إضافة مريض" قائمة بذاتها.

## 3. هل يوجد شاشة عرض/تعديل بيانات المريض؟

**عرض:** نعم — `src/app/dashboard/patients/[id]/page.tsx` (546 سطر) — صفحة ملف مريض واحد، تعرض بياناته الأساسية + سجل زياراته/فحوصاته.

**تعديل:** **جزئي جداً فقط** — تحققت عبر بحث شامل عن كل عمليات `update`/`delete` على `patients`:
```
src/app/dashboard/patients/[id]/page.tsx:214  → update({ height: newHeight })
src/app/dashboard/vitals/page.tsx:310         → update({ height: h })
src/app/dashboard/vitals/page.tsx:1118        → update({ diagnosed_conditions: updated })
```
فقط حقلان قابلان للتعديل، وبشكل inline محدود جداً (سطر واحد قابل للنقر، ليس نموذج تعديل كامل):
- `height` (الطول) — قابل للتعديل من صفحة الملف الشخصي وأثناء تسجيل فحص جديد.
- `diagnosed_conditions` (الأمراض المشخَّصة) — قابلة للتعديل أثناء تسجيل فحص جديد فقط.

**لا يوجد أي مكان يمكن فيه تعديل `name`, `phone_number`, `gender`, `birth_date` بعد الإنشاء.** ولا يوجد أي `delete` على جدول `patients` في كامل الكود — **لا وجود لميزة حذف مريض حالياً إطلاقاً.**

## 4. الجداول المرتبطة بـ `patient_id` (للانتباه عند أي حذف مستقبلي)

بحثت في كل الكود عن كل جدول يُستعلَم أو يُدرَج فيه بعمود `patient_id`:

| الجدول | الاستخدام | ملف مرجعي |
|---|---|---|
| `visitations` | سجل الفحوصات الحيوية (ضغط/سكري/وزن/نبض) | `vitals/page.tsx` سطر 540، 800 |
| `chronic_medications` | الأدوية المزمنة النشطة والمؤرشفة | `lib/chronic.ts`, `chronic/page.tsx` |
| `refill_tracking_pipeline` | مرحلة متابعة التجديد (due/messaged/...) | `lib/pipeline.ts` |
| `weight_plans` | خطط إنقاص الوزن | `api/weight-plan/route.ts` سطر 183 |

**لم أجد** أي عمود `patient_id` في `feedback` (ملاحظات الصيدليات للأدمن — غير مرتبطة بمريض) ولا في `pharmacy_catalog`/`pharmacy_staff` (لا علاقة بالمرضى).

**تنبيه صريح (بلا تنفيذ):** أي حذف مستقبلي لمريض يجب أن يتعامل مع **أربعة** جداول فرعية مرتبطة (`visitations`, `chronic_medications`, `refill_tracking_pipeline`, `weight_plans`) — إما بحذف تسلسلي (cascade) صريح في الكود (لا يوجد ORM ولا `ON DELETE CASCADE` مؤكَّد من الكود نفسه)، أو بمنع الحذف إن وُجدت سجلات مرتبطة، أو بأرشفة (soft delete) بدل حذف فعلي — القرار يحتاج نقاشاً منفصلاً عند بناء الميزة.

## 5. أين المكان المناسب لزر "إدارة المرضى"؟

يوجد موضعان محتملان في البنية الحالية لـ `dashboard/page.tsx`:

**أ) شريط التنقل العلوي المشترك** — `src/app/dashboard/components/DashboardHeader.tsx` سطر 104-108:
```ts
const NAV_LINKS = [
  { label: 'الرئيسية', href: '/dashboard', exact: true },
  { label: 'الفحوصات', href: '/dashboard/vitals', exact: false },
  { label: 'المزمنون', href: '/dashboard/chronic', exact: false },
];
```
هذه القائمة تظهر في كل صفحات `/dashboard/**` (ديسكتوب سطر 277-289، موبايل سطر 448-460) — إضافة `{ label: 'المرضى', href: '/dashboard/patients', exact: false }` هنا يجعل الوصول متاحاً من أي شاشة.

**ب) شبكة "بطاقات التنقل" في الصفحة الرئيسية** — `dashboard/page.tsx` سطر 564-615، نمط بطاقة ببيانات إحصائية + رابط، مطابقة تماماً لبطاقتَي "إدارة الأدوية المزمنة" (سطر 586-598) و"كتالوج الأجهزة" (سطر 601-613):
```tsx
<div onClick={() => router.push('/dashboard/chronic')}
  className="group bg-white border border-slate-200 rounded-xl p-5 cursor-pointer shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
  ...
</div>
```
إضافة بطاقة ثالثة بنفس النمط لـ"إدارة المرضى" تتناسب مع التصميم الحالي مباشرة.

**ج) بطاقة إحصائية موجودة بالفعل، غير قابلة للنقر حالياً** — "إجمالي المرضى" في شبكة الإحصائيات (سطر 460-472):
```tsx
<div className="p-5 sm:p-6 flex flex-col justify-center border-b lg:border-b-0 border-l border-slate-200 hover:bg-slate-100/50 transition-colors">
  ...
  <span className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">{stats.totalPatients}</span>
  ...
</div>
```
يمكن جعلها قابلة للنقر (`onClick={() => router.push('/dashboard/patients')}`) كاختصار إضافي، لكنها ليست بديلاً كافياً وحدها عن (أ) أو (ب) لأنها تبدو حالياً كبطاقة إحصائية بحتة لا كرابط.

**لا يوجد حالياً أي مسار `/dashboard/patients` (بدون `[id]`) لعرض قائمة كل المرضى** — فقط `/dashboard/patients/[id]` لملف مريض واحد معروف مسبقاً (يُفتح من نتائج البحث في vitals/chronic). بناء "إدارة المرضى" يتطلب صفحة قائمة جديدة بالكامل.

## خلاصة للتخطيط اللاحق

- الإنشاء موجود ومكرَّر في مكانين (vitals + chronic) بنفس الحقول تقريباً.
- التعديل شبه معدوم (فقط height و diagnosed_conditions، بلا واجهة تعديل حقيقية).
- الحذف غير موجود إطلاقاً، وله أربعة جداول مرتبطة يجب التعامل معها بحذر عند إضافته.
- لا صفحة قائمة مرضى حالياً — `/dashboard/patients/[id]` فقط لملف فردي.
- مكانان طبيعيان للدخول: `NAV_LINKS` في الهيدر المشترك، وبطاقة جديدة في شبكة التنقل بالصفحة الرئيسية.
