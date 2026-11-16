-- Proyectos (desarrollos con etapas y entrega), ventas (prospectos y presupuestos) y agenda.
-- Idempotente: se puede ejecutar más de una vez.

-- Proyectos: un desarrollo grande para un cliente, con presupuesto, horas estimadas y etapas.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'planning'
    check (status in ('planning', 'in_progress', 'paused', 'delivered', 'cancelled')),
  owner_id uuid references public.admin_users(id) on delete set null,
  start_date date,
  due_date date,
  estimated_hours numeric(8, 2),
  budget numeric(12, 2),
  currency text not null default 'USD' check (currency in ('ARS', 'USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_client on public.projects (client_id);
drop trigger if exists trg_projects_updated_at on public.projects;
create trigger trg_projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();
alter table public.projects enable row level security;

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  due_date date,
  done_at timestamptz,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_milestones_project on public.project_milestones (project_id, position);
alter table public.project_milestones enable row level security;

-- Un ticket puede ser parte de un proyecto (sus horas y su avance suman al proyecto).
alter table public.tickets add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists idx_tickets_project on public.tickets (project_id);

-- Ventas: prospectos con su etapa, presupuesto y próximo paso. Al ganarlo se convierte en cliente.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  email text,
  phone text,
  source text,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost')),
  -- Presupuesto del desarrollo (pago único) y abono mensual esperado.
  quote_amount numeric(12, 2),
  monthly_amount numeric(12, 2),
  currency text not null default 'USD' check (currency in ('ARS', 'USD')),
  next_step text,
  next_step_date date,
  owner_id uuid references public.admin_users(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  lost_reason text,
  notes text,
  stage_since timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_stage on public.leads (stage);
drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();
alter table public.leads enable row level security;

-- Agenda: reuniones y recordatorios de cada usuario, opcionalmente atados a un cliente, prospecto o ticket.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.admin_users(id) on delete cascade,
  title text not null,
  kind text not null default 'reminder' check (kind in ('reminder', 'meeting', 'call')),
  due_at timestamptz not null,
  client_id uuid references public.clients(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  notes text,
  done_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_reminders_user_due on public.reminders (user_id, due_at);
create index if not exists idx_reminders_pending on public.reminders (due_at) where done_at is null and notified_at is null;
alter table public.reminders enable row level security;
