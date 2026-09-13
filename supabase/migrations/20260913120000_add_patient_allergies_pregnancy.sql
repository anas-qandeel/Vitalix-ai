ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS drug_allergies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS food_allergies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_pregnant boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_lactating boolean DEFAULT false;
