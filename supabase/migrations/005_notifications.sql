-- Avisos por usuario: cada uno elige canales (WhatsApp, Discord, correo) y eventos.
-- Idempotente: se puede ejecutar más de una vez.

-- {"whatsapp": {"enabled": true, "number": "549..."}, "discord": {"enabled": true, "webhook": "https://discord.com/api/webhooks/..."},
--  "email": {"enabled": true, "address": "..."}}
alter table public.admin_users
  add column if not exists notify_channels jsonb not null default '{}'::jsonb;

-- Eventos que quiere recibir: new_ticket, assigned, comment.
alter table public.admin_users
  add column if not exists notify_events text[] not null default '{new_ticket,assigned,comment}';

-- Registro de envíos, para ver qué salió y qué falló.
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.admin_users(id) on delete cascade,
  channel text not null,
  event text not null,
  ticket_id uuid references public.tickets(id) on delete set null,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_log_created on public.notification_log (created_at desc);

alter table public.notification_log enable row level security;
