-- الجدول لم يكن فيه created_at إطلاقاً، وupdated_at كان يؤدي دوره بحكم أنه
-- لا يتحرّك (default now() بلا تريغر). بعد إضافة تريغر التحديث في
-- 20260823_03، فُقدت نقطة البداية — فأُضيف عمود صريح لها.
--
-- الصفوف القائمة مُلئت بأقدم أثر متاح لكل صف: أقدم من updated_at و reminded_at.
-- تقدير لا استرجاع دقيق — كانت بيانات اختبار.

alter table refill_tracking_pipeline
  add column created_at timestamptz not null default now();

update refill_tracking_pipeline
set created_at = least(updated_at, coalesce(reminded_at, updated_at));