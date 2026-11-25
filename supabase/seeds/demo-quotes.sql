-- Seed demo de presupuestos (TASK-012 / F5): presupuestos FICTICIOS para "Demo Norte" y "Demo Sur".
-- Uso y garantias: docs/SEED.md. Se ejecuta con privilegios de administracion (SQL editor, conector o
-- `psql -v ON_ERROR_STOP=1 -f supabase/seeds/demo-quotes.sql`). NO es una migracion y NO se ejecuta
-- en Cloud sin decision humana expresa. Requiere la migracion 20261127090000 y haber ejecutado antes
-- supabase/seeds/demo-crm.sql (los clientes demo con su identidad estable). No depende de demo-orders.sql.
--
-- Diseno (mismo criterio que demo-orders.sql):
--  * Una sola transaccion: si algo falla no se aplica nada. Bloqueo de TRANSACCION
--    (pg_advisory_xact_lock) antes de leer o escribir: dos ejecuciones simultaneas se serializan.
--  * Cada organizacion se resuelve por nombre exacto y su owner por memberships (exactamente 1).
--    Despues el script actua COMO ese owner (rol authenticated + claims JWT) y usa las MISMAS RPC que
--    la aplicacion (create_quote, add_quote_item, accept_quote, reject_quote): se aplican RLS, los
--    triggers de redondeo/solo lectura y los eventos de actividad con el owner como actor (nunca
--    nulo). Los presupuestos ACEPTADOS generan su orden de servicio por la RPC de aceptacion (misma
--    transaccion, mismo cliente). No se desactivan triggers, no se usa el rol de servicio y no se
--    escribe directamente en quotes, quote_items, work_orders ni activity_events.
--  * IDENTIDAD ESTABLE: cada presupuesto demo lleva una clave constante ("k", no cambiar nunca una
--    clave publicada) registrada en private.demo_fixture_identity (entity_type 'quote'). Un
--    presupuesto con identidad NO se vuelve a crear, aunque el usuario lo acepte, rechace o edite:
--    una segunda ejecucion inserta 0 presupuestos, 0 ordenes y 0 eventos.
--  * No destructivo: sin DELETE, TRUNCATE ni DROP; nunca modifica presupuestos existentes. Un fixture
--    cuyo cliente demo no existe, esta archivado o no tiene identidad se omite y se avisa.
--  * Campos del JSON: k=clave estable, c=clave del cliente demo, ti=titulo, d=descripcion ([DEMO]),
--    s=estado final (draft|accepted|rejected), it=conceptos (d=concepto, q=cantidad con hasta 3
--    decimales, p=precio unitario en CENTIMOS enteros, v=IVA en puntos basicos).

begin;

do $seed$
declare
  v_orgs text[] := array['Demo Norte', 'Demo Sur'];
  v_name text;
  v_org uuid;
  v_owner uuid;
  v_n int;
  v_f jsonb;
  v_i jsonb;
  v_id uuid;
  v_fixtures jsonb;
  v_plan jsonb;
  v_new jsonb;
  v_skipped int;
  v_created int;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexovantis.seed.demo-quotes', 0));

  foreach v_name in array v_orgs loop
    select count(*) into v_n from public.organizations where name = v_name;
    if v_n <> 1 then
      raise exception 'seed demo presupuestos: la organizacion "%" debe existir exactamente una vez (hay %)', v_name, v_n;
    end if;
    select id into v_org from public.organizations where name = v_name;

    select count(*) into v_n from public.memberships where organization_id = v_org and role = 'owner';
    if v_n <> 1 then
      raise exception 'seed demo presupuestos: la organizacion "%" debe tener exactamente 1 owner (hay %)', v_name, v_n;
    end if;
    select user_id into v_owner from public.memberships where organization_id = v_org and role = 'owner';

    if v_name = 'Demo Norte' then
      v_fixtures := '[
      {"k":"q01","c":"c02","ti":"Sustitución de bomba del grupo de presión","d":"[DEMO] Suministro e instalación de bomba multicelular y prueba de presión.","s":"draft","it":[
        {"d":"Bomba multicelular 3 kW","q":"1","p":184050,"v":2100},
        {"d":"Mano de obra instalación (horas)","q":"6.5","p":4200,"v":2100},
        {"d":"Material de conexión y válvulas","q":"1","p":15990,"v":2100}]},
      {"k":"q02","c":"c05","ti":"Mantenimiento anual de la piscina","d":"[DEMO] Revisión de depuradora, análisis de agua y limpieza de filtros.","s":"draft","it":[
        {"d":"Revisión de depuradora","q":"1","p":32000,"v":2100},
        {"d":"Productos químicos (kg)","q":"12.5","p":875,"v":1000},
        {"d":"Análisis de agua","q":"2","p":4500,"v":0}]},
      {"k":"q03","c":"c09","ti":"Calibración de equipos de diagnóstico","d":"[DEMO] Calibración periódica con certificado.","s":"draft","it":[
        {"d":"Calibración por equipo","q":"3","p":28000,"v":2100},
        {"d":"Desplazamiento","q":"1","p":6000,"v":2100}]},
      {"k":"q04","c":"c01","ti":"Reforma de la cabina del ascensor","d":"[DEMO] Cambio de espejo, suelo y botonera de la cabina principal.","s":"accepted","it":[
        {"d":"Espejo y revestimiento","q":"1","p":96500,"v":2100},
        {"d":"Botonera con braille","q":"1","p":58000,"v":2100},
        {"d":"Mano de obra (horas)","q":"14","p":4200,"v":2100}]},
      {"k":"q05","c":"c07","ti":"Contrato de mantenimiento de autoclaves","d":"[DEMO] Dos visitas anuales con cambio de juntas incluido.","s":"accepted","it":[
        {"d":"Visita de mantenimiento","q":"2","p":24500,"v":2100},
        {"d":"Juego de juntas","q":"2","p":7390,"v":2100}]},
      {"k":"q06","c":"c12","ti":"Renovación de radiadores del aula 3","d":"[DEMO] Presupuesto para sustituir cuatro radiadores de aluminio.","s":"accepted","it":[
        {"d":"Radiador de aluminio","q":"4","p":11250,"v":1000},
        {"d":"Mano de obra (horas)","q":"5.25","p":4200,"v":1000}]},
      {"k":"q07","c":"c15","ti":"Ampliación del cuadro eléctrico de la nave","d":"[DEMO] Rechazado por el cliente: precio por encima de su previsión.","s":"rejected","it":[
        {"d":"Cuadro de distribución ampliado","q":"1","p":212000,"v":2100},
        {"d":"Mano de obra (horas)","q":"18","p":4200,"v":2100}]},
      {"k":"q08","c":"c20","ti":"Instalación de campana extractora industrial","d":"[DEMO] Rechazado: el cliente opta por otra solución.","s":"rejected","it":[
        {"d":"Campana extractora de acero inoxidable","q":"1","p":143500,"v":2100},
        {"d":"Conducto y accesorios (metros)","q":"7.5","p":3890,"v":2100}]}
    ]'::jsonb;
    else
      v_fixtures := '[
      {"k":"q01","c":"c02","ti":"Cambio de fancoils de habitaciones","d":"[DEMO] Sustitución de seis fancoils antes de la temporada.","s":"draft","it":[
        {"d":"Fancoil de pared","q":"6","p":39900,"v":2100},
        {"d":"Mano de obra (horas)","q":"9.5","p":4200,"v":2100}]},
      {"k":"q02","c":"c03","ti":"Revisión y recarga de extintores","d":"[DEMO] Revisión anual obligatoria de la nave.","s":"accepted","it":[
        {"d":"Revisión de extintor","q":"14","p":1250,"v":2100},
        {"d":"Recarga de extintor de polvo","q":"5","p":1890,"v":2100}]},
      {"k":"q03","c":"c05","ti":"Cabina de pintura: filtros y ventiladores","d":"[DEMO] Rechazado: el cliente pospone la inversión.","s":"rejected","it":[
        {"d":"Juego de filtros","q":"1","p":45500,"v":2100},
        {"d":"Ventilador axial","q":"2","p":87000,"v":2100}]}
    ]'::jsonb;
    end if;

    -- Plan (privilegios de administracion, antes de cambiar de rol): fixtures sin identidad cuyo
    -- cliente demo existe con identidad y sigue activo. Se resuelven los ids aqui porque
    -- private.demo_fixture_identity no es legible para usuarios.
    with fx as (
      select f.value as f, f.ordinality as ord
      from jsonb_array_elements(v_fixtures) with ordinality as f(value, ordinality)
      where not exists (
        select 1 from private.demo_fixture_identity i
        where i.organization_id = v_org and i.entity_type = 'quote' and i.fixture_key = f.value ->> 'k'
      )
    ), resolved as (
      select fx.f, fx.ord,
        (select c.id from private.demo_fixture_identity ic
           join public.customers c on c.id = ic.record_id and c.organization_id = v_org and c.archived_at is null
          where ic.organization_id = v_org and ic.entity_type = 'customer' and ic.fixture_key = fx.f ->> 'c') as customer_id
      from fx
    )
    select coalesce(jsonb_agg(f || jsonb_build_object('cid', customer_id) order by ord)
             filter (where customer_id is not null), '[]'::jsonb),
           (count(*) filter (where customer_id is null))::int
      into v_plan, v_skipped
      from resolved;

    -- Actuar como el owner: mismas RPC, RLS y triggers que la aplicacion.
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    set local role authenticated;

    v_new := '[]'::jsonb;
    for v_f in select value from jsonb_array_elements(v_plan) loop
      v_id := public.create_quote(gen_random_uuid(), (v_f ->> 'cid')::uuid, v_f ->> 'ti', v_f ->> 'd');
      for v_i in select value from jsonb_array_elements(v_f -> 'it') loop
        perform public.add_quote_item(
          v_id, gen_random_uuid(), v_i ->> 'd', (v_i ->> 'q')::numeric, (v_i ->> 'p')::bigint, (v_i ->> 'v')::int
        );
      end loop;
      if v_f ->> 's' = 'accepted' then
        perform public.accept_quote(v_id);
      elsif v_f ->> 's' = 'rejected' then
        perform public.reject_quote(v_id);
      end if;
      v_new := v_new || jsonb_build_array(jsonb_build_object('k', v_f ->> 'k', 'id', v_id));
    end loop;
    v_created := jsonb_array_length(v_new);

    reset role;

    -- Identidad de lo creado ahora (privilegios de administracion, misma transaccion).
    insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
    select v_org, 'quote', e ->> 'k', (e ->> 'id')::uuid from jsonb_array_elements(v_new) e;

    raise notice 'seed demo presupuestos [%]: creados % presupuestos', v_name, v_created;
    if v_skipped > 0 then
      raise notice 'seed demo presupuestos [%]: OMITIDOS % presupuestos porque su cliente demo no existe, esta archivado o no tiene identidad (ejecuta antes demo-crm.sql)',
        v_name, v_skipped;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$seed$;

commit;
