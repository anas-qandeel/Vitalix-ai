-- إضافة اسم الصيدلية بالإنجليزية — اختياري
-- يُستخدم في المخرجات الإنجليزية (تقرير المريض، رسالة واتساب) بدل الاسم العربي
-- عند وجوده؛ وإن كان NULL يُستعمل العمود name كما هو الآن
alter table public.pharmacies
  add column if not exists name_en text;
