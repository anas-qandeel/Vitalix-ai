-- مراقبة الذكاء الاصطناعي: تسجيل الفشل والرسائل الاحتياطية + إشعار الجرس

-- 1) سجل الاستخدام: failed = استدعاء فاشل، fallback = رسالة خرجت بالنص الاحتياطي، مع رمز الخطأ ورسالته
alter table public.ai_usage_log
  add column if not exists error_status integer,
  add column if not exists error_message text;

alter table public.ai_usage_log drop constraint if exists ai_usage_log_outcome_check;
alter table public.ai_usage_log add constraint ai_usage_log_outcome_check
  check (outcome in ('used', 'discarded', 'failed', 'fallback'));

-- فهرس لصفحة المراقبة: كل الصيدليات، الأحدث أولاً، الفشل والاحتياطي فقط
create index if not exists ai_usage_log_problems_idx
  on public.ai_usage_log (created_at desc)
  where outcome in ('failed', 'fallback');

-- 2) نوع إشعار جديد للرسالة الاحتياطية (الفهرس الفريد القائم يضمن إشعاراً واحداً لكل صيدلية في اليوم)
alter table public.admin_notifications drop constraint if exists admin_notifications_kind_check;
alter table public.admin_notifications add constraint admin_notifications_kind_check
  check (kind in ('expiring_soon', 'entered_grace', 'expired', 'inactive_pharmacy', 'payment_due', 'ai_fallback'));

-- 3) إدراج الإشعار بلا تكرار — للخادم فقط
create or replace function public.notify_ai_fallback(p_pharmacy_id uuid, p_message text)
returns void
language sql
set search_path = public
as $$
  insert into public.admin_notifications (kind, pharmacy_id, message)
  values ('ai_fallback', p_pharmacy_id, p_message)
  on conflict do nothing;
$$;

revoke execute on function public.notify_ai_fallback(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_ai_fallback(uuid, text) to service_role;
