-- سجل نشاط الصيدلية — يراه المالك وحده
--
-- الغرض: توثيق من فعل ماذا داخل الصيدلية (أدوية، مرضى، زيارات).
-- منفصل عن admin_audit_log المخصّص لعمليات مشرف المنصة.
--
-- قرار: لا سياسة INSERT إطلاقاً. الكتابة عبر التريغر وحده
-- (SECURITY DEFINER يتجاوز RLS)، فلا يستطيع موظف تلفيق سجل
-- ولا حذفه.
--
-- قرار: حين تتعذّر هوية الموظف (كتابة عبر supabaseAdmin أو مسار
-- خادم) لا نسجّل شيئاً بدل «مجهول» — سجل ناقص وواضح أفضل من
-- سجل يوهم بالاكتمال.
--
-- المالك يُسجَّل مثل الموظفين: له صف في pharmacy_staff، والتريغر
-- يبحث بـuser_id لا بالدور.

-- ═══════════════════════════════════════════════════════════════
-- ١) هوية الموظف الحالي
-- ═══════════════════════════════════════════════════════════════

create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ps.id
  from public.pharmacy_staff ps
  where ps.user_id = auth.uid()
    and ps.is_active = true
    and ps.pharmacy_id = nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid
  limit 1;
$$;

revoke all on function public.current_staff_id() from public;
grant execute on function public.current_staff_id() to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- ٢) الجدول
-- ═══════════════════════════════════════════════════════════════

create table public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  staff_id    uuid references public.pharmacy_staff(id) on delete set null,
  staff_name  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  entity_label text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index activity_log_pharmacy_created_idx
  on public.activity_log (pharmacy_id, created_at desc);

alter table public.activity_log enable row level security;

-- ═══════════════════════════════════════════════════════════════
-- ٣) القراءة للمالك وحده — ولا سياسة كتابة إطلاقاً
-- ═══════════════════════════════════════════════════════════════

create policy "owner reads own pharmacy activity"
on public.activity_log
for select
to authenticated
using (
  pharmacy_id = public.current_pharmacy_id()
  and public.current_role_name() = 'owner'
);