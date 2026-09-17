-- الحبات المرحّلة من الدورة السابقة وقت آخر صرف.
-- قبل هذا العمود كان التجديد يخزّن الإجمالي (علب جديدة + متبقٍ) في pills_per_box مع boxes_count = 1،
-- فيضيع حجم العلبة الحقيقي ويتضخم مع كل تجديد ويُفسد حساب المخزون.
-- إجمالي الحبات عند آخر صرف = pills_per_box × boxes_count + carryover_pills
alter table public.chronic_medications
  add column if not exists carryover_pills integer not null default 0
  check (carryover_pills >= 0);
comment on column public.chronic_medications.carryover_pills is
  'الحبات المرحّلة من الدورة السابقة وقت آخر صرف؛ الإجمالي = pills_per_box × boxes_count + carryover_pills';
