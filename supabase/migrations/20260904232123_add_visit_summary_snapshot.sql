ALTER TABLE visitations
  ADD COLUMN IF NOT EXISTS took_bp_medication boolean,
  ADD COLUMN IF NOT EXISTS took_sugar_medication boolean,
  ADD COLUMN IF NOT EXISTS recommendations_snapshot jsonb DEFAULT '[]';
