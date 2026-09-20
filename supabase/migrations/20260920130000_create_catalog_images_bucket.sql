-- Bucket for catalog product images.
-- Was created manually in the dashboard; this makes it reproducible on a fresh project.
-- Limits mirror the client-side checks in src/components/ImageUploadField.tsx
-- (2 MB after compression; jpeg/png/webp only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
