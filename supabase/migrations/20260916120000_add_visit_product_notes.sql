-- سبب/إرشاد شخصي لكل فئة منتج مستحقة في الزيارة، يكتبه الذكاء مرة واحدة وقت التقرير
-- (مفاتيح: bp_device / sugar_device / sugar_strips). غيابه ← قالب حتمي احتياطي في GET /api/visit.
ALTER TABLE public.visitations ADD COLUMN IF NOT EXISTS product_notes jsonb;
