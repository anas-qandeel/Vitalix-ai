-- المرحلة 3أ: سجل الدفعات المفصّل. كل دفعة سطر مستقل (المبلغ، التاريخ، الطريقة، الملاحظة، من سجّلها)
-- بدل رقم paid_amount المجمّع فقط. التسجيل والإلغاء عبر دالتين ذرّيتين تقفلان الاشتراك،
-- فيبقى subscriptions.paid_amount دائماً = مجموع دفعاته.

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  pharmacy_id     uuid not null references public.pharmacies(id) on delete cascade,
  amount          numeric(10,2) not null check (amount > 0),
  paid_on         date not null,
  method          text not null check (method in ('cash', 'cliq', 'bank_transfer', 'other')),
  note            text check (note is null or char_length(note) <= 200),
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists payments_subscription_idx on public.payments (subscription_id, paid_on);
create index if not exists payments_paid_on_idx on public.payments (paid_on);

alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;
grant  all on table public.payments to service_role;

-- تسجيل دفعة: يقفل الاشتراك، يرفض ما يتجاوز المتبقي أو تاريخاً في المستقبل (بتوقيت عمّان)،
-- يضيف الدفعة ويحدّث المجموع. أعمدة pharmacies القديمة تُحدَّث فقط إن كان هذا الاشتراك هو الأحدث للصيدلية.
create or replace function public.record_payment(
  p_subscription_id uuid, p_amount numeric, p_paid_on date, p_method text, p_note text, p_actor uuid
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_sub public.subscriptions%rowtype;
  v_new numeric;
  v_row public.payments%rowtype;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Amman')::date then raise exception 'INVALID_DATE'; end if;

  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;

  v_new := round(coalesce(v_sub.paid_amount, 0) + p_amount, 2);
  if v_new > v_sub.final_price then raise exception 'EXCEEDS_REMAINING'; end if;

  insert into public.payments (subscription_id, pharmacy_id, amount, paid_on, method, note, created_by)
  values (v_sub.id, v_sub.pharmacy_id, round(p_amount, 2), p_paid_on, p_method, nullif(btrim(p_note), ''), p_actor)
  returning * into v_row;

  update public.subscriptions set paid_amount = v_new where id = v_sub.id;
  update public.pharmacies set paid_amount = v_new
  where id = v_sub.pharmacy_id
    and not exists (select 1 from public.subscriptions s where s.pharmacy_id = v_sub.pharmacy_id and s.ends_on > v_sub.ends_on);

  return v_row;
end $$;

-- إلغاء دفعة سُجّلت بالخطأ: يحذفها ويعيد حساب المجموع من الدفعات الباقية.
create or replace function public.void_payment(p_payment_id uuid)
returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_pay public.payments%rowtype;
  v_sub public.subscriptions%rowtype;
  v_sum numeric;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  select * into v_sub from public.subscriptions where id = v_pay.subscription_id for update;
  delete from public.payments where id = p_payment_id;

  select coalesce(sum(amount), 0) into v_sum from public.payments where subscription_id = v_sub.id;
  update public.subscriptions set paid_amount = v_sum where id = v_sub.id;
  update public.pharmacies set paid_amount = v_sum
  where id = v_sub.pharmacy_id
    and not exists (select 1 from public.subscriptions s where s.pharmacy_id = v_sub.pharmacy_id and s.ends_on > v_sub.ends_on);

  return v_pay;
end $$;

revoke execute on function public.record_payment(uuid, numeric, date, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.void_payment(uuid) from public, anon, authenticated;
grant  execute on function public.record_payment(uuid, numeric, date, text, text, uuid) to service_role;
grant  execute on function public.void_payment(uuid) to service_role;

-- نقل المدفوع المجمّع الحالي: سطر واحد لكل اشتراك مدفوع (مرة واحدة فقط)
insert into public.payments (subscription_id, pharmacy_id, amount, paid_on, method, note, created_by)
select s.id, s.pharmacy_id, s.paid_amount,
       least((s.created_at at time zone 'Asia/Amman')::date, (now() at time zone 'Asia/Amman')::date),
       'other', 'منقول من المدفوع المجمّع', s.created_by
from public.subscriptions s
where s.paid_amount > 0
  and not exists (select 1 from public.payments p where p.subscription_id = s.id);
