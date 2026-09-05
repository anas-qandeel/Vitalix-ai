-- أعمدة التصنيف المعتمد: تُحسب مرة واحدة لحظة الفحص من المرجع الموحد
-- (src/lib/vitals-classify.ts) وتُحفظ كسجل ثابت — صفحة المريض تستدعي ولا تحسب.
-- الزيارات السابقة تبقى فارغة بالتصميم: لا تصنيف معتمد بأثر رجعي.
ALTER TABLE visitations
  ADD COLUMN IF NOT EXISTS bp_classification text,
  ADD COLUMN IF NOT EXISTS bp_classification_level text,
  ADD COLUMN IF NOT EXISTS sugar_classification text,
  ADD COLUMN IF NOT EXISTS sugar_classification_level text,
  ADD COLUMN IF NOT EXISTS heart_rate_classification text,
  ADD COLUMN IF NOT EXISTS heart_rate_classification_level text,
  ADD COLUMN IF NOT EXISTS classification_special_criteria text;
