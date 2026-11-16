-- Revierte 015_projects_sales_agenda.sql.
drop table if exists public.reminders;
drop table if exists public.leads;
drop index if exists public.idx_tickets_project;
alter table public.tickets drop column if exists project_id;
drop table if exists public.project_milestones;
drop table if exists public.projects;
