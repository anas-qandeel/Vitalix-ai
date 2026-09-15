-- حذف جدولي الكتالوج القديمين — حلّ محلهما pharmacy_products (هجرة 20260914150000).
-- لا كود يقرأهما منذ commit 4d49934 (استبدال شاشة الكتالوج).
-- بياناتهما تجريبية بالكامل بقرار صريح من صاحب المشروع — لا نسخ احتياطي.
drop table if exists public.pharmacy_recommendations cascade;
drop table if exists public.pharmacy_catalog cascade;
