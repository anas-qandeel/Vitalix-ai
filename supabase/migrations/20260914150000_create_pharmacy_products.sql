-- الكتالوج الموحد: يجمع pharmacy_catalog (أجهزة/مستلزمات) و pharmacy_recommendations (مكملات)
-- في جدول واحد له ملف سريري لكل منتج. مبدأ المنصة: لا أدوية ولا علاجات — kind لا يقبل "دواء".
-- الجدولان القديمان يبقيان كما هما حتى تحويل كل المستهلكين (مرحلة لاحقة).

CREATE TABLE IF NOT EXISTS public.pharmacy_products (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id          uuid NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('supplement', 'device', 'consumable', 'medical_food')),
  category             text NOT NULL CHECK (category IN (
                         'b12', 'omega3', 'fiber', 'vitamin_d', 'calcium', 'magnesium_potassium', 'protein',
                         'sugar_substitute', 'blood_sugar_support', 'zinc_selenium', 'probiotic', 'iron',
                         'appetite_stimulant', 'satiety_aid', 'multivitamin',
                         'sugar_device', 'sugar_strips', 'bp_device',
                         'uncategorized'
                       )),
  brand_name           text NOT NULL,
  price                numeric(10,2) NOT NULL,
  image_url            text,
  patient_pitch        text,                                   -- النص الترويجي الموجه للمريض
  clinical_profile     jsonb NOT NULL DEFAULT '{}'::jsonb,     -- المكونات، المسببات، الحمل/الرضاعة، العمر، السكر/الصوديوم، التداخلات
  profile_source       text NOT NULL DEFAULT 'manual' CHECK (profile_source IN ('manual', 'ai')),
  profile_confirmed_at timestamptz,                            -- تأكيد الصيدلاني للملف السريري
  review_status        text NOT NULL DEFAULT 'ok' CHECK (review_status IN ('ok', 'needs_review', 'rejected_medicine')),
  review_reason        text,
  is_active            boolean NOT NULL DEFAULT true,
  legacy_source        text,                                   -- من أي جدول قديم نُسخ الصف (للتتبع)
  created_at           timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at           timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_products_ph ON public.pharmacy_products (pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_products_ph_cat_active ON public.pharmacy_products (pharmacy_id, category) WHERE is_active;

ALTER TABLE public.pharmacy_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY pharmacy_products_read ON public.pharmacy_products
  FOR SELECT TO authenticated
  USING (pharmacy_id = public.current_pharmacy_id());

CREATE POLICY pharmacy_products_write ON public.pharmacy_products
  TO authenticated
  USING (pharmacy_id = public.current_pharmacy_id() AND public.current_role_name() = ANY (ARRAY['owner', 'pharmacist']))
  WITH CHECK (pharmacy_id = public.current_pharmacy_id() AND public.current_role_name() = ANY (ARRAY['owner', 'pharmacist']));

GRANT ALL ON TABLE public.pharmacy_products TO authenticated;
GRANT ALL ON TABLE public.pharmacy_products TO service_role;

-- نسخ الأجهزة والمستلزمات بمعرّفاتها نفسها (excluded_recommendation_ids في الزيارات تبقى صالحة)
INSERT INTO public.pharmacy_products
  (id, pharmacy_id, kind, category, brand_name, price, image_url, patient_pitch, is_active, review_status, review_reason, legacy_source, created_at)
SELECT
  id, pharmacy_id,
  CASE category WHEN 'sugar_device' THEN 'device' WHEN 'bp_device' THEN 'device' WHEN 'sugar_strips' THEN 'consumable' ELSE 'supplement' END,
  CASE category WHEN 'weight_loss_med' THEN 'uncategorized' ELSE category END,
  brand_name, price, image_url, ai_pitch_prompt,
  CASE category WHEN 'weight_loss_med' THEN false ELSE is_active END,
  CASE category WHEN 'weight_loss_med' THEN 'rejected_medicine' ELSE 'ok' END,
  CASE category WHEN 'weight_loss_med' THEN 'مستحضر إدارة وزن دوائي — المنصة لا تعرض أدوية ولا تقترح علاجاً' ELSE NULL END,
  'pharmacy_catalog', created_at
FROM public.pharmacy_catalog
ON CONFLICT (id) DO NOTHING;

-- نسخ المكملات بمعرّفاتها نفسها
INSERT INTO public.pharmacy_products
  (id, pharmacy_id, kind, category, brand_name, price, image_url, patient_pitch, is_active, review_status, legacy_source, created_at)
SELECT
  id, pharmacy_id, 'supplement', category, product_name, price, image_url, ai_description, is_active, 'ok',
  'pharmacy_recommendations', created_at
FROM public.pharmacy_recommendations
ON CONFLICT (id) DO NOTHING;
