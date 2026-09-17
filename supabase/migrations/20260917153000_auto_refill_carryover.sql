-- trigger auto_calculate_next_refill كان يتجاهل carryover_pills ويقرّب بدل التنزيل.
-- الآن: next_refill_date = last_refill_date + floor((pills_per_box × boxes_count + carryover_pills) / daily_dosage)
create or replace function public.auto_calculate_next_refill()
returns trigger
language plpgsql
as $$
begin
  if new.daily_dosage > 0 then
    new.next_refill_date := new.last_refill_date
      + floor((new.pills_per_box * new.boxes_count + coalesce(new.carryover_pills, 0)) / new.daily_dosage)::integer;
  else
    new.next_refill_date := new.last_refill_date + interval '30 days';
  end if;
  return new;
end;
$$;
