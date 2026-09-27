-- الاقتراحات: المتصفح يرسل فقط (الصيدلية لصيدليتها، سياسة feedback_insert تبقى كما هي).
-- القراءة والتعديل والحذف تمرّ حصراً عبر /api/admin/feedback بمفتاح الخادم (الحذف للمالك وحده هناك).
-- يمنع الصيدلية من قراءة ملاحظات الإدارة الداخلية، ويمنع أي مسؤول من تجاوز قواعد الأدوار من المتصفح.
drop policy if exists "feedback_select" on public.feedback;
drop policy if exists "feedback_admin_update" on public.feedback;
drop policy if exists "feedback_admin_delete" on public.feedback;
revoke select, update, delete on public.feedback from anon, authenticated;
revoke insert on public.feedback from anon;
