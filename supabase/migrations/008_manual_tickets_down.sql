-- Revierte 008_manual_tickets.sql. Borra las entradas "created" de la actividad
-- (los tickets cargados a mano quedan intactos).

delete from public.ticket_activity where kind = 'created';

alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity
  add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels'));
