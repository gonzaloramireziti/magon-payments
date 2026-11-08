-- Revierte 007_invoice_service.sql. Borra el tipo y la descripción del servicio de cada cliente.

alter table public.clients drop constraint if exists clients_service_type_check;
alter table public.clients drop column if exists service_description;
alter table public.clients drop column if exists service_type;
