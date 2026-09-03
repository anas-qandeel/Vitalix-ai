ALTER TABLE visitations
  ADD COLUMN IF NOT EXISTS bp_sys1  integer,
  ADD COLUMN IF NOT EXISTS bp_dia1  integer,
  ADD COLUMN IF NOT EXISTS hr1      integer,
  ADD COLUMN IF NOT EXISTS bp_sys2  integer,
  ADD COLUMN IF NOT EXISTS bp_dia2  integer,
  ADD COLUMN IF NOT EXISTS hr2      integer;