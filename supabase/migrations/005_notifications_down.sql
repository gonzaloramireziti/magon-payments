-- Revierte 005_notifications.sql.
drop table if exists public.notification_log;
alter table public.admin_users drop column if exists notify_events;
alter table public.admin_users drop column if exists notify_channels;
