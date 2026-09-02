-- ملخص سريري للصيدلاني + تنبيه أدوية — للاستخدام الداخلي فقط
-- تحذير أمني: لا يجوز أبداً إرجاع هذين العمودين من /api/visit/[id] (المسار العام بلا مصادقة)
ALTER TABLE public.visitations
  ADD COLUMN IF NOT EXISTS pharmacist_summary text NULL,
  ADD COLUMN IF NOT EXISTS medications_alert text NULL;
