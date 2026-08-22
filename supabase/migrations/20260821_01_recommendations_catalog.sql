-- ═══ كتالوج المكملات ═══
-- فئات مغلقة يختار منها الذكاء الاصطناعي بالرمز فقط.
-- النموذج لا يرى أسماء المنتجات ولا يسمّيها — تحويل الفئة
-- إلى منتج استعلام حتمي، حفاظاً على القرار المعماري الموثّق
-- في docs/schema.sql (لا مطابقة بالذكاء الاصطناعي).
alter table public.pharmacy_recommendations
  add constraint pharmacy_recommendations_category_check
  check (category in (
    'b12','omega3','fiber','vitamin_d','calcium',
    'magnesium_potassium','protein','sugar_substitute',
    'blood_sugar_support','zinc_selenium','probiotic','iron',
    'appetite_stimulant','satiety_aid','multivitamin'
  ));

create index if not exists idx_recommendations_ph_cat
  on public.pharmacy_recommendations (pharmacy_id, category)
  where is_active;

-- ═══ nutrition_plan: text → jsonb ═══
-- صفّان من صيغة نثرية قديمة (10-11 أغسطس) فُرّغا،
-- فالخطة تُعاد توليدها عند أول فتح.
update public.weight_plans
set nutrition_plan = null
where nutrition_plan is not null
  and nutrition_plan !~ '^\s*[\{\[]';

alter table public.weight_plans
  alter column nutrition_plan type jsonb
  using nullif(nutrition_plan, '')::jsonb;
