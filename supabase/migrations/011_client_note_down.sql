-- Revierte 011_client_note.sql.
alter table public.tickets drop column if exists client_note;
