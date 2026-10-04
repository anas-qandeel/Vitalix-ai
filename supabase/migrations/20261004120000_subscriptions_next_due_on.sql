-- موعد استحقاق الدفعة التالية: يُسجَّل حين يكون المدفوع أقل من المستحق. null = بلا موعد.
alter table public.subscriptions
  add column if not exists next_due_on date;

alter table public.subscriptions drop constraint if exists subscriptions_next_due_on_check;
alter table public.subscriptions add constraint subscriptions_next_due_on_check
  check (next_due_on is null or next_due_on >= starts_on);
