-- ═══ إصلاح: مالك معطَّل في صيدلية نشطة ═══
-- حالة شاذة لا ينتجها أي مسار (status route يرفض تعطيل المالك
-- بـ403)، لكنها وُجدت في البيانات. تعطيل المالك يحرمه من صيدليته.
update public.pharmacy_staff
set is_active = true
where role = 'owner' and is_active is distinct from true;

-- ═══ حارس على مستوى القاعدة ═══
-- الحماية في مسار واحد لا تكفي: التعديل اليدوي أو مسار مستقبلي
-- يتجاوزها. إيقاف صيدلية يتم عبر pharmacies.status لا عبر
-- تعطيل مالكها.
create or replace function public.prevent_owner_deactivation()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'owner' and new.is_active is distinct from true then
    raise exception 'لا يمكن تعطيل حساب المالك — استخدم إيقاف الصيدلية بدلاً من ذلك';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_owner_deactivation on public.pharmacy_staff;
create trigger trg_prevent_owner_deactivation
  before insert or update on public.pharmacy_staff
  for each row execute function public.prevent_owner_deactivation();

-- ═══ إغلاق نافذة الساعة ═══
-- توكن Supabase عديم الحالة: يُتحقق من توقيعه لا من القاعدة،
-- فالموظف المعطَّل يبقى عاملاً حتى انتهاء توكنه (~ساعة) رغم
-- حظر حسابه. الآن تُراجَع حالته في القاعدة عند كل تقييم سياسة.
--
-- SECURITY DEFINER إلزامي: سياسات pharmacy_staff نفسها تستدعي
-- هذه الدالة، فقراءتها للجدول بصلاحيات المستدعي تُنتج استدعاءً
-- دائرياً. نفس السبب الموثّق فوق is_platform_admin().
create or replace function public.current_pharmacy_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select ps.pharmacy_id
  from public.pharmacy_staff ps
  where ps.user_id = auth.uid()
    and ps.is_active = true
    and ps.pharmacy_id = nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid
  limit 1;
$$;