-- سجل محاولات إدخال أدوية في كتالوج الصيدلية (مبدأ المنصة: لا أدوية).
-- يُكتب من مسارات API عبر service_role فقط، ويُقرأ من شاشة الأدمن فقط —
-- لا سياسة لدور authenticated عمداً، فالجدول غير مرئي للصيدليات.

CREATE TABLE IF NOT EXISTS public.catalog_rejections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id       uuid NOT NULL,
  user_id           uuid,                                   -- الموظف الذي حاول
  brand_name        text NOT NULL,
  ingredients       text[] NOT NULL DEFAULT '{}',           -- ما استخرجه النموذج/أُدخل يدوياً
  reason            text NOT NULL,
  source            text NOT NULL CHECK (source IN ('blocklist', 'ai', 'both')),
  matched_terms     text[] NOT NULL DEFAULT '{}',           -- المطابقات من القائمة الحتمية
  image_url         text,
  created_at        timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_catalog_rejections_ph ON public.catalog_rejections (pharmacy_id, created_at DESC);

ALTER TABLE public.catalog_rejections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_rejections FROM anon, authenticated;
GRANT ALL ON TABLE public.catalog_rejections TO service_role;
