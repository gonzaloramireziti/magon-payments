-- Roles del panel y registro de horas.
-- Idempotente: se puede ejecutar más de una vez.

-- Rol de cada usuario: admin (todo), dev (sin plata) o soporte (sin plata, bóveda ni agente).
-- Los usuarios que ya existían quedan como admin para que nadie pierda acceso; los nuevos
-- arrancan como dev y el admin les cambia el rol desde Usuarios.
alter table public.admin_users add column if not exists role text not null default 'admin';
alter table public.admin_users alter column role set default 'dev';
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('admin', 'dev', 'soporte'));

-- Horas trabajadas. Cada fila es un rato de trabajo de una persona, sobre un ticket, un cliente
-- o tarea interna (sin cliente). Mientras corre el cronómetro, running_since tiene la hora de
-- inicio y minutes es null; al frenarlo se calculan los minutos.
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  client_id uuid references public.clients(id) on delete cascade,
  work_date date not null default current_date,
  minutes integer check (minutes is null or (minutes between 1 and 1440)),
  running_since timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_state_check check ((minutes is null) = (running_since is not null))
);

-- Un solo cronómetro corriendo por persona.
create unique index if not exists idx_time_entries_running on public.time_entries (user_id) where running_since is not null;
create index if not exists idx_time_entries_user_date on public.time_entries (user_id, work_date);
create index if not exists idx_time_entries_client_date on public.time_entries (client_id, work_date);
create index if not exists idx_time_entries_ticket on public.time_entries (ticket_id);

drop trigger if exists trg_time_entries_updated_at on public.time_entries;
create trigger trg_time_entries_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;
