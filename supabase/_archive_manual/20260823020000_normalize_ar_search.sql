-- تطبيع الأسماء العربية للبحث — الهمزات، التاء المربوطة، الألف المقصورة، التشكيل
-- منقول عن normalizeAr في العميل ليتطابق سلوك الشاشات

create or replace function normalize_ar(s text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      regexp_replace(
        translate(
          btrim(s),
          'أإآٱٲٳٵءؤئةىی',
          'اااااااءءءهيي'
        ),
        '[\u064B-\u065F\u0670]', '', 'g'
      ),
      '[\u0653-\u0655]', '', 'g'
    )
  );
$$;

alter table patients
  add column name_normalized text
  generated always as (normalize_ar(name)) stored;

create index idx_patients_name_normalized
  on patients (name_normalized text_pattern_ops);