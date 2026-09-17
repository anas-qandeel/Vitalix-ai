-- مخزون "جهّز مخزونك": كان محفوظاً في localStorage للمتصفح (بمفتاح عام غير مرتبط بالصيدلية).
-- صف لكل (صيدلية، دواء). med_key = الاسم بعد trim + lowercase كما في الشاشة.
create table if not exists public.inventory_stock (
  id               uuid primary key default gen_random_uuid(),
  pharmacy_id      uuid not null references public.pharmacies(id) on delete cascade,
  med_key          text not null,
  boxes_confirmed  integer not null default 0 check (boxes_confirmed >= 0),
  boxes_remaining  integer not null default 0 check (boxes_remaining >= 0),
  partial_boxes    integer not null default 0 check (partial_boxes >= 0),
  confirmed_at     timestamptz,
  confirmed_by     uuid references public.pharmacy_staff(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (pharmacy_id, med_key)
);
create index if not exists idx_inventory_stock_ph on public.inventory_stock (pharmacy_id);

alter table public.inventory_stock enable row level security;
drop policy if exists "inventory_stock_tenant_rw" on public.inventory_stock;
create policy "inventory_stock_tenant_rw" on public.inventory_stock
  to authenticated
  using (pharmacy_id = public.current_pharmacy_id())
  with check (pharmacy_id = public.current_pharmacy_id());

drop trigger if exists trg_inventory_stock_updated_at on public.inventory_stock;
create trigger trg_inventory_stock_updated_at
  before update on public.inventory_stock
  for each row execute function public.set_updated_at();
