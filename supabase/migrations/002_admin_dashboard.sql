-- Migración: costos fijos mensuales y teléfono de cliente para el panel de administración.
-- Ejecutar en Supabase -> SQL Editor sobre bases ya creadas.

alter table public.clients add column if not exists phone text;

create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'ARS',
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_costs_active on public.costs (active);

drop trigger if exists trg_costs_updated_at on public.costs;
create trigger trg_costs_updated_at before update on public.costs
  for each row execute function public.set_updated_at();

alter table public.costs enable row level security;
