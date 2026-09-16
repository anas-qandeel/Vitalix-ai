-- من أكّد بطاقة الأمان (معرّف صف الموظف في pharmacy_staff) — المسؤولية باسم صاحبها، لا بالوقت فقط
ALTER TABLE public.pharmacy_products ADD COLUMN IF NOT EXISTS profile_confirmed_by uuid REFERENCES public.pharmacy_staff(id) ON DELETE SET NULL;
