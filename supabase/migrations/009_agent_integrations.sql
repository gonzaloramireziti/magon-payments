-- Integraciones por usuario (GitHub, Anthropic), repos por cliente y clasificación de tickets.
-- Idempotente: se puede ejecutar más de una vez.

-- Credenciales de cada usuario, cifradas con VAULT_KEY (AES-256-GCM). Nunca en claro.
alter table public.admin_users add column if not exists github_token_enc text;
alter table public.admin_users add column if not exists github_login text;
alter table public.admin_users add column if not exists anthropic_key_enc text;

-- Repositorios de GitHub de cada cliente ("owner/nombre"); el primero es el de por defecto.
alter table public.clients add column if not exists repos text[] not null default '{}';

-- Análisis de Claude (directo o necesita decisión, con sus preguntas) y respuestas del equipo.
alter table public.tickets add column if not exists triage jsonb;
alter table public.tickets add column if not exists decisions jsonb not null default '[]'::jsonb;

-- Nuevos tipos de actividad: análisis y decisiones.
alter table public.ticket_activity drop constraint if exists ticket_activity_kind_check;
alter table public.ticket_activity add constraint ticket_activity_kind_check
  check (kind in ('comment', 'status', 'assignee', 'urgency', 'labels', 'created', 'triage', 'decision'));
