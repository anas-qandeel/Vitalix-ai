-- منع تكرار المنتج داخل الصيدلية الواحدة: الاسم بعد توحيد حالة الأحرف وحذف المسافات الطرفية.
-- اسم مختلف (حجم عبوة آخر مثلاً) يبقى مسموحاً. الشاشة تترجم خطأ 23505 إلى رسالة واضحة.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_pharmacy_name
  ON public.pharmacy_products (pharmacy_id, lower(trim(brand_name)));
