-- Usuarios del panel, responsables y etiquetas de tickets, e historial de actividad.
-- Idempotente: se puede ejecutar más de una vez.

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  -- scrypt: "salt:hash" en hex. Null hasta que la persona acepta la invitación.
  password_hash text,
  active boolean not null default true,
  -- sha256 del token de invitación; el token en claro solo viaja en el link.
  invite_token_hash text,
  invite_expires_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;

alter table public.tickets
  add column if not exists assignee_id uuid references public.admin_users(id) on delete set null;
alter table public.tickets
  add column if not exists labels text[] not null default '{}';

create index if not exists idx_tickets_assignee on public.tickets (assignee_id);

-- Historial de cada ticket: comentarios internos y cambios (estado, responsable, etiquetas...).
create table if not exists public.ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid references public.admin_users(id) on delete set null,
  author_name text,
  kind text not null check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels')),
  body text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_activity_ticket on public.ticket_activity (ticket_id, created_at);

alter table public.ticket_activity enable row level security;
