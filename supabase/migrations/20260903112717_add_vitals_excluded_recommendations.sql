ALTER TABLE visitations
  ADD COLUMN IF NOT EXISTS excluded_recommendation_ids uuid[] DEFAULT '{}';
