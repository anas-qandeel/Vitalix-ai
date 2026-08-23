-- updated_at في refill_tracking_pipeline كان له default now() فقط، فيتجمّد عند الإنشاء
-- ورسائل مرحلة no_response تحسب المدة منه، فكانت مجمّدة تبعاً له

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_pipeline_updated_at
  before update on refill_tracking_pipeline
  for each row execute function set_updated_at();