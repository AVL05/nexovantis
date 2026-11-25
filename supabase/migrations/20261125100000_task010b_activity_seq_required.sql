-- TASK-010B / B-03: ningun evento NUEVO puede almacenar seq = NULL.
-- La migracion 20261125090100 dejo seq nullable (los eventos historicos conservan NULL) y el DEFAULT
-- solo actua cuando la columna se omite: una insercion administrativa con `seq = NULL` explicito
-- creaba un evento nuevo indistinguible de los historicos.
--
-- CHECK ... NOT VALID se aplica a toda fila insertada o actualizada a partir de ahora, pero NO
-- comprueba (ni reescribe, rellena o bloquea por) las filas existentes: los eventos historicos
-- conservan seq NULL sin orden inventado. No se ejecuta VALIDATE CONSTRAINT: fallaria con los
-- historicos y es intencionado. Los UPDATE siguen bloqueados por la inmutabilidad
-- (prevent_event_change); este CHECK no interfiere con ese trigger ni con el de archivado, que
-- inserta sin indicar seq y recibe el valor de la secuencia.

alter table public.activity_events
  add constraint activity_events_seq_required check (seq is not null) not valid;

comment on constraint activity_events_seq_required on public.activity_events is
  'TASK-010B: los eventos nuevos llevan seq. NOT VALID a proposito: los historicos conservan NULL.';
