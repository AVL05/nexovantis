-- Seed demo de inventario (TASK-013 / F6): articulos y movimientos FICTICIOS para "Demo Norte" y "Demo Sur".
-- Uso y garantias: docs/SEED.md. Se ejecuta con privilegios de administracion (SQL editor, conector o
-- `psql -v ON_ERROR_STOP=1 -f supabase/seeds/demo-inventory.sql`). NO es una migracion y NO se ejecuta
-- en Cloud sin decision humana expresa. Requiere la migracion 20261128090000. Para que existan consumos
-- vinculados a ordenes conviene haber ejecutado antes demo-orders.sql (y/o demo-quotes.sql): si una
-- organizacion no tiene ordenes abiertas, los consumos de sus fixtures se OMITEN con un aviso.
--
-- Diseno (mismo criterio que demo-orders.sql y demo-quotes.sql):
--  * Una sola transaccion: si algo falla no se aplica nada. Bloqueo de TRANSACCION
--    (pg_advisory_xact_lock) antes de leer o escribir: dos ejecuciones simultaneas se serializan.
--  * Cada organizacion se resuelve por nombre exacto y su owner por memberships (exactamente 1).
--    Despues el script actua COMO ese owner (rol authenticated + claims JWT) y usa las MISMAS RPC que la
--    aplicacion (create_inventory_item, record_stock_movement, archive_inventory_item): se aplican RLS,
--    los triggers (saldo nunca negativo, solo lectura de archivados) y los eventos de actividad con el
--    owner como actor (nunca nulo). No se desactivan triggers, no se usa el rol de servicio y no se
--    escribe directamente en inventory_items, stock_movements ni activity_events.
--  * IDENTIDAD ESTABLE: cada articulo demo lleva una clave constante ("k", no cambiar nunca una clave
--    publicada) registrada en private.demo_fixture_identity (entity_type 'inventory_item'). Un articulo
--    con identidad NO se vuelve a crear ni se le vuelven a aplicar movimientos, aunque el usuario lo
--    haya movido, editado o archivado: una segunda ejecucion inserta 0 articulos, 0 movimientos y 0
--    eventos. Las claves de idempotencia de los movimientos son deterministas (md5 de organizacion,
--    articulo y movimiento), asi que ni siquiera un reintento parcial podria duplicar un movimiento.
--  * No destructivo: sin DELETE, TRUNCATE ni DROP; nunca modifica articulos existentes.
--  * Campos del JSON: k=clave estable, r=referencia, n=nombre, d=descripcion ([DEMO]), u=unidad,
--    t=umbral de stock bajo, m=movimientos en orden (t=in|out|consumption, q=cantidad entera,
--    n=nota, o=indice de la orden abierta a consumir), a=true si queda archivado al final.

begin;

do $seed$
declare
  v_orgs text[] := array['Demo Norte', 'Demo Sur'];
  v_name text;
  v_org uuid;
  v_owner uuid;
  v_n int;
  v_f jsonb;
  v_m jsonb;
  v_mi int;
  v_id uuid;
  v_order uuid;
  v_fixtures jsonb;
  v_plan jsonb;
  v_new jsonb;
  v_created int;
  v_skipped int;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexovantis.seed.demo-inventory', 0));

  foreach v_name in array v_orgs loop
    select count(*) into v_n from public.organizations where name = v_name;
    if v_n <> 1 then
      raise exception 'seed demo inventario: la organizacion "%" debe existir exactamente una vez (hay %)', v_name, v_n;
    end if;
    select id into v_org from public.organizations where name = v_name;

    select count(*) into v_n from public.memberships where organization_id = v_org and role = 'owner';
    if v_n <> 1 then
      raise exception 'seed demo inventario: la organizacion "%" debe tener exactamente 1 owner (hay %)', v_name, v_n;
    end if;
    select user_id into v_owner from public.memberships where organization_id = v_org and role = 'owner';

    if v_name = 'Demo Norte' then
      v_fixtures := '[
      {"k":"i01","r":"N-TUB-015","n":"Tubo de cobre 15 mm","d":"[DEMO] Tubo de cobre rígido para fontanería, barra de 5 m.","u":"m","t":20,"m":[
        {"t":"in","q":120,"n":"Existencia inicial (albarán ficticio 0001)"},
        {"t":"out","q":30,"n":"Merma por corte"},
        {"t":"consumption","q":40,"o":0}]},
      {"k":"i02","r":"N-TUB-022","n":"Tubo de cobre 22 mm","d":"[DEMO] Tubo de cobre rígido de mayor sección.","u":"m","t":20,"m":[
        {"t":"in","q":60,"n":"Existencia inicial"},
        {"t":"consumption","q":45,"o":1}]},
      {"k":"i03","r":"N-VAL-BOL","n":"Válvula de bola 1/2 pulgada","d":"[DEMO] Válvula de bola de latón con maneta.","u":"ud","t":10,"m":[
        {"t":"in","q":40,"n":"Existencia inicial"},
        {"t":"out","q":40,"n":"Retirada de lote completo"}]},
      {"k":"i04","r":"N-JUN-EPD","n":"Junta EPDM","d":"[DEMO] Juntas de goma para uniones roscadas.","u":"ud","t":25,"m":[
        {"t":"in","q":200,"n":"Existencia inicial"},
        {"t":"consumption","q":150,"o":0}]},
      {"k":"i05","r":"N-CAB-215","n":"Cable flexible 2x1,5 mm²","d":"[DEMO] Manguera eléctrica para instalaciones interiores.","u":"m","t":100,"m":[
        {"t":"in","q":500,"n":"Existencia inicial"},
        {"t":"consumption","q":410,"o":2}]},
      {"k":"i06","r":"N-FIL-H13","n":"Filtro HEPA H13","d":"[DEMO] Filtro de alta eficiencia para equipos de climatización.","u":"ud","t":4,"m":[
        {"t":"in","q":12,"n":"Existencia inicial"}]},
      {"k":"i07","r":"N-ACE-SIL","n":"Aceite de silicona","d":"[DEMO] Lubricante para juntas y válvulas.","u":"l","t":5,"m":[
        {"t":"in","q":8,"n":"Existencia inicial"},
        {"t":"out","q":4,"n":"Trasvase a taller"}]},
      {"k":"i08","r":"N-GUA-NIT","n":"Guantes de nitrilo (caja de 100)","d":"[DEMO] Material de protección de uso diario.","u":"caja","t":3,"m":[
        {"t":"in","q":20,"n":"Existencia inicial"}]},
      {"k":"i09","r":"N-TOR-M6","n":"Tornillo M6 galvanizado","d":"[DEMO] Sin umbral de stock bajo configurado.","u":"ud","t":0,"m":[
        {"t":"in","q":1000,"n":"Existencia inicial"}]},
      {"k":"i10","r":"N-BOM-OLD","n":"Bomba circuladora descatalogada","d":"[DEMO] Artículo archivado con saldo: conserva su historial.","u":"ud","t":0,"a":true,"m":[
        {"t":"in","q":3,"n":"Existencia inicial"}]},
      {"k":"i11","r":"N-ABR-INX","n":"Abrazadera inoxidable","d":"[DEMO] Artículo sin existencias todavía.","u":"ud","t":15,"m":[]}
    ]'::jsonb;
    else
      v_fixtures := '[
      {"k":"i01","r":"S-FAN-FC1","n":"Filtro de fancoil","d":"[DEMO] Filtro de repuesto para fancoils de pared.","u":"ud","t":6,"m":[
        {"t":"in","q":24,"n":"Existencia inicial"},
        {"t":"consumption","q":6,"o":0}]},
      {"k":"i02","r":"S-GAS-R32","n":"Gas refrigerante R32","d":"[DEMO] Botella de recarga, se contabiliza en kilos.","u":"kg","t":5,"m":[
        {"t":"in","q":12,"n":"Existencia inicial"},
        {"t":"out","q":8,"n":"Recarga en cliente"}]},
      {"k":"i03","r":"S-EXT-POL","n":"Recarga de extintor de polvo","d":"[DEMO] Recargas de 6 kg.","u":"ud","t":3,"m":[
        {"t":"in","q":6,"n":"Existencia inicial"},
        {"t":"out","q":6,"n":"Revisión anual de la nave"}]},
      {"k":"i04","r":"S-CAN-PVC","n":"Canaleta de PVC 40x16","d":"[DEMO] Canaleta para cableado visto, barra de 2 m.","u":"m","t":30,"m":[
        {"t":"in","q":90,"n":"Existencia inicial"}]},
      {"k":"i05","r":"S-OLD-VEN","n":"Ventilador antiguo","d":"[DEMO] Artículo archivado con saldo.","u":"ud","t":0,"a":true,"m":[
        {"t":"in","q":2,"n":"Existencia inicial"}]}
    ]'::jsonb;
    end if;

    -- Plan (privilegios de administracion, antes de cambiar de rol): fixtures sin identidad.
    select coalesce(jsonb_agg(f.value order by f.ordinality), '[]'::jsonb)
      into v_plan
      from jsonb_array_elements(v_fixtures) with ordinality as f(value, ordinality)
      where not exists (
        select 1 from private.demo_fixture_identity i
        where i.organization_id = v_org and i.entity_type = 'inventory_item' and i.fixture_key = f.value ->> 'k'
      );

    -- Actuar como el owner: mismas RPC, RLS y triggers que la aplicacion.
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    set local role authenticated;

    v_new := '[]'::jsonb;
    v_skipped := 0;
    for v_f in select value from jsonb_array_elements(v_plan) loop
      v_id := public.create_inventory_item(
        gen_random_uuid(), v_f ->> 'r', v_f ->> 'n', v_f ->> 'd', v_f ->> 'u', (v_f ->> 't')::int
      );
      v_mi := 0;
      for v_m in select value from jsonb_array_elements(v_f -> 'm') loop
        v_mi := v_mi + 1;
        if v_m ->> 't' = 'consumption' then
          -- Orden abierta de la organizacion (visible bajo RLS para el owner). Sin ella se omite.
          select w.id into v_order
            from public.work_orders w
           where w.status in ('pending', 'assigned', 'in_progress')
           order by w.scheduled_date, w.created_at, w.id
           offset coalesce((v_m ->> 'o')::int, 0) limit 1;
          if v_order is null then
            v_skipped := v_skipped + 1;
            continue;
          end if;
        else
          v_order := null;
        end if;
        perform public.record_stock_movement(
          md5(v_org::text || ':inventory:' || (v_f ->> 'k') || ':' || v_mi::text)::uuid,
          v_id, v_m ->> 't', (v_m ->> 'q')::int, v_order, v_m ->> 'n'
        );
      end loop;
      if coalesce((v_f ->> 'a')::boolean, false) then
        perform public.archive_inventory_item(v_id);
      end if;
      v_new := v_new || jsonb_build_array(jsonb_build_object('k', v_f ->> 'k', 'id', v_id));
    end loop;
    v_created := jsonb_array_length(v_new);

    reset role;

    -- Identidad de lo creado ahora (privilegios de administracion, misma transaccion).
    insert into private.demo_fixture_identity (organization_id, entity_type, fixture_key, record_id)
    select v_org, 'inventory_item', e ->> 'k', (e ->> 'id')::uuid from jsonb_array_elements(v_new) e;

    raise notice 'seed demo inventario [%]: creados % articulos', v_name, v_created;
    if v_skipped > 0 then
      raise notice 'seed demo inventario [%]: OMITIDOS % consumos porque no hay ordenes abiertas suficientes (ejecuta antes demo-orders.sql)',
        v_name, v_skipped;
    end if;
  end loop;

  perform set_config('request.jwt.claims', '', true);
end;
$seed$;

commit;
