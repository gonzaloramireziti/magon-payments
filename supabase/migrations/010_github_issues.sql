-- Etapa 2 del agente: cada ticket puede tener su issue en el repo del cliente, donde trabaja
-- Claude Code (GitHub Action). Idempotente: se puede ejecutar más de una vez.

-- { repo, number, url, createdAt, createdBy, lastQuestionsCommentId }
alter table public.tickets add column if not exists github_issue jsonb;

alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created', 'triage', 'decision', 'github'));
