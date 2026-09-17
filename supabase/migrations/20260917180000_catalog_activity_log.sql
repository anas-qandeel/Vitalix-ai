-- سجل نشاط الكتالوج: trg_log_catalog_activity/log_catalog_activity القديمان كانا مكتوبين
-- لجدول pharmacy_catalog المحذوف (يقرأان NEW.product_name — عمود غير موجود في pharmacy_products)
-- ولم يكونا مربوطين أصلاً بـ pharmacy_products، فلم يُسجَّل أي نشاط كتالوج حتى الآن.
drop trigger if exists trg_log_catalog_activity on public.pharmacy_products;
drop function if exists public.log_catalog_activity();

create or replace function public.log_product_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff_id   uuid;
  v_staff_name text;
  v_pharmacy   uuid;
  v_action     text;
begin
  v_staff_id := public.current_staff_id();
  if v_staff_id is null then
    return coalesce(new, old);
  end if;

  select ps.name, ps.pharmacy_id into v_staff_name, v_pharmacy
  from public.pharmacy_staff ps where ps.id = v_staff_id;

  if TG_OP = 'INSERT' then
    v_action := 'product_added';
  elsif TG_OP = 'UPDATE' then
    if old.is_active is distinct from new.is_active and new.is_active = false then
      v_action := 'product_deactivated';
    else
      v_action := 'product_updated';
    end if;
  else
    v_action := 'product_deleted';
  end if;

  insert into public.activity_log
    (pharmacy_id, staff_id, staff_name, action, entity_type, entity_id, entity_label, details)
  values
    (coalesce(v_pharmacy, coalesce(new.pharmacy_id, old.pharmacy_id)),
     v_staff_id, v_staff_name, v_action, 'product',
     coalesce(new.id, old.id), coalesce(new.brand_name, old.brand_name),
     jsonb_build_object('kind', coalesce(new.kind, old.kind), 'category', coalesce(new.category, old.category)));

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_log_product_activity on public.pharmacy_products;
create trigger trg_log_product_activity
  after insert or delete or update on public.pharmacy_products
  for each row execute function public.log_product_activity();
