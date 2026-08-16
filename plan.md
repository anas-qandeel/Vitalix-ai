# نقل WaMsgModal إلى ملف مشترك — الاعتماديات وخطة النقل

## 1. اعتماديات `WaMsgModal` (chronic/page.tsx، السطور 1561-1710)

فحصت جسم المكوّن بالكامل. القائمة الكاملة لما يحتاجه ليعمل مستقلاً:

| الاعتمادية | أين مُعرَّفة الآن | هل تُستخدم في أماكن أخرى بـ chronic؟ |
|---|---|---|
| `useState`, `useEffect` | `'react'` (مكتبة خارجية) | — استيراد مباشر عادي |
| `interface Patient` | سطر 12-18 في chronic/page.tsx | **نعم، بكثرة** — `CareCard.patient`, `AddPatientModal`, `MedModal`, نتائج البحث... |
| `interface ChronicMed` | سطر 20-32 في chronic/page.tsx | **نعم، بكثرة** — نفس الأماكن أعلاه + `fetchAll` |
| `function calcDaysLeft(d: string): number` | سطر 102 في chronic/page.tsx | **نعم، +13 استخدام آخر** في الملف (عرض البطاقات، `MedModal`، `AddPatientModal`، حساب `daysLeft` في `fetchAll`...) |
| كلاس CSS `.saas-slide-up` | `<style jsx global>` داخل chronic/page.tsx (~سطر 2062) | لا حاجة لنقله — كلاس **global** (`style jsx global`)، يبقى متاحاً في runtime طالما chronic/page.tsx نفسها مُركَّبة في الشجرة، و`WaMsgModal` لا يُعرض إلا داخل chronic أصلاً. لا إجراء مطلوب، فقط اعتماد ضمني (runtime coupling) أذكره للتوثيق |

**ملاحظة مهمة:** لا وجود لدالتين باسم `buildWaMsg1`/`buildWaMsg2` — بناء نص الرسالة (`previewMsg`) مكتوب inline داخل `WaMsgModal` نفسه (ternary حسب `msgType`)، وهو **مكتفٍ ذاتياً بالكامل** ولا يعتمد على أي دالة خارجية لبناء النص. كذلك `buildWaLink` (بناء رابط wa.me الفعلي) **لا يُستخدم داخل WaMsgModal إطلاقاً** — يُستدعى في الأصل (`handleWaConfirm` في المكوّن الأب) بعد أن يُعيد `WaMsgModal` النتيجة عبر `onConfirm`. لا شيء آخر (لا `supabase`، لا `CareCard`، لا `PipelineRecord`/`CareStage`) — المكوّن عرضي بحت (props + state محلي فقط).

---

## 2. خطة النقل المقترحة

بما أن `Patient` و`ChronicMed` و`calcDaysLeft` **مشتركة** مع أماكن أخرى بـ chronic، سنتبع نفس نمط `upsertPipeline` تماماً (ملف مشترك في `src/lib/`، والاثنان يستوردان منه):

### أ) ملف جديد `src/lib/chronic.ts` (موازٍ لـ `src/lib/pipeline.ts`):
```ts
export interface Patient {
  id: string;
  name: string;
  phone_number: string;
  gender: string;
  birth_date: string;
}

export interface ChronicMed {
  id: string;
  patient_id: string;
  pharmacy_id: string;
  medication_name: string;
  pills_per_box: number;
  boxes_count: number;
  daily_dosage: number;
  dosage_unit: string;
  last_refill_date: string;
  next_refill_date: string;
  status: string;
}

export function calcDaysLeft(d: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const next = new Date(d); next.setHours(0,0,0,0);
  return Math.ceil((next.getTime() - today.getTime()) / 86400000);
}
```
(منقولة حرفياً بلا أي تعديل في المنطق)

### ب) ملف جديد `src/components/WaMsgModal.tsx`:
```ts
'use client';

import { useState, useEffect } from 'react';
import { Patient, ChronicMed, calcDaysLeft } from '@/lib/chronic';

export default function WaMsgModal({ patient, meds, pharmacyName, msgType, onClose, onConfirm }: {
  patient: Patient;
  meds: ChronicMed[];
  pharmacyName: string;
  msgType: 'msg1' | 'msg2';
  onClose: () => void;
  onConfirm: (selectedMedIds: Set<string>, customMsg: string) => void;
}) {
  // ... جسم المكوّن كاملاً كما هو، بلا أي تغيير حرف واحد ...
}
```

### ج) في `chronic/page.tsx`:
- حذف `interface Patient {...}` (سطر 12-18)، `interface ChronicMed {...}` (سطر 20-32)، `function calcDaysLeft(...)` (سطر 102-106)، ودالة `WaMsgModal` كاملة (سطر 1561-1710).
- إضافة:
  ```ts
  import { Patient, ChronicMed, calcDaysLeft } from '@/lib/chronic';
  import WaMsgModal from '@/components/WaMsgModal';
  ```
- كل الاستخدامات الأخرى لـ `Patient`, `ChronicMed`, `calcDaysLeft`, `WaMsgModal` في باقي الملف (13+ موضع) تبقى تعمل دون أي تعديل إضافي — نفس الأسماء، مصدرها فقط تغيّر من "محلي" إلى "مستورد".

### بعد التنفيذ سيُتحقق بـ:
- `grep` شامل للتأكد من عدم فوات أي استخدام آخر لهذه الأسماء في الملف.
- `tsc --noEmit` على الملفات الثلاثة المتأثرة.
- تأكيد أن `dashboard/page.tsx` لم يُلمس إطلاقاً (خارج نطاق هذه المرحلة).
