-- Revierte 004_panel_users.sql. Borra usuarios del panel, responsables, etiquetas e historial.

drop table if exists public.ticket_activity;

drop index if exists public.idx_tickets_assignee;
alter table public.tickets drop column if exists assignee_id;
alter table public.tickets drop column if exists labels;

drop table if exists public.admin_users;
