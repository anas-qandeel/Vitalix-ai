-- إجبار مالك الصيدلية على تغيير كلمة المرور الأولى قبل استخدام النظام
-- كلمة المرور الأولى ينشئها مسؤول المنصة وتصل للصيدلي عبر قناة غير آمنة (واتساب/مكالمة)،
-- فتبقى معروفة لطرف ثالث ما لم تُغيَّر. القيمة الافتراضية true للصيدليات الجديدة،
-- والصيدليات القائمة تُترك false لأن كلمات مرورها معروفة ومقبولة في مرحلة التجربة
alter table public.pharmacies
  add column if not exists must_change_password boolean not null default true;

update public.pharmacies
  set must_change_password = false
  where created_at < now();
