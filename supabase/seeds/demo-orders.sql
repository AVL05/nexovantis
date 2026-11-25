-- Seed demo de ordenes de servicio (TASK-011 / F4): ordenes FICTICIAS para "Demo Norte" y "Demo Sur".
-- Uso y garantias: docs/SEED.md. Se ejecuta con privilegios de administracion (SQL editor, conector o
-- `psql -v ON_ERROR_STOP=1 -f supabase/seeds/demo-orders.sql`). NO es una migracion y NO se ejecuta
-- en Cloud sin decision humana expresa. Requiere la migracion 20261126090000 y haber ejecutado antes
-- supabase/seeds/demo-crm.sql (los clientes y tecnicos demo con su identidad estable).
--
-- Diseno (mismo criterio que demo-crm.sql):
--  * Una sola transaccion: si algo falla no se aplica nada. Bloqueo de TRANSACCION
--    (pg_advisory_xact_lock) antes de leer o escribir: dos ejecuciones simultaneas se serializan.
--  * Cada organizacion se resuelve por nombre exacto y su owner por memberships (exactamente 1).
--    Despues el script actua COMO ese owner (rol authenticated + claims JWT) y usa las MISMAS RPC que
--    la aplicacion (create/assign/advance/cancel_work_order): se aplican RLS, la matriz de
--    transiciones, las validaciones de cliente/tecnico y los eventos de actividad con el owner como
--    actor (nunca nulo). No se desactivan triggers, no se usa el rol de servicio y no se escribe
--    directamente en activity_events.
--  * IDENTIDAD ESTABLE: cada orden demo lleva una clave constante ("k", no cambiar nunca una clave
--    publicada) registrada en private.demo_fixture_identity (entity_type 'work_order'). Una orden con
--    identidad NO se vuelve a crear, aunque el usuario la edite, avance o cancele: una segunda
--    ejecucion inserta 0 ordenes y genera 0 eventos.
--  * No destructivo: sin DELETE, TRUNCATE ni DROP; nunca modifica ordenes existentes. Un fixture cuyo
--    cliente o tecnico demo no existe, esta archivado o no tiene identidad se omite y se avisa.
--  * Fechas programadas relativas al dia de la PRIMERA ejecucion (dia = desplazamiento en dias).
--  * Campos del JSON: k=clave estable, c=clave del cliente demo, t=clave del tecnico demo (o null),
--    ti=titulo, d=descripcion ([DEMO]), p=prioridad, day=desplazamiento de la fecha, s=estado final
--    (pending|assigned|in_progress|completed|cancelled), r=motivo de cancelacion (opcional).

begin;

do $seed$
declare
  v_orgs text[] := array['Demo Norte', 'Demo Sur'];
  v_name text;
  v_org uuid;
  v_owner uuid;
  v_n int;
  v_f jsonb;
  v_id uuid;
  v_fixtures jsonb;
  v_plan jsonb;
  v_new jsonb;
  v_skipped int;
  v_created int;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexovantis.seed.demo-orders', 0));

  foreach v_name in array v_orgs loop
    select count(*) into v_n from public.organizations where name = v_name;
    if v_n <> 1 then
      raise exception 'seed demo ordenes: la organizacion "%" debe existir exactamente una vez (hay %)', v_name, v_n;
    end if;
    select id into v_org from public.organizations where name = v_name;

    select count(*) into v_n from public.memberships where organization_id = v_org and role = 'owner';
    if v_n <> 1 then
      raise exception 'seed demo ordenes: la organizacion "%" debe tener exactamente 1 owner (hay %)', v_name, v_n;
    end if;
    select user_id into v_owner from public.memberships where organization_id = v_org and role = 'owner';

    if v_name = 'Demo Norte' then
      v_fixtures := '[
      {"k":"o01","c":"c01","t":"t01","ti":"Revisión mensual de ascensores","d":"[DEMO] Inspección de seguridad y engrase de cabinas.","p":"high","day":-20,"s":"completed"},
      {"k":"o02","c":"c02","t":"t02","ti":"Revisión del grupo de presión","d":"[DEMO] Comprobación de presostatos y bombas del grupo común.","p":"normal","day":-15,"s":"completed"},
      {"k":"o03","c":"c04","t":"t03","ti":"Avería en el aire acondicionado de recepción","d":"[DEMO] El equipo no enfría y gotea por la unidad interior.","p":"urgent","day":-9,"s":"completed"},
      {"k":"o04","c":"c07","t":"t04","ti":"Mantenimiento de autoclave","d":"[DEMO] Revisión anual y cambio de juntas.","p":"normal","day":-6,"s":"completed"},
      {"k":"o05","c":"c10","t":"t05","ti":"Cambio de aceite del elevador del taller","d":"[DEMO] Orden anulada antes de iniciar.","p":"low","day":-5,"s":"cancelled","r":"El cliente pospone el trabajo"},
      {"k":"o06","c":"c15","t":"t01","ti":"Revisión del cuadro eléctrico de la nave","d":"[DEMO] Termografía y reapriete de bornes.","p":"high","day":-1,"s":"in_progress"},
      {"k":"o07","c":"c17","t":"t06","ti":"Fallo en la cámara frigorífica 2","d":"[DEMO] La temperatura sube por encima de la consigna.","p":"urgent","day":0,"s":"in_progress"},
      {"k":"o08","c":"c05","t":"t02","ti":"Sustitución de la bomba de la piscina","d":"[DEMO] Bomba con ruido y pérdida de caudal.","p":"normal","day":2,"s":"assigned"},
      {"k":"o09","c":"c12","t":"t03","ti":"Revisión de la calefacción del colegio","d":"[DEMO] Purgado de radiadores y prueba de caldera.","p":"normal","day":3,"s":"assigned"},
      {"k":"o10","c":"c20","t":"t04","ti":"Limpieza de extractores de cocina","d":"[DEMO] Desengrasado de campana y conductos.","p":"low","day":5,"s":"assigned"},
      {"k":"o11","c":"c03","t":null,"ti":"Puerta de garaje bloqueada","d":"[DEMO] El motor no responde al mando.","p":"urgent","day":-2,"s":"pending"},
      {"k":"o12","c":"c06","t":null,"ti":"Revisión de la iluminación de emergencia","d":"[DEMO] Comprobación de autonomía de las luminarias.","p":"normal","day":1,"s":"pending"},
      {"k":"o13","c":"c18","t":null,"ti":"El horno del obrador no alcanza temperatura","d":"[DEMO] Resistencia sospechosa.","p":"high","day":4,"s":"pending"},
      {"k":"o14","c":"c22","t":null,"ti":"Alarma de incendios con falsos avisos","d":"[DEMO] Revisar detectores de la planta 2.","p":"high","day":7,"s":"pending"},
      {"k":"o15","c":"c09","t":null,"ti":"Calibración de equipo de diagnóstico","d":"[DEMO] Calibración periódica anual.","p":"low","day":10,"s":"pending"}
    ]'::jsonb;
    else
      v_fixtures := '[
      {"k":"o01","c":"c01","t":"t01","ti":"Revisión de ascensor","d":"[DEMO] Inspección periódica de seguridad.","p":"normal","day":-10,"s":"completed"},
      {"k":"o02","c":"c02","t":"t02","ti":"Climatización de habitaciones","d":"[DEMO] Revisión de fancoils antes de temporada.","p":"high","day":-4,"s":"completed"},
      {"k":"o03","c":"c05","t":"t03","ti":"Mantenimiento de la cabina de pintura","d":"[DEMO] Orden anulada por el cliente.","p":"low","day":-3,"s":"cancelled"},
      {"k":"o04","c":"c06","t":"t01","ti":"Revisión del cuadro de la nave","d":"[DEMO] Reapriete de bornes y limpieza.","p":"normal","day":0,"s":"in_progress"},
      {"k":"o05","c":"c04","t":"t02","ti":"Calefacción del aula de música","d":"[DEMO] Radiador sin calor.","p":"normal","day":2,"s":"assigned"},
      {"k":"o06","c":"c03","t":null,"ti":"Revisión de extintores","d":"[DEMO] Revisión anual obligatoria.","p":"low","day":3,"s":"pending"},
      {"k":"o07","c":"c07","t":null,"ti":"Fuga de agua en el cuarto de bombas","d":"[DEMO] Humedad en el suelo junto al depósito.","p":"urgent","day":-1,"s":"pending"}
    ]'::jsonb;
    end if;

    -- Plan (privilegios de administracion, antes de cambiar de rol): fixtures sin identidad cuyos
    -- cliente y tecnico demo existen con identidad y siguen activos. Se resuelven los ids aqui porque
    -- private.demo_fixture_identity no es legible para usuarios.
    with fx as (
      select f.value as f, f.ordinality as ord
      from jsonb_array_elements(v_fixtures) with ordinality as f(value, ordinality)
      where not exists (
        select 1 from private.demo_fixture_identity i
        where i.organization_id = v_org and i.entity_type = 'work_order' and i.fixture_key = f.value ->> 'k'
      )
    ), resolved as (
      select fx.f, fx.ord,
        (select c.id from private.demo_fixture_identity ic
           join public.customers c on c.id = ic.record_id and c.organization_id = v_org and c.archived_at is null
          where ic.organization_id = v_org and ic.entity_type = 'customer' and ic.fixture_key = fx.f ->> 'c') as customer_id,
        (select t.id from private.demo_fixture_identity it
           join public.technicians t on t.id = it.record_id and t.organization_id = v_org and t.archived_at is null
          where it.organization_id = v_org and it.entity_type = 'technician' and it.fixture_key = fx.f ->> 't') as technician_id
      from fx
    )
    select coalesce(jsonb_agg(
             f || jsonb_build_object('cid', customer_id, 'tid', technician_id) order by ord
           ) filter (where customer_id is not null and (f ->> 't' is null or technician_id is not null)), '[]'::jsonb),
           (count(*) filter (where customer_id is null or (f ->> 't' is not null and technician_id is null)))::int
      into v_plan, v_skipped
      from resolved;

    -- Actuar como el owner: mismas RPC, RLS y triggers que la aplicacion.
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    set local role authenticated;

    v_new := '[]'::jsonb;
    for v_f in select value from jsonb_array_elements(v_plan) loop
      v_id := public.create_work_order(
        gen_random_uuid(),
        (v_f ->> 'cid')::uuid,
        v_f ->> 'ti',
        v_f ->> 'd',
        v_f ->> 'p',
        current_date + (v_f ->> 'day')::int,
        (v_f ->> 'tid')::uuid
      );
      if v_f ->> 's' = 'in_progress' or v_f ->> 's' = 'completed' then
        perform public.advance_work_order(v_id, 'in_progress');
      end if;
      if v_f ->> 's' = 'completed' then
        perform public.advance_work_order(v_id, 'completed');
      end if;
      if v_f ->> 's' = 'cancelled' then
        perform public.cancel_work_order(v_id, v_f ->> 'r');
      end if;
      v_new := v_new || jsonb_build_array(jsonb_build_object('k', v_f ->> 'k', 'id', v_id));
    end loop;
    v_created := jsonb_array_length(v_new);

    reset role;

    -- Identidad de lo creado ahora (privilegios de administracion, misma transaccion).
    insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
    select v_org, 'work_order', e ->> 'k', (e ->> 'id')::uuid from jsonb_array_elements(v_new) e;

    raise notice 'seed demo ordenes [%]: creadas % ordenes', v_name, v_created;
    if v_skipped > 0 then
      raise notice 'seed demo ordenes [%]: OMITIDAS % ordenes porque su cliente o tecnico demo no existe, esta archivado o no tiene identidad (ejecuta antes demo-crm.sql)',
        v_name, v_skipped;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$seed$;

commit;
