-- حلقة التعلّم (المرحلة 6): أحداث سلوكية لكل منتج في كتالوج الصيدلية.
-- تُستخدم لترتيب المنتجات "الملائمة" فيما بينها فقط — لا تتجاوز محرك الملاءمة أبداً.
-- منفصلة لكل صيدلية: الدرجة تُحسب من أحداث الصيدلية نفسها، وRLS تمنع الاطلاع عبر الصيدليات.

CREATE TABLE IF NOT EXISTS public.catalog_product_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   uuid NOT NULL,
  product_id    uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  patient_id    uuid,
  event_type    text NOT NULL CHECK (event_type IN ('pharmacist_excluded', 'patient_inquired')),
  context       text NOT NULL CHECK (context IN ('visit', 'weight_plan')),
  context_id    uuid NOT NULL,                              -- معرّف الزيارة أو الخطة
  patient_flags jsonb NOT NULL DEFAULT '{}'::jsonb,        -- لقطة وقت الحدث: is_pregnant, is_lactating, hypertension, diabetes
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  -- حدث واحد لكل (نوع، سياق، منتج): إعادة اعتماد الخطة نفسها لا تضاعف العدّ
  CONSTRAINT catalog_product_events_unique UNIQUE (event_type, context, context_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cpe_ph_product_time
  ON public.catalog_product_events (pharmacy_id, product_id, created_at DESC);

ALTER TABLE public.catalog_product_events ENABLE ROW LEVEL SECURITY;

-- قراءة داخل الصيدلية فقط (لعرض الأرقام للصيدلاني)؛ الكتابة من الخادم عبر service_role فقط
CREATE POLICY catalog_product_events_read ON public.catalog_product_events
  FOR SELECT TO authenticated
  USING (pharmacy_id = public.current_pharmacy_id());

GRANT SELECT ON TABLE public.catalog_product_events TO authenticated;
GRANT ALL ON TABLE public.catalog_product_events TO service_role;
