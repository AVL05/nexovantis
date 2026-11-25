-- TASK-010 / A02-05: orden fiable de los eventos de actividad.
-- occurred_at es now() (hora de INICIO de la transaccion): archivar, restaurar y archivar en una
-- misma transaccion produce eventos con la misma marca. seq la asigna la base de datos (secuencia)
-- en cada INSERT del trigger de archivado y desempata: es unico y crece en el orden de insercion.
-- Para los eventos de una misma entidad la insercion ocurre con la fila de origen bloqueada por su
-- UPDATE, asi que el orden de seq coincide con el de confirmacion.
--
-- Eventos HISTORICOS (anteriores a esta migracion): conservan seq NULL. Cuando comparten
-- occurred_at su orden relativo no es reconstruible y no se inventa uno. Las lecturas ordenan por
-- occurred_at y despues seq (los historicos se distinguen solo por occurred_at).
--
-- La columna no es escribible por usuarios (anon/authenticated no tienen INSERT ni UPDATE en la
-- tabla; solo SELECT, que cubre la nueva columna) y sigue inmutable (prevent_event_change). La
-- secuencia no se concede a ningun rol de la API: la usa el trigger SECURITY DEFINER.

alter table public.activity_events add column seq bigint;

create sequence public.activity_events_seq_seq as bigint owned by public.activity_events.seq;

revoke all on sequence public.activity_events_seq_seq from public, anon, authenticated;

-- Solo afecta a las filas que se inserten a partir de ahora; no reescribe las existentes.
alter table public.activity_events
  alter column seq set default nextval('public.activity_events_seq_seq');

-- Unico (los NULL historicos no entran en conflicto entre si).
create unique index activity_events_seq_key on public.activity_events (seq);

comment on column public.activity_events.seq is
  'Orden de insercion asignado por la base de datos. NULL en eventos anteriores a TASK-010.';
