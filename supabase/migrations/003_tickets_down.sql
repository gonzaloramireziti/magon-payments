-- Revierte 003_tickets.sql: deja la base como estaba antes de la ticketera.
-- OJO: borra todos los tickets y sus capturas. Solo para deshacer la instalación.

-- Capturas: los objetos del bucket no se borran solos con la tabla. Si Supabase rechaza el
-- delete directo sobre storage, vaciá el bucket desde Storage en el dashboard y volvé a correr.
delete from storage.objects where bucket_id = 'ticket-attachments';
delete from storage.buckets where id = 'ticket-attachments';

drop table if exists public.tickets;

alter table public.clients drop column if exists support_policy;
