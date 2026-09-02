ALTER TABLE public.weight_plans
  ADD COLUMN IF NOT EXISTS visitation_id uuid NULL
  REFERENCES public.visitations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_weight_plans_visitation
  ON public.weight_plans(visitation_id);
