-- Magon Payments - Esquema Supabase (PostgreSQL)
-- Ejecutar en Supabase -> SQL Editor.

create extension if not exists "pgcrypto";

-- Clientes. La "client_key" es la KEY que Magon define y que el front integra.
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,
  name text not null,
  email text,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  currency text not null default 'ARS',
  active boolean not null default true,
  notes text,
  -- Primer período facturable (YYYY-MM). Si es null se usa el mes de created_at.
  start_period text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Facturas mensuales. Una por cliente y período (YYYY-MM). Vencen el día 10.
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  period text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'ARS',
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid','overdue','canceled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period)
);

-- Pagos creados contra GalioPay.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  provider text not null default 'galiopay',
  provider_payment_id text,
  provider_status text,
  status text not null default 'pending',
  payment_method text,
  amount numeric(12,2) not null default 0,
  net_amount numeric(12,2),
  currency text not null default 'ARS',
  reference_id text,
  money_release_date timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Eventos de webhook para idempotencia.
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'galiopay',
  event_id text not null,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);

create index if not exists idx_clients_client_key on public.clients (client_key);
create index if not exists idx_invoices_client_period on public.invoices (client_id, period);
create index if not exists idx_invoices_status_due on public.invoices (status, due_date);
create index if not exists idx_payments_client on public.payments (client_id);
create index if not exists idx_payments_reference on public.payments (reference_id);
create index if not exists idx_payments_provider_id on public.payments (provider_payment_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- RLS: el backend usa la service role key (bypassa RLS).
-- Sin políticas => ningún acceso con anon/authenticated.
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;

-- Cliente de ejemplo (cambiar la KEY y el monto).
insert into public.clients (client_key, name, email, monthly_amount, currency)
values ('magon-demo-key', 'Cliente Demo Magon', 'demo@magon.dev', 1000, 'ARS')
on conflict (client_key) do nothing;
