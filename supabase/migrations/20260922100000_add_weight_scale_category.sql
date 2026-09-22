-- توسيع فئات الكتالوج: جهاز ميزان (weight_scale) لنوع device.
-- يستبدل قيد category فقط؛ لا يغيّر أي صف.
ALTER TABLE public.pharmacy_products DROP CONSTRAINT IF EXISTS pharmacy_products_category_check;
ALTER TABLE public.pharmacy_products ADD CONSTRAINT pharmacy_products_category_check CHECK (category IN (
  'b12', 'omega3', 'fiber', 'vitamin_d', 'calcium', 'magnesium_potassium', 'protein',
  'sugar_substitute', 'blood_sugar_support', 'zinc_selenium', 'probiotic', 'iron',
  'appetite_stimulant', 'satiety_aid', 'multivitamin',
  'sugar_device', 'sugar_strips', 'bp_device', 'weight_scale',
  'uncategorized'
));
