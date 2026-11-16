-- Conversación con el cliente en cada ticket.
-- - Estado "waiting" (Esperando al cliente): le pedimos información y el ticket queda esperando.
-- - Actividad "to_client" (mensaje del equipo que ve el cliente) y "client_reply" (respuesta del
--   cliente desde «Mis reportes»). Los comentarios de siempre ("comment") siguen siendo internos.
-- Idempotente: se puede ejecutar más de una vez.

alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('new', 'analysis', 'waiting', 'ready', 'in_progress', 'testing', 'done', 'discarded'));

alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created', 'triage', 'decision', 'github',
                  'to_client', 'client_reply'));

create index if not exists idx_ticket_activity_ticket_kind on public.ticket_activity (ticket_id, kind, created_at);
