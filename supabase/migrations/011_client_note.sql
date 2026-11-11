-- Mensaje para el cliente al cerrar un ticket (motivo del descarte o nota de la resolución).
-- Lo ve quien lo reportó en «Mis reportes» y va en el correo de cambio de estado.
-- Idempotente: se puede ejecutar más de una vez.
alter table public.tickets add column if not exists client_note text;
