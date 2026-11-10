-- Carga manual de tickets desde el panel (pedidos que llegan por WhatsApp, mail, llamadas...).
-- Suma el tipo de actividad "created" para registrar quién cargó el ticket a mano.
-- Idempotente: se puede ejecutar más de una vez.

alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity
  add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created'));
