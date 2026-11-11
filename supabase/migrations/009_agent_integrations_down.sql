-- Revierte 009_agent_integrations.sql. Borra las credenciales guardadas, los repos y los análisis.
delete from public.ticket_activity where kind in ('triage', 'decision');
alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created'));
alter table public.tickets drop column if exists decisions;
alter table public.tickets drop column if exists triage;
alter table public.clients drop column if exists repos;
alter table public.admin_users drop column if exists anthropic_key_enc;
alter table public.admin_users drop column if exists github_login;
alter table public.admin_users drop column if exists github_token_enc;
