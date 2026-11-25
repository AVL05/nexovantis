-- Reconciliacion (TASK-010, A02-03) de las filas demo instaladas por la version ANTERIOR del seed,
-- que no tienen identidad estable registrada. PREPARADA PARA CLOUD, NO EJECUTADA. Uso y riesgos:
-- docs/SEED.md y docs/SUPABASE_CLOUD.md. No es una migracion.
--
-- Se ejecuta con privilegios de administracion (psql -f / SQL editor), DESPUES de la migracion
-- 20261125090300 y ANTES de volver a lanzar demo-crm.sql en un entorno que ya tenia el seed viejo.
--   * Modo COMPROBACION (por defecto): no persiste nada en ninguna tabla; solo informa.
--   * Modo APLICAR: SOLO si la variable de sesion nexovantis.reconcile_apply vale 'on':
--       psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--         -c "set nexovantis.reconcile_apply = 'on'" -f supabase/seeds/reconcile-demo-crm.sql
--     (En el SQL editor: ejecutar antes `set nexovantis.reconcile_apply = 'on';` en la misma sesion.)
--     Escribe unicamente filas en private.demo_fixture_identity; nunca toca customers, technicians
--     ni activity_events.
--
-- Criterio de asignacion (nunca por el nombre ACTUAL, que es editable): para cada fixture se buscan
-- en la MISMA organizacion y del mismo tipo las filas sin identidad cuya firma de contacto original
-- (email + telefono + notas, copiada abajo de la version anterior del seed) coincida exactamente.
--   0 candidatas -> not_found   (no se asigna; el seed puede insertarlo como nuevo)
--   1 candidata  -> would_map / mapped
--   >1 (o una fila que seria candidata de varios fixtures) -> ambiguous (se informa, no se asigna)
--   fixture ya con identidad -> already_mapped
-- Una fila a la que el usuario cambio email, telefono o notas deja de ser identificable: queda
-- not_found y requiere decision humana (docs/SEED.md).
--
-- Es UNA unica sentencia (atomica): un fallo no aplica nada. Su resultado es el informe, una fila por
-- fixture y organizacion: organization, entity_type, fixture (nombre ORIGINAL), status, record_id.
-- Las firmas son las de la version anterior del seed y NO deben cambiarse (son la evidencia).

with params as (
  select coalesce(current_setting('nexovantis.reconcile_apply', true), '') = 'on' as apply
), fixtures as (
  select 'Demo Norte'::text as org_name, 'customer'::text as entity_type, d.k, d.n, d.e, d.p, d.t
    from jsonb_to_recordset('[
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
    ]'::jsonb) as d(k text, n text, e text, p text, t text, a boolean)
  union all
  select 'Demo Norte', 'technician', d.k, d.n, d.e, d.p, d.t
    from jsonb_to_recordset('[
      {"k":"t01","n":"Marta Soler Vidal","e":"marta.soler@demo-norte.example.com","p":"+34 000 500 100","t":"[DEMO] Especialidad: climatizacion","a":false},
      {"k":"t02","n":"Javier Ortega Lara","e":"javier.ortega@demo-norte.example.com","p":"+34 000 500 101","t":"[DEMO] Especialidad: electricidad","a":false},
      {"k":"t03","n":"Lucía Fernández Rey","e":"lucia.fernandez@demo-norte.example.com","p":"+34 000 500 102","t":"[DEMO] Especialidad: fontaneria","a":false},
      {"k":"t04","n":"Andrés Molina Cuesta","e":"andres.molina@demo-norte.example.com","p":"+34 000 500 103","t":"[DEMO] Especialidad: ascensores","a":false},
      {"k":"t05","n":"Raquel Iglesias Pardo","e":"raquel.iglesias@demo-norte.example.com","p":"+34 000 500 104","t":"[DEMO] Especialidad: proteccion contra incendios (PCI)","a":false},
      {"k":"t06","n":"Sergio Navarro Beltrán","e":"sergio.navarro@demo-norte.example.com","p":"+34 000 500 105","t":"[DEMO] Especialidad: frio industrial","a":false},
      {"k":"t07","n":"Ignacio Paredes Gil","e":"ignacio.paredes@demo-norte.example.com","p":"+34 000 500 106","t":"[DEMO] Especialidad: electricidad. Baja de la plantilla (archivado de demostracion)","a":true},
      {"k":"t08","n":"Carmen Bosch Vera","e":"carmen.bosch@demo-norte.example.com","p":"+34 000 500 107","t":"[DEMO] Especialidad: climatizacion. Baja de la plantilla (archivado de demostracion)","a":true}
    ]'::jsonb) as d(k text, n text, e text, p text, t text, a boolean)
  union all
  select 'Demo Sur', 'customer', d.k, d.n, d.e, d.p, d.t
    from jsonb_to_recordset('[
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
    ]'::jsonb) as d(k text, n text, e text, p text, t text, a boolean)
  union all
  select 'Demo Sur', 'technician', d.k, d.n, d.e, d.p, d.t
    from jsonb_to_recordset('[
      {"k":"t01","n":"Pablo Herrero Campos","e":"pablo.herrero@demo-sur.example.com","p":"+34 000 600 100","t":"[DEMO] Especialidad: climatizacion","a":false},
      {"k":"t02","n":"Elena Sanz Cordero","e":"elena.sanz@demo-sur.example.com","p":"+34 000 600 101","t":"[DEMO] Especialidad: electricidad","a":false},
      {"k":"t03","n":"Daniel Cabrera Muñoz","e":"daniel.cabrera@demo-sur.example.com","p":"+34 000 600 102","t":"[DEMO] Especialidad: fontaneria","a":false},
      {"k":"t04","n":"Rosa Ledesma Ortiz","e":"rosa.ledesma@demo-sur.example.com","p":"+34 000 600 103","t":"[DEMO] Especialidad: proteccion contra incendios (PCI). Baja de la plantilla (archivado de demostracion)","a":true}
    ]'::jsonb) as d(k text, n text, e text, p text, t text, a boolean)
), orgs as (
  -- Solo organizaciones cuyo nombre es unico: con 0 o varias no se asigna nada.
  select min(o.id::text)::uuid as id, o.name
    from public.organizations o
   where o.name in ('Demo Norte', 'Demo Sur')
   group by o.name
  having count(*) = 1
), resolved as (
  select fx.*, org.id as org_id, i.record_id as mapped_id
    from fixtures fx
    left join orgs org on org.name = fx.org_name
    left join private.demo_fixture_identity i
      on i.organization_id = org.id and i.entity_type = fx.entity_type and i.fixture_key = fx.k
), candidates as (
  select r.org_name, r.entity_type, r.k, c.id as cand_id
    from resolved r
    join public.customers c
      on r.entity_type = 'customer'
     and c.organization_id = r.org_id
     and c.email is not distinct from r.e
     and c.phone is not distinct from r.p
     and c.notes is not distinct from r.t
   where r.mapped_id is null
     and not exists (
       select 1 from private.demo_fixture_identity i2
       where i2.entity_type = 'customer' and i2.record_id = c.id
     )
  union all
  select r.org_name, r.entity_type, r.k, x.id
    from resolved r
    join public.technicians x
      on r.entity_type = 'technician'
     and x.organization_id = r.org_id
     and x.email is not distinct from r.e
     and x.phone is not distinct from r.p
     and x.notes is not distinct from r.t
   where r.mapped_id is null
     and not exists (
       select 1 from private.demo_fixture_identity i2
       where i2.entity_type = 'technician' and i2.record_id = x.id
     )
), counted as (
  select cd.*, count(*) over (partition by cd.org_name, cd.entity_type, cd.k) as per_fixture,
         count(*) over (partition by cd.entity_type, cd.cand_id) as per_record
    from candidates cd
), decided as (
  select r.org_name, r.entity_type, r.n, r.org_id, r.k,
         case
           when r.mapped_id is not null then 'already_mapped'
           when r.org_id is null or cn.cand_id is null then 'not_found'
           when cn.per_fixture > 1 or cn.per_record > 1 then 'ambiguous'
           when (select apply from params) then 'mapped'
           else 'would_map'
         end as status,
         case
           when r.mapped_id is not null then r.mapped_id
           when cn.per_fixture = 1 and cn.per_record = 1 then cn.cand_id
         end as record_id
    from resolved r
    left join (
      select distinct on (org_name, entity_type, k) *
        from counted
       order by org_name, entity_type, k, cand_id
    ) cn on cn.org_name = r.org_name and cn.entity_type = r.entity_type and cn.k = r.k
), applied as (
  insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
  select d.org_id, d.entity_type, d.k, d.record_id
    from decided d
   where d.status = 'mapped'
  returning 1
)
select d.org_name as organization, d.entity_type, d.n as fixture, d.status, d.record_id
  from decided d
 order by d.org_name, d.entity_type, d.n;
