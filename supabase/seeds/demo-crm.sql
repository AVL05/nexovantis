-- Seed demo de Nexovantis (TASK-008C, identidad estable TASK-010): clientes y tecnicos FICTICIOS para
-- "Demo Norte" y "Demo Sur". Uso y garantias: docs/SEED.md. Se ejecuta con privilegios de
-- administracion (SQL editor, conector o `psql -v ON_ERROR_STOP=1 -f supabase/seeds/demo-crm.sql`).
-- NO es una migracion. Requiere la migracion 20261125090300 (private.demo_fixture_identity).
--
-- Diseno:
--  * Una sola transaccion: si algo falla (organizacion ausente, 0 o varios owners, etc.) no
--    se aplica nada. Lo primero es un bloqueo de TRANSACCION (pg_advisory_xact_lock): dos
--    ejecuciones simultaneas se serializan y la segunda ve lo ya insertado por la primera; el
--    bloqueo se libera solo al terminar (commit o rollback), sin riesgo de quedar retenido.
--  * Cada organizacion se resuelve por nombre exacto y su owner por memberships. Despues el
--    script actua COMO ese owner (rol authenticated + claims JWT): se aplican RLS, GRANT por
--    columna y el trigger de archivado, y el actor de los eventos del historial es el owner.
--    No se desactivan triggers, no se usa el rol de servicio ni se escribe en activity_events.
--  * IDENTIDAD ESTABLE: cada fixture lleva una clave constante ("k") que no depende de ningun campo
--    editable. Al insertar un fixture se registra (organizacion, tipo, clave) -> id de la fila en
--    private.demo_fixture_identity (sin privilegios para usuarios). Un fixture con identidad
--    registrada NUNCA se vuelve a insertar, aunque el usuario lo renombre, edite, archive o restaure.
--  * No destructivo: nunca modifica ni borra filas existentes. El archivado inicial se aplica
--    UNICAMENTE a las filas insertadas en esta misma ejecucion. Una segunda ejecucion no cambia
--    nada ni genera eventos.
--  * Filas sin identidad registrada (p. ej. instaladas por la version anterior del seed, o del
--    usuario): un fixture sin identidad NO se inserta si ya existe en su organizacion una fila sin
--    identidad con su mismo nombre o con su misma firma de contacto (email + telefono + notas).
--    Se omite y se avisa (RAISE NOTICE) para no duplicar ni alterar nada: primero hay que
--    reconciliar con supabase/seeds/reconcile-demo-crm.sql (docs/SEED.md).
--  * Telefonos: prefijo +34 000, que no es asignable a ningun abonado real, para que ningun
--    dato de demostracion pueda llamar o mensajear a una persona o empresa real.
--  * Emails: solo subdominios de example.com (dominio reservado, RFC 2606).
--  * Notas: marcadas con "[DEMO]". Campos del JSON: k=clave estable (NO cambiar nunca una clave
--    publicada), n=nombre, e=email, p=telefono, t=notas, a=true si debe quedar archivado.

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
  v_customers jsonb;
  v_technicians jsonb;
  v_c_pending jsonb;
  v_t_pending jsonb;
  v_c_new jsonb;
  v_t_new jsonb;
  v_c_skipped int;
  v_t_skipped int;
  v_c_arch int;
  v_t_arch int;
  v_c_active int;
  v_c_archived int;
  v_t_active int;
  v_t_archived int;
  v_events int;
begin
  -- Bloqueo de transaccion ANTES de leer o escribir nada.
  perform pg_advisory_xact_lock(hashtextextended('nexovantis.seed.demo-crm', 0));

  foreach v_name in array v_orgs loop
    -- Resolucion con privilegios de administracion (aun sin rol de usuario).
    select count(*) into v_n from public.organizations where name = v_name;
    if v_n <> 1 then
      raise exception 'seed demo: la organizacion "%" debe existir exactamente una vez (hay %)', v_name, v_n;
    end if;
    select id into v_org from public.organizations where name = v_name;

    select count(*) into v_n from public.memberships where organization_id = v_org and role = 'owner';
    if v_n <> 1 then
      raise exception 'seed demo: la organizacion "%" debe tener exactamente 1 owner (hay %)', v_name, v_n;
    end if;
    select user_id into v_owner from public.memberships where organization_id = v_org and role = 'owner';

    if v_name = 'Demo Norte' then
      v_customers := '[
      {"k":"c01","n":"Comunidad de Propietarios Los Almendros","e":"administracion@comunidad-de-propietarios-los-almendros.example.com","p":"+34 000 100 100","t":"[DEMO] Mantenimiento preventivo de ascensores y puertas de garaje","a":false},
      {"k":"c02","n":"Comunidad de Propietarios Residencial Mirador","e":"administracion@comunidad-de-propietarios-residencial-mirador.example.com","p":"+34 000 100 101","t":"[DEMO] Contrato anual de revision de grupo de presion y fontaneria comun","a":false},
      {"k":"c03","n":"Comunidad de Propietarios Parque Azul","e":"administracion@comunidad-de-propietarios-parque-azul.example.com","p":"+34 000 100 102","t":"[DEMO] Revision semestral de instalacion electrica de zonas comunes","a":false},
      {"k":"c04","n":"Hotel Brisamar","e":"mantenimiento@hotel-brisamar.example.com","p":"+34 000 100 103","t":"[DEMO] Contrato de mantenimiento preventivo trimestral de climatizacion","a":false},
      {"k":"c05","n":"Hotel Costa Serena","e":"mantenimiento@hotel-costa-serena.example.com","p":"+34 000 100 104","t":"[DEMO] Mantenimiento de calderas y produccion de agua caliente sanitaria","a":false},
      {"k":"c06","n":"Apartamentos Playa Dorada","e":"recepcion@apartamentos-playa-dorada.example.com","p":"+34 000 100 105","t":"[DEMO] Averias puntuales de aire acondicionado en temporada alta","a":false},
      {"k":"c07","n":"Clínica Dental Sonrisa Norte","e":"gerencia@clinica-dental-sonrisa-norte.example.com","p":"+34 000 100 106","t":"[DEMO] Revision anual de instalacion de aire comprimido y aspiracion","a":false},
      {"k":"c08","n":"Centro Médico Valleverde","e":"mantenimiento@centro-medico-valleverde.example.com","p":"+34 000 100 107","t":"[DEMO] Mantenimiento de climatizacion de quirofanos y salas limpias","a":false},
      {"k":"c09","n":"Clínica Veterinaria Cuatro Patas","e":"gerencia@clinica-veterinaria-cuatro-patas.example.com","p":"+34 000 100 108","t":"[DEMO] Revision de sistema contra incendios y alumbrado de emergencia","a":false},
      {"k":"c10","n":"Taller Mecánico El Pistón","e":"taller@taller-mecanico-el-piston.example.com","p":"+34 000 100 109","t":"[DEMO] Mantenimiento de compresores y red de aire del taller","a":false},
      {"k":"c11","n":"Talleres Ribera Motor","e":"taller@talleres-ribera-motor.example.com","p":"+34 000 100 110","t":"[DEMO] Revision electrica y de cuadros de elevadores hidraulicos","a":false},
      {"k":"c12","n":"Colegio Alameda Viva","e":"secretaria@colegio-alameda-viva.example.com","p":"+34 000 100 111","t":"[DEMO] Mantenimiento de calefaccion y revision de extintores antes del curso","a":false},
      {"k":"c13","n":"Escuela Infantil Pequeños Pasos","e":"direccion@escuela-infantil-pequenos-pasos.example.com","p":"+34 000 100 112","t":"[DEMO] Revision de fontaneria y agua caliente en aseos infantiles","a":false},
      {"k":"c14","n":"Instituto Técnico Horizonte","e":"secretaria@instituto-tecnico-horizonte.example.com","p":"+34 000 100 113","t":"[DEMO] Mantenimiento de instalaciones electricas de aulas-taller","a":false},
      {"k":"c15","n":"Nave Industrial Polígono Las Eras","e":"mantenimiento@nave-industrial-poligono-las-eras.example.com","p":"+34 000 100 114","t":"[DEMO] Revision de puentes grua y cuadros electricos de la nave","a":false},
      {"k":"c16","n":"Logística Rápida del Norte","e":"mantenimiento@logistica-rapida-del-norte.example.com","p":"+34 000 100 115","t":"[DEMO] Mantenimiento de muelles de carga y puertas seccionales","a":false},
      {"k":"c17","n":"Almacenes Frigoríficos Ártico","e":"mantenimiento@almacenes-frigorificos-artico.example.com","p":"+34 000 100 116","t":"[DEMO] Mantenimiento de camaras frigorificas y control de temperatura","a":false},
      {"k":"c18","n":"Panadería Obrador Trigal","e":"obrador@panaderia-obrador-trigal.example.com","p":"+34 000 100 117","t":"[DEMO] Revision de hornos y camaras de fermentacion","a":false},
      {"k":"c19","n":"Supermercado Mercadillo Fresco","e":"tienda@supermercado-mercadillo-fresco.example.com","p":"+34 000 100 118","t":"[DEMO] Mantenimiento de muebles frigorificos y centrales de frio","a":false},
      {"k":"c20","n":"Restaurante La Brasa Vieja","e":"reservas@restaurante-la-brasa-vieja.example.com","p":"+34 000 100 119","t":"[DEMO] Limpieza y revision de extraccion de humos y campana","a":false},
      {"k":"c21","n":"Gimnasio Fuerza y Salud","e":"gerencia@gimnasio-fuerza-y-salud.example.com","p":"+34 000 100 120","t":"[DEMO] Mantenimiento de climatizacion y deshumectadoras de vestuarios","a":false},
      {"k":"c22","n":"Residencia de Mayores Atardecer","e":"direccion@residencia-de-mayores-atardecer.example.com","p":"+34 000 100 121","t":"[DEMO] Mantenimiento de ascensores, sistema PCI y llamada de enfermeria","a":false},
      {"k":"c23","n":"Oficinas Centro Empresarial Cantábrico","e":"administracion@oficinas-centro-empresarial-cantabrico.example.com","p":"+34 000 100 122","t":"[DEMO] Contrato integral de climatizacion y electricidad de oficinas","a":false},
      {"k":"c24","n":"Polideportivo Municipal Los Pinos","e":"mantenimiento@polideportivo-municipal-los-pinos.example.com","p":"+34 000 100 123","t":"[DEMO] Mantenimiento de depuradora, calefaccion y alumbrado de pistas","a":false},
      {"k":"c25","n":"Hotel Rincón del Valle","e":"mantenimiento@hotel-rincon-del-valle.example.com","p":"+34 000 100 124","t":"[DEMO] Contrato rescindido por cierre del establecimiento (archivado de demostracion)","a":true},
      {"k":"c26","n":"Metálicas Granito","e":"taller@metalicas-granito.example.com","p":"+34 000 100 125","t":"[DEMO] Taller cerrado, sin servicios pendientes (archivado de demostracion)","a":true},
      {"k":"c27","n":"Comunidad de Propietarios Edificio Aurora","e":"administracion@comunidad-de-propietarios-edificio-aurora.example.com","p":"+34 000 100 126","t":"[DEMO] Baja de contrato por cambio de administrador (archivado de demostracion)","a":true}
    ]'::jsonb;
      v_technicians := '[
      {"k":"t01","n":"Marta Soler Vidal","e":"marta.soler@demo-norte.example.com","p":"+34 000 500 100","t":"[DEMO] Especialidad: climatizacion","a":false},
      {"k":"t02","n":"Javier Ortega Lara","e":"javier.ortega@demo-norte.example.com","p":"+34 000 500 101","t":"[DEMO] Especialidad: electricidad","a":false},
      {"k":"t03","n":"Lucía Fernández Rey","e":"lucia.fernandez@demo-norte.example.com","p":"+34 000 500 102","t":"[DEMO] Especialidad: fontaneria","a":false},
      {"k":"t04","n":"Andrés Molina Cuesta","e":"andres.molina@demo-norte.example.com","p":"+34 000 500 103","t":"[DEMO] Especialidad: ascensores","a":false},
      {"k":"t05","n":"Raquel Iglesias Pardo","e":"raquel.iglesias@demo-norte.example.com","p":"+34 000 500 104","t":"[DEMO] Especialidad: proteccion contra incendios (PCI)","a":false},
      {"k":"t06","n":"Sergio Navarro Beltrán","e":"sergio.navarro@demo-norte.example.com","p":"+34 000 500 105","t":"[DEMO] Especialidad: frio industrial","a":false},
      {"k":"t07","n":"Ignacio Paredes Gil","e":"ignacio.paredes@demo-norte.example.com","p":"+34 000 500 106","t":"[DEMO] Especialidad: electricidad. Baja de la plantilla (archivado de demostracion)","a":true},
      {"k":"t08","n":"Carmen Bosch Vera","e":"carmen.bosch@demo-norte.example.com","p":"+34 000 500 107","t":"[DEMO] Especialidad: climatizacion. Baja de la plantilla (archivado de demostracion)","a":true}
    ]'::jsonb;
    else
      v_customers := '[
      {"k":"c01","n":"Comunidad de Propietarios Jardines del Sur","e":"administracion@comunidad-de-propietarios-jardines-del-sur.example.com","p":"+34 000 200 100","t":"[DEMO] Mantenimiento de ascensores y fontaneria de bloques","a":false},
      {"k":"c02","n":"Hotel Sol de Poniente","e":"mantenimiento@hotel-sol-de-poniente.example.com","p":"+34 000 200 101","t":"[DEMO] Contrato de climatizacion y mantenimiento de piscina climatizada","a":false},
      {"k":"c03","n":"Clínica Fisioterapia Movimiento","e":"gerencia@clinica-fisioterapia-movimiento.example.com","p":"+34 000 200 102","t":"[DEMO] Revision anual de climatizacion y electricidad","a":false},
      {"k":"c04","n":"Colegio Olivar Claro","e":"secretaria@colegio-olivar-claro.example.com","p":"+34 000 200 103","t":"[DEMO] Mantenimiento de aire acondicionado y sistema PCI","a":false},
      {"k":"c05","n":"Taller Carrocerías Meridional","e":"taller@taller-carrocerias-meridional.example.com","p":"+34 000 200 104","t":"[DEMO] Mantenimiento de cabina de pintura y extraccion","a":false},
      {"k":"c06","n":"Naves Industriales Polígono La Vega","e":"mantenimiento@naves-industriales-poligono-la-vega.example.com","p":"+34 000 200 105","t":"[DEMO] Revision de frio industrial y cuadros electricos","a":false},
      {"k":"c07","n":"Cooperativa Agrícola Campo Verde","e":"mantenimiento@cooperativa-agricola-campo-verde.example.com","p":"+34 000 200 106","t":"[DEMO] Mantenimiento de camaras de conservacion de fruta","a":false},
      {"k":"c08","n":"Galería Comercial Plaza del Sur","e":"administracion@galeria-comercial-plaza-del-sur.example.com","p":"+34 000 200 107","t":"[DEMO] Mantenimiento de climatizacion y ascensores de la galeria","a":false},
      {"k":"c09","n":"Restaurante Chiringuito Las Gaviotas","e":"reservas@restaurante-chiringuito-las-gaviotas.example.com","p":"+34 000 200 108","t":"[DEMO] Cierre de temporada, cliente inactivo (archivado de demostracion)","a":true},
      {"k":"c10","n":"Residencial Dunas del Sur","e":"administracion@residencial-dunas-del-sur.example.com","p":"+34 000 200 109","t":"[DEMO] Baja de contrato de comunidad (archivado de demostracion)","a":true}
    ]'::jsonb;
      v_technicians := '[
      {"k":"t01","n":"Pablo Herrero Campos","e":"pablo.herrero@demo-sur.example.com","p":"+34 000 600 100","t":"[DEMO] Especialidad: climatizacion","a":false},
      {"k":"t02","n":"Elena Sanz Cordero","e":"elena.sanz@demo-sur.example.com","p":"+34 000 600 101","t":"[DEMO] Especialidad: electricidad","a":false},
      {"k":"t03","n":"Daniel Cabrera Muñoz","e":"daniel.cabrera@demo-sur.example.com","p":"+34 000 600 102","t":"[DEMO] Especialidad: fontaneria","a":false},
      {"k":"t04","n":"Rosa Ledesma Ortiz","e":"rosa.ledesma@demo-sur.example.com","p":"+34 000 600 103","t":"[DEMO] Especialidad: proteccion contra incendios (PCI). Baja de la plantilla (archivado de demostracion)","a":true}
    ]'::jsonb;
    end if;

    -- Fixtures PENDIENTES (con privilegios de administracion, antes de cambiar de rol): sin
    -- identidad registrada y sin coincidencia con una fila existente que no tenga identidad.
    with fx as (
      select f.value as f, f.ordinality as ord
      from jsonb_array_elements(v_customers) with ordinality as f(value, ordinality)
      where not exists (
        select 1 from private.demo_fixture_identity i
        where i.organization_id = v_org and i.entity_type = 'customer' and i.fixture_key = f.value ->> 'k'
      )
    ), classified as (
      select fx.f, fx.ord,
        exists (
          select 1 from public.customers c
          where c.organization_id = v_org
            and not exists (
              select 1 from private.demo_fixture_identity i2
              where i2.entity_type = 'customer' and i2.record_id = c.id
            )
            and (
              c.name = fx.f ->> 'n'
              or (c.email is not distinct from fx.f ->> 'e'
                  and c.phone is not distinct from fx.f ->> 'p'
                  and c.notes is not distinct from fx.f ->> 't')
            )
        ) as collides
      from fx
    )
    select coalesce(jsonb_agg(f order by ord) filter (where not collides), '[]'::jsonb),
           (count(*) filter (where collides))::int
      into v_c_pending, v_c_skipped
      from classified;

    with fx as (
      select f.value as f, f.ordinality as ord
      from jsonb_array_elements(v_technicians) with ordinality as f(value, ordinality)
      where not exists (
        select 1 from private.demo_fixture_identity i
        where i.organization_id = v_org and i.entity_type = 'technician' and i.fixture_key = f.value ->> 'k'
      )
    ), classified as (
      select fx.f, fx.ord,
        exists (
          select 1 from public.technicians x
          where x.organization_id = v_org
            and not exists (
              select 1 from private.demo_fixture_identity i2
              where i2.entity_type = 'technician' and i2.record_id = x.id
            )
            and (
              x.full_name = fx.f ->> 'n'
              or (x.email is not distinct from fx.f ->> 'e'
                  and x.phone is not distinct from fx.f ->> 'p'
                  and x.notes is not distinct from fx.f ->> 't')
            )
        ) as collides
      from fx
    )
    select coalesce(jsonb_agg(f order by ord) filter (where not collides), '[]'::jsonb),
           (count(*) filter (where collides))::int
      into v_t_pending, v_t_skipped
      from classified;

    -- Actuar como el owner.
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- Clientes: una insercion por fixture, de modo que cada id queda ligado a SU clave aunque
    -- existan filas con el mismo nombre. El archivado solo afecta a los ids insertados AHORA.
    v_c_new := '[]'::jsonb;
    for v_f in select value from jsonb_array_elements(v_c_pending) loop
      insert into public.customers (organization_id, name, email, phone, notes)
      values (v_org, v_f ->> 'n', v_f ->> 'e', v_f ->> 'p', v_f ->> 't')
      returning id into v_id;
      v_c_new := v_c_new || jsonb_build_array(
        jsonb_build_object('k', v_f ->> 'k', 'id', v_id, 'a', coalesce((v_f ->> 'a')::boolean, false)));
    end loop;

    update public.customers
    set archived_at = now() -- el trigger fija la fecha real y registra el evento 'archived'
    where organization_id = v_org
      and archived_at is null
      and id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_c_new) e where (e ->> 'a')::boolean);
    get diagnostics v_c_arch = row_count;

    -- Tecnicos: mismo criterio.
    v_t_new := '[]'::jsonb;
    for v_f in select value from jsonb_array_elements(v_t_pending) loop
      insert into public.technicians (organization_id, full_name, email, phone, notes)
      values (v_org, v_f ->> 'n', v_f ->> 'e', v_f ->> 'p', v_f ->> 't')
      returning id into v_id;
      v_t_new := v_t_new || jsonb_build_array(
        jsonb_build_object('k', v_f ->> 'k', 'id', v_id, 'a', coalesce((v_f ->> 'a')::boolean, false)));
    end loop;

    update public.technicians
    set archived_at = now()
    where organization_id = v_org
      and archived_at is null
      and id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_t_new) e where (e ->> 'a')::boolean);
    get diagnostics v_t_arch = row_count;

    -- Resumen (leido como owner, bajo RLS).
    select count(*) filter (where archived_at is null), count(*) filter (where archived_at is not null)
      into v_c_active, v_c_archived from public.customers where organization_id = v_org;
    select count(*) filter (where archived_at is null), count(*) filter (where archived_at is not null)
      into v_t_active, v_t_archived from public.technicians where organization_id = v_org;
    select count(*) into v_events
      from public.activity_events where organization_id = v_org and action = 'archived';

    reset role;

    -- Identidad de lo insertado ahora (privilegios de administracion, misma transaccion).
    insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
    select v_org, 'customer', e ->> 'k', (e ->> 'id')::uuid from jsonb_array_elements(v_c_new) e;
    insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
    select v_org, 'technician', e ->> 'k', (e ->> 'id')::uuid from jsonb_array_elements(v_t_new) e;

    raise notice 'seed demo [%]: insertados % clientes y % tecnicos; archivados ahora % clientes y % tecnicos',
      v_name, jsonb_array_length(v_c_new), jsonb_array_length(v_t_new), v_c_arch, v_t_arch;
    if v_c_skipped + v_t_skipped > 0 then
      raise notice 'seed demo [%]: OMITIDOS % clientes y % tecnicos por coincidir con filas existentes sin identidad; ejecuta la reconciliacion (docs/SEED.md)',
        v_name, v_c_skipped, v_t_skipped;
    end if;
    raise notice 'seed demo [%]: clientes activos/archivados %/%; tecnicos activos/archivados %/%; eventos archived %',
      v_name, v_c_active, v_c_archived, v_t_active, v_t_archived, v_events;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$seed$;

commit;
