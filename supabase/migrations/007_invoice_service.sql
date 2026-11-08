-- Servicio facturado por cliente: tipo y descripción que van como concepto de la factura mensual.
-- Por ahora el único tipo habilitado es "recurring" (Cobro recurrente).
-- Idempotente: se puede ejecutar más de una vez.

alter table public.clients
  add column if not exists service_type text not null default 'recurring';

alter table public.clients
  add column if not exists service_description text;

alter table public.clients drop constraint if exists clients_service_type_check;
alter table public.clients
  add constraint clients_service_type_check check (service_type in ('recurring'));
