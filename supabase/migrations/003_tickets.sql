-- Ticketera: reportes de problemas y pedidos de funcionalidades de los clientes.
-- Idempotente: se puede ejecutar más de una vez.

-- Qué puede reportar cada cliente, por canal. La clave "default" aplica a cualquier canal
-- que no figure explícitamente. Ejemplos:
--   Solo problemas:                          {"default": ["bug"]}
--   Solo problemas salvo el canal "admin":    {"default": ["bug"], "admin": ["bug", "feature"]}
alter table public.clients
  add column if not exists support_policy jsonb not null
  default '{"default": ["bug", "feature"]}'::jsonb;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  channel text not null default 'default',
  type text not null check (type in ('bug', 'feature')),
  title text not null,
  description text not null,
  expected text,
  actual text,
  urgency text not null default 'medium' check (urgency in ('low', 'medium', 'high', 'critical')),
  status text not null default 'new'
    check (status in ('new', 'analysis', 'ready', 'in_progress', 'testing', 'done', 'discarded')),
  position double precision not null default 0,
  reporter_name text,
  reporter_email text,
  reporter_ref text,
  page_url text,
  user_agent text,
  app_version text,
  attachments jsonb not null default '[]'::jsonb,
  internal_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_status_position on public.tickets (status, position);
create index if not exists idx_tickets_client_created on public.tickets (client_id, created_at desc);

drop trigger if exists trg_tickets_updated_at on public.tickets;
create trigger trg_tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

alter table public.tickets enable row level security;

-- Capturas adjuntas: bucket privado, solo accesible con la service role (URLs firmadas).
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;
