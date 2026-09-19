-- Migración: ciclo de facturación contra factura (servicio de agosto vence el 10 de septiembre)
-- y período inicial por cliente.
-- Ejecutar en Supabase -> SQL Editor sobre bases ya creadas.

alter table public.clients
  add column if not exists start_period text;

-- Backfill: usar el mes de alta del cliente como primer período facturable.
update public.clients
set start_period = to_char(
  created_at at time zone 'America/Argentina/Buenos_Aires',
  'YYYY-MM'
)
where start_period is null;

-- Recordatorio de la nueva regla:
--   La factura del período P (mes de servicio) vence el día 10 del mes P+1.
--   Ej: servicio de agosto (2026-08) vence el 10/09/2026 (due_date = 2026-09-10).
--   Bloqueo desde el día 11 si la factura vencida sigue impaga.
