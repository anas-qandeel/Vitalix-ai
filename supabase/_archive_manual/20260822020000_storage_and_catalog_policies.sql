-- ═══ سياسات bucket التخزين catalog-images ═══
-- الـbucket أُنشئ يدوياً من لوحة Supabase (public = true) ولا أثر
-- له في المستودع. سياساته الأصلية كانت تفحص bucket_id وحده:
-- سياسة الحذف اسمها "حذف صوره الخاصة" وشرطها لا يفحص أي ملكية،
-- فأي مستخدم مسجَّل — من أي صيدلية — يحذف صور كل الصيدليات.
-- الآن الرفع والحذف مشروطان بتطابق المجلد الأول في مسار الملف
-- مع current_pharmacy_id().
-- لا سياسة SELECT على هذا الـbucket عمداً: الـbucket عام
-- (public = true) فالقراءة عبر الرابط المباشر لا تمرّ بـRLS
-- أصلاً. سياسة SELECT واسعة كانت موجودة وحُذفت — كانت تتيح
-- للعميل سرد كل ملفات الـbucket فيكشف بنية المجلدات ومعرّفات
-- الصيدليات، بلا أن تضيف شيئاً لعرض الصور.
-- مُختبَر: رابط صورة مباشر يعمل بلا هذه السياسة.

-- ملاحظة: الـbucket نفسه (catalog-images, public) أُنشئ يدوياً
-- من لوحة Supabase ولا ينشئه هذا الترحيل. بيئة جديدة تحتاج
-- إنشاءه قبل تطبيق هذا الملف.

drop policy if exists "Allow users to delete their own catalog images" on storage.objects;
drop policy if exists "Allow authenticated uploads to catalog-images" on storage.objects;
drop policy if exists "Allow public read access to catalog-images" on storage.objects;

create policy "catalog_images_insert_own_pharmacy"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'catalog-images'
  and (storage.foldername(name))[1] = public.current_pharmacy_id()::text
);

create policy "catalog_images_delete_own_pharmacy"
on storage.objects for delete to authenticated
using (
  bucket_id = 'catalog-images'
  and (storage.foldername(name))[1] = public.current_pharmacy_id()::text
);

-- ═══ صلاحيات كتالوج المكملات ═══
-- الأجهزة (pharmacy_catalog) تبقى مفتوحة للكتابة لكل من في
-- الصيدلية — قرار صريح: الفريق كله يعمل لصالحها وخطأ التسعير
-- قابل للتصحيح.
-- أما المكملات فربط منتج بفئة سريرية يُقترح تلقائياً على مرضى
-- بحالات وأدوية محددة — قرار مهني لا تجاري، فالكتابة للمالك
-- والصيدلاني فقط. القراءة تبقى للجميع داخل الصيدلية.

drop policy if exists pharmacy_recommendations_tenant_rw on public.pharmacy_recommendations;

create policy pharmacy_recommendations_read on public.pharmacy_recommendations
  for select to authenticated
  using (pharmacy_id = current_pharmacy_id());

create policy pharmacy_recommendations_write on public.pharmacy_recommendations
  for all to authenticated
  using (pharmacy_id = current_pharmacy_id()
         and current_role_name() in ('owner','pharmacist'))
  with check (pharmacy_id = current_pharmacy_id()
         and current_role_name() in ('owner','pharmacist'));
