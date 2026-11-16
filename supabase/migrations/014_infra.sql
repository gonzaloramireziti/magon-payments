-- Infraestructura de los clientes: vencimientos (dominios, hosting, SSL...) y monitoreo de caídas.
-- Idempotente: se puede ejecutar más de una vez.

-- Lo que vence: dominios, hosting, certificados, bases, licencias. client_id null = de Magon.
create table if not exists public.client_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('domain', 'hosting', 'ssl', 'database', 'email', 'license', 'other')),
  name text not null,
  provider text,
  expires_on date,
  auto_renew boolean not null default false,
  cost numeric(12, 2),
  currency text not null default 'USD' check (currency in ('ARS', 'USD')),
  notes text,
  -- Último aviso mandado (30, 7, 1 o 0 días antes) para no repetirlo. Se borra al cambiar la fecha.
  last_alert_days integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_assets_expires on public.client_assets (expires_on);
create index if not exists idx_client_assets_client on public.client_assets (client_id);
drop trigger if exists trg_client_assets_updated_at on public.client_assets;
create trigger trg_client_assets_updated_at before update on public.client_assets
  for each row execute function public.set_updated_at();
alter table public.client_assets enable row level security;

-- Monitoreo: una URL por sistema. Se revisa desde /api/cron/uptime. Tras 2 fallas seguidas se
-- marca caída, se abre un ticket crítico y se avisa; al volver, se avisa y se comenta el ticket.
create table if not exists public.uptime_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  name text not null,
  url text not null,
  active boolean not null default true,
  status text check (status in ('up', 'down')),
  fail_count integer not null default 0,
  last_checked_at timestamptz,
  last_change_at timestamptz,
  last_ms integer,
  last_error text,
  incident_ticket_id uuid references public.tickets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_uptime_checks_client on public.uptime_checks (client_id);
drop trigger if exists trg_uptime_checks_updated_at on public.uptime_checks;
create trigger trg_uptime_checks_updated_at before update on public.uptime_checks
  for each row execute function public.set_updated_at();
alter table public.uptime_checks enable row level security;
