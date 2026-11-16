-- Revierte 013_client_conversation.sql. Los tickets "waiting" vuelven a "analysis" y se borran
-- los mensajes con el cliente.
update public.tickets set status = 'analysis' where status = 'waiting';
delete from public.ticket_activity where kind in ('to_client', 'client_reply');
drop index if exists public.idx_ticket_activity_ticket_kind;

alter table public.tickets drop constraint if exists tickets_status_check;
alter table public.tickets add constraint tickets_status_check
  check (status in ('new', 'analysis', 'ready', 'in_progress', 'testing', 'done', 'discarded'));

alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created', 'triage', 'decision', 'github'));
