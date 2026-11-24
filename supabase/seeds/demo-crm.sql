-- Seed demo de Nexovantis (TASK-008C): clientes y tecnicos FICTICIOS para "Demo Norte" y "Demo Sur".
-- Uso y garantias: docs/SEED.md. Se ejecuta con privilegios de administracion (SQL editor,
-- conector o `psql -v ON_ERROR_STOP=1 -f supabase/seeds/demo-crm.sql`). NO es una migracion.
--
-- Diseno:
--  * Una sola transaccion: si algo falla (organizacion ausente, 0 o varios owners, etc.) no
--    se aplica nada.
--  * Cada organizacion se resuelve por nombre exacto y su owner por memberships. Despues el
--    script actua COMO ese owner (rol authenticated + claims JWT): se aplican RLS, GRANT por
--    columna y el trigger de archivado, y el actor de los eventos del historial es el owner.
--    No se desactivan triggers, no se usa service_role ni se escribe en activity_events.
--  * Idempotente por clave natural (organizacion + nombre): solo inserta lo que no existe
--    (activo o archivado). El archivado inicial se aplica UNICAMENTE a las filas insertadas
--    en esta misma ejecucion: un registro existente nunca se archiva, restaura, actualiza ni
--    borra, aunque sea designado como archivado y un usuario lo haya restaurado. Una segunda
--    ejecucion no cambia nada ni genera eventos.
--  * Telefonos: prefijo +34 000, que no es asignable a ningun abonado real, para que ningun
--    dato de demostracion pueda llamar o mensajear a una persona o empresa real.
--  * Emails: solo subdominios de example.com (dominio reservado, RFC 2606).
--  * Notas: marcadas con "[DEMO]". Campos del JSON: n=nombre, e=email, p=telefono, t=notas,
--    a=true si debe quedar archivado.

begin;

do $seed$
declare
  v_orgs text[] := array['Demo Norte', 'Demo Sur'];
  v_name text;
  v_org uuid;
  v_owner uuid;
  v_n int;
  v_customers jsonb;
  v_technicians jsonb;
  v_c_new int;
  v_c_ids uuid[];
  v_t_ids uuid[];
  v_c_arch int;
  v_t_new int;
  v_t_arch int;
  v_c_active int;
  v_c_archived int;
  v_t_active int;
  v_t_archived int;
  v_events int;
begin
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
      {"n":"Comunidad de Propietarios Los Almendros","e":"administracion@comunidad-de-propietarios-los-almendros.example.com","p":"+34 000 100 100","t":"[DEMO] Mantenimiento preventivo de ascensores y puertas de garaje","a":false},
      {"n":"Comunidad de Propietarios Residencial Mirador","e":"administracion@comunidad-de-propietarios-residencial-mirador.example.com","p":"+34 000 100 101","t":"[DEMO] Contrato anual de revision de grupo de presion y fontaneria comun","a":false},
      {"n":"Comunidad de Propietarios Parque Azul","e":"administracion@comunidad-de-propietarios-parque-azul.example.com","p":"+34 000 100 102","t":"[DEMO] Revision semestral de instalacion electrica de zonas comunes","a":false},
      {"n":"Hotel Brisamar","e":"mantenimiento@hotel-brisamar.example.com","p":"+34 000 100 103","t":"[DEMO] Contrato de mantenimiento preventivo trimestral de climatizacion","a":false},
      {"n":"Hotel Costa Serena","e":"mantenimiento@hotel-costa-serena.example.com","p":"+34 000 100 104","t":"[DEMO] Mantenimiento de calderas y produccion de agua caliente sanitaria","a":false},
      {"n":"Apartamentos Playa Dorada","e":"recepcion@apartamentos-playa-dorada.example.com","p":"+34 000 100 105","t":"[DEMO] Averias puntuales de aire acondicionado en temporada alta","a":false},
      {"n":"Clínica Dental Sonrisa Norte","e":"gerencia@clinica-dental-sonrisa-norte.example.com","p":"+34 000 100 106","t":"[DEMO] Revision anual de instalacion de aire comprimido y aspiracion","a":false},
      {"n":"Centro Médico Valleverde","e":"mantenimiento@centro-medico-valleverde.example.com","p":"+34 000 100 107","t":"[DEMO] Mantenimiento de climatizacion de quirofanos y salas limpias","a":false},
      {"n":"Clínica Veterinaria Cuatro Patas","e":"gerencia@clinica-veterinaria-cuatro-patas.example.com","p":"+34 000 100 108","t":"[DEMO] Revision de sistema contra incendios y alumbrado de emergencia","a":false},
      {"n":"Taller Mecánico El Pistón","e":"taller@taller-mecanico-el-piston.example.com","p":"+34 000 100 109","t":"[DEMO] Mantenimiento de compresores y red de aire del taller","a":false},
      {"n":"Talleres Ribera Motor","e":"taller@talleres-ribera-motor.example.com","p":"+34 000 100 110","t":"[DEMO] Revision electrica y de cuadros de elevadores hidraulicos","a":false},
      {"n":"Colegio Alameda Viva","e":"secretaria@colegio-alameda-viva.example.com","p":"+34 000 100 111","t":"[DEMO] Mantenimiento de calefaccion y revision de extintores antes del curso","a":false},
      {"n":"Escuela Infantil Pequeños Pasos","e":"direccion@escuela-infantil-pequenos-pasos.example.com","p":"+34 000 100 112","t":"[DEMO] Revision de fontaneria y agua caliente en aseos infantiles","a":false},
      {"n":"Instituto Técnico Horizonte","e":"secretaria@instituto-tecnico-horizonte.example.com","p":"+34 000 100 113","t":"[DEMO] Mantenimiento de instalaciones electricas de aulas-taller","a":false},
      {"n":"Nave Industrial Polígono Las Eras","e":"mantenimiento@nave-industrial-poligono-las-eras.example.com","p":"+34 000 100 114","t":"[DEMO] Revision de puentes grua y cuadros electricos de la nave","a":false},
      {"n":"Logística Rápida del Norte","e":"mantenimiento@logistica-rapida-del-norte.example.com","p":"+34 000 100 115","t":"[DEMO] Mantenimiento de muelles de carga y puertas seccionales","a":false},
      {"n":"Almacenes Frigoríficos Ártico","e":"mantenimiento@almacenes-frigorificos-artico.example.com","p":"+34 000 100 116","t":"[DEMO] Mantenimiento de camaras frigorificas y control de temperatura","a":false},
      {"n":"Panadería Obrador Trigal","e":"obrador@panaderia-obrador-trigal.example.com","p":"+34 000 100 117","t":"[DEMO] Revision de hornos y camaras de fermentacion","a":false},
      {"n":"Supermercado Mercadillo Fresco","e":"tienda@supermercado-mercadillo-fresco.example.com","p":"+34 000 100 118","t":"[DEMO] Mantenimiento de muebles frigorificos y centrales de frio","a":false},
      {"n":"Restaurante La Brasa Vieja","e":"reservas@restaurante-la-brasa-vieja.example.com","p":"+34 000 100 119","t":"[DEMO] Limpieza y revision de extraccion de humos y campana","a":false},
      {"n":"Gimnasio Fuerza y Salud","e":"gerencia@gimnasio-fuerza-y-salud.example.com","p":"+34 000 100 120","t":"[DEMO] Mantenimiento de climatizacion y deshumectadoras de vestuarios","a":false},
      {"n":"Residencia de Mayores Atardecer","e":"direccion@residencia-de-mayores-atardecer.example.com","p":"+34 000 100 121","t":"[DEMO] Mantenimiento de ascensores, sistema PCI y llamada de enfermeria","a":false},
      {"n":"Oficinas Centro Empresarial Cantábrico","e":"administracion@oficinas-centro-empresarial-cantabrico.example.com","p":"+34 000 100 122","t":"[DEMO] Contrato integral de climatizacion y electricidad de oficinas","a":false},
      {"n":"Polideportivo Municipal Los Pinos","e":"mantenimiento@polideportivo-municipal-los-pinos.example.com","p":"+34 000 100 123","t":"[DEMO] Mantenimiento de depuradora, calefaccion y alumbrado de pistas","a":false},
      {"n":"Hotel Rincón del Valle","e":"mantenimiento@hotel-rincon-del-valle.example.com","p":"+34 000 100 124","t":"[DEMO] Contrato rescindido por cierre del establecimiento (archivado de demostracion)","a":true},
      {"n":"Metálicas Granito","e":"taller@metalicas-granito.example.com","p":"+34 000 100 125","t":"[DEMO] Taller cerrado, sin servicios pendientes (archivado de demostracion)","a":true},
      {"n":"Comunidad de Propietarios Edificio Aurora","e":"administracion@comunidad-de-propietarios-edificio-aurora.example.com","p":"+34 000 100 126","t":"[DEMO] Baja de contrato por cambio de administrador (archivado de demostracion)","a":true}
    ]'::jsonb;
      v_technicians := '[
      {"n":"Marta Soler Vidal","e":"marta.soler@demo-norte.example.com","p":"+34 000 500 100","t":"[DEMO] Especialidad: climatizacion","a":false},
      {"n":"Javier Ortega Lara","e":"javier.ortega@demo-norte.example.com","p":"+34 000 500 101","t":"[DEMO] Especialidad: electricidad","a":false},
      {"n":"Lucía Fernández Rey","e":"lucia.fernandez@demo-norte.example.com","p":"+34 000 500 102","t":"[DEMO] Especialidad: fontaneria","a":false},
      {"n":"Andrés Molina Cuesta","e":"andres.molina@demo-norte.example.com","p":"+34 000 500 103","t":"[DEMO] Especialidad: ascensores","a":false},
      {"n":"Raquel Iglesias Pardo","e":"raquel.iglesias@demo-norte.example.com","p":"+34 000 500 104","t":"[DEMO] Especialidad: proteccion contra incendios (PCI)","a":false},
      {"n":"Sergio Navarro Beltrán","e":"sergio.navarro@demo-norte.example.com","p":"+34 000 500 105","t":"[DEMO] Especialidad: frio industrial","a":false},
      {"n":"Ignacio Paredes Gil","e":"ignacio.paredes@demo-norte.example.com","p":"+34 000 500 106","t":"[DEMO] Especialidad: electricidad. Baja de la plantilla (archivado de demostracion)","a":true},
      {"n":"Carmen Bosch Vera","e":"carmen.bosch@demo-norte.example.com","p":"+34 000 500 107","t":"[DEMO] Especialidad: climatizacion. Baja de la plantilla (archivado de demostracion)","a":true}
    ]'::jsonb;
    else
      v_customers := '[
      {"n":"Comunidad de Propietarios Jardines del Sur","e":"administracion@comunidad-de-propietarios-jardines-del-sur.example.com","p":"+34 000 200 100","t":"[DEMO] Mantenimiento de ascensores y fontaneria de bloques","a":false},
      {"n":"Hotel Sol de Poniente","e":"mantenimiento@hotel-sol-de-poniente.example.com","p":"+34 000 200 101","t":"[DEMO] Contrato de climatizacion y mantenimiento de piscina climatizada","a":false},
      {"n":"Clínica Fisioterapia Movimiento","e":"gerencia@clinica-fisioterapia-movimiento.example.com","p":"+34 000 200 102","t":"[DEMO] Revision anual de climatizacion y electricidad","a":false},
      {"n":"Colegio Olivar Claro","e":"secretaria@colegio-olivar-claro.example.com","p":"+34 000 200 103","t":"[DEMO] Mantenimiento de aire acondicionado y sistema PCI","a":false},
      {"n":"Taller Carrocerías Meridional","e":"taller@taller-carrocerias-meridional.example.com","p":"+34 000 200 104","t":"[DEMO] Mantenimiento de cabina de pintura y extraccion","a":false},
      {"n":"Naves Industriales Polígono La Vega","e":"mantenimiento@naves-industriales-poligono-la-vega.example.com","p":"+34 000 200 105","t":"[DEMO] Revision de frio industrial y cuadros electricos","a":false},
      {"n":"Cooperativa Agrícola Campo Verde","e":"mantenimiento@cooperativa-agricola-campo-verde.example.com","p":"+34 000 200 106","t":"[DEMO] Mantenimiento de camaras de conservacion de fruta","a":false},
      {"n":"Galería Comercial Plaza del Sur","e":"administracion@galeria-comercial-plaza-del-sur.example.com","p":"+34 000 200 107","t":"[DEMO] Mantenimiento de climatizacion y ascensores de la galeria","a":false},
      {"n":"Restaurante Chiringuito Las Gaviotas","e":"reservas@restaurante-chiringuito-las-gaviotas.example.com","p":"+34 000 200 108","t":"[DEMO] Cierre de temporada, cliente inactivo (archivado de demostracion)","a":true},
      {"n":"Residencial Dunas del Sur","e":"administracion@residencial-dunas-del-sur.example.com","p":"+34 000 200 109","t":"[DEMO] Baja de contrato de comunidad (archivado de demostracion)","a":true}
    ]'::jsonb;
      v_technicians := '[
      {"n":"Pablo Herrero Campos","e":"pablo.herrero@demo-sur.example.com","p":"+34 000 600 100","t":"[DEMO] Especialidad: climatizacion","a":false},
      {"n":"Elena Sanz Cordero","e":"elena.sanz@demo-sur.example.com","p":"+34 000 600 101","t":"[DEMO] Especialidad: electricidad","a":false},
      {"n":"Daniel Cabrera Muñoz","e":"daniel.cabrera@demo-sur.example.com","p":"+34 000 600 102","t":"[DEMO] Especialidad: fontaneria","a":false},
      {"n":"Rosa Ledesma Ortiz","e":"rosa.ledesma@demo-sur.example.com","p":"+34 000 600 103","t":"[DEMO] Especialidad: proteccion contra incendios (PCI). Baja de la plantilla (archivado de demostracion)","a":true}
    ]'::jsonb;
    end if;

    -- Actuar como el owner.
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    set local role authenticated;

    -- Clientes: se recogen los ids insertados AHORA; el archivado solo afecta a esos ids.
    with ins as (
      insert into public.customers (organization_id, name, email, phone, notes)
      select v_org, d.n, d.e, d.p, d.t
      from jsonb_to_recordset(v_customers) as d(n text, e text, p text, t text, a boolean)
      where not exists (
        select 1 from public.customers c where c.organization_id = v_org and c.name = d.n
      )
      returning id, name
    )
    select count(*)::int,
           coalesce(array_agg(ins.id) filter (where d.a), '{}'::uuid[])
      into v_c_new, v_c_ids
      from ins
      join jsonb_to_recordset(v_customers) as d(n text, e text, p text, t text, a boolean)
        on d.n = ins.name;

    update public.customers
    set archived_at = now() -- el trigger fija la fecha real y registra el evento 'archived'
    where organization_id = v_org and id = any(v_c_ids) and archived_at is null;
    get diagnostics v_c_arch = row_count;

    -- Tecnicos: mismo criterio.
    with ins as (
      insert into public.technicians (organization_id, full_name, email, phone, notes)
      select v_org, d.n, d.e, d.p, d.t
      from jsonb_to_recordset(v_technicians) as d(n text, e text, p text, t text, a boolean)
      where not exists (
        select 1 from public.technicians x where x.organization_id = v_org and x.full_name = d.n
      )
      returning id, full_name
    )
    select count(*)::int,
           coalesce(array_agg(ins.id) filter (where d.a), '{}'::uuid[])
      into v_t_new, v_t_ids
      from ins
      join jsonb_to_recordset(v_technicians) as d(n text, e text, p text, t text, a boolean)
        on d.n = ins.full_name;

    update public.technicians
    set archived_at = now()
    where organization_id = v_org and id = any(v_t_ids) and archived_at is null;
    get diagnostics v_t_arch = row_count;

    -- Resumen (leido como owner, bajo RLS).
    select count(*) filter (where archived_at is null), count(*) filter (where archived_at is not null)
      into v_c_active, v_c_archived from public.customers where organization_id = v_org;
    select count(*) filter (where archived_at is null), count(*) filter (where archived_at is not null)
      into v_t_active, v_t_archived from public.technicians where organization_id = v_org;
    select count(*) into v_events
      from public.activity_events where organization_id = v_org and action = 'archived';

    reset role;
    raise notice 'seed demo [%]: insertados % clientes y % tecnicos; archivados ahora % clientes y % tecnicos',
      v_name, v_c_new, v_t_new, v_c_arch, v_t_arch;
    raise notice 'seed demo [%]: clientes activos/archivados %/%; tecnicos activos/archivados %/%; eventos archived %',
      v_name, v_c_active, v_c_archived, v_t_active, v_t_archived, v_events;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$seed$;

commit;
