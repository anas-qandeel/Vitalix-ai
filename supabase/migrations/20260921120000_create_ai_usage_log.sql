-- AI usage ledger: one row per Gemini call, token counts only.
-- No prompt text, no response text, no patient data is ever stored here.
-- Cost is NOT stored: it is computed at display time from a configurable rate,
-- because provider prices change.
create table public.ai_usage_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  pharmacy_id     uuid not null references public.pharmacies(id) on delete cascade,
  user_id         uuid,
  staff_id        uuid,
  feature         text not null,
  step            text not null,
  model           text not null,
  prompt_tokens   integer not null default 0,
  output_tokens   integer not null default 0,
  thoughts_tokens integer not null default 0,
  total_tokens    integer not null default 0,
  outcome         text not null default 'used' check (outcome in ('used', 'discarded'))
);

create index ai_usage_log_pharmacy_created_idx
  on public.ai_usage_log (pharmacy_id, created_at desc);

-- Server-only table: RLS on with no policies, and no grants to browser roles.
alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon, authenticated;
grant all on public.ai_usage_log to service_role;
