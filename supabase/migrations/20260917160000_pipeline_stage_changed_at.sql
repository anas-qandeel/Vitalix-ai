-- لحظة دخول المرحلة الحالية. updated_at يتغير مع أي تعديل (حتى حفظ ملاحظة) فكان عداد "بدون رد" يتصفّر.
alter table public.refill_tracking_pipeline
  add column if not exists stage_changed_at timestamptz;

update public.refill_tracking_pipeline
  set stage_changed_at = coalesce(updated_at, now())
  where stage_changed_at is null;

alter table public.refill_tracking_pipeline
  alter column stage_changed_at set default now(),
  alter column stage_changed_at set not null;

create or replace function public.set_pipeline_stage_changed_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.stage_changed_at := coalesce(new.stage_changed_at, now());
  elsif new.pipeline_stage is distinct from old.pipeline_stage then
    new.stage_changed_at := now();
  else
    new.stage_changed_at := old.stage_changed_at; -- أي تعديل آخر لا يمسه
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pipeline_stage_changed_at on public.refill_tracking_pipeline;
create trigger trg_pipeline_stage_changed_at
  before insert or update on public.refill_tracking_pipeline
  for each row execute function public.set_pipeline_stage_changed_at();
