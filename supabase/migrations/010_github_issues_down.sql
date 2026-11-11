-- Revierte 010_github_issues.sql. Los issues en GitHub no se tocan; solo se pierde el vínculo.
delete from public.ticket_activity where kind = 'github';
alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created', 'triage', 'decision'));
alter table public.tickets drop column if exists github_issue;
