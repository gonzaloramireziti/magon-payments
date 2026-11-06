-- Documentación técnica y bóveda de credenciales cifradas.
-- Idempotente: se puede ejecutar más de una vez.

create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'general',
  client_id uuid references public.clients(id) on delete set null,
  tags text[] not null default '{}',
  content text not null default '',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_docs_updated_at on public.docs;
create trigger trg_docs_updated_at before update on public.docs
  for each row execute function public.set_updated_at();

create index if not exists idx_docs_category on public.docs (category);
alter table public.docs enable row level security;

-- secret_enc: AES-256-GCM con la clave VAULT_KEY, que vive solo en el servidor (Vercel).
-- En la base nunca hay credenciales en claro.
create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'other' check (kind in ('server', 'database', 'api', 'panel', 'email', 'other')),
  client_id uuid references public.clients(id) on delete set null,
  host text,
  username text,
  secret_enc text,
  notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_vault_items_updated_at on public.vault_items;
create trigger trg_vault_items_updated_at before update on public.vault_items
  for each row execute function public.set_updated_at();

alter table public.vault_items enable row level security;

-- Quién vio o copió cada credencial, y cuándo.
create table if not exists public.vault_access_log (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.vault_items(id) on delete set null,
  item_name text,
  user_id uuid references public.admin_users(id) on delete set null,
  user_name text,
  action text not null check (action in ('reveal', 'create', 'update', 'delete', 'unlock', 'unlock_failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_vault_access_log_created on public.vault_access_log (created_at desc);
alter table public.vault_access_log enable row level security;
