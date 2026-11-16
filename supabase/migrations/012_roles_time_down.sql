-- Revierte 012_roles_time.sql (se pierden las horas cargadas y los roles).
drop table if exists public.time_entries;
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users drop column if exists role;
