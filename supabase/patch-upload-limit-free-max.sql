-- Setzt den Aufgaben-/Reflexions-Dateiupload auf das maximale kostenlose Supabase-Limit.
-- Supabase Free Plan: maximal 50 MB pro Datei fuer Storage Uploads.
-- Im Supabase SQL Editor ausfuehren.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments',
  'task-attachments',
  false,
  52428800,
  null
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
