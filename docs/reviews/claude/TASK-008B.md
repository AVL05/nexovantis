# TASK-008B — CRM y gestión de técnicos (registro de Orchestrator)

- Fecha: 2026-11-24. Rama `feat/supabase-auth`, base `50dd257`. Trabajo **sin commit ni push** (instrucción humana).
- Clasificación: crítica para el trigger de archivado, la restauración y sus garantías de autorización y trazabilidad (PRE focalizado); estándar para el CRUD y las correcciones visuales.
- Modelos/esfuerzo efectivos de los subagentes: no verificables.
- Dirección visual: Premium Frontend Director, perfil Core, ambición Refined, identidad "Plano técnico" (docs/design.md).

## Fases reales
| Fase | Agente | Resultado | Evidencia |
|---|---|---|---|
| PRE | testing | Criterios C-01..C-34 y pruebas independientes (61 fallaban antes de implementar, como se esperaba) | [TASK-008B-PRE](TASK-008B-PRE.md) |
| DEV1 | develop | Migración `20261124100000_task008b_restore_and_activity.sql`, servicios, Server Actions y pantallas de Clientes y Técnicos | Resumen en este registro |
| DEV2 | develop | Oscurecimiento, cabecera móvil, ancho de escritorio, login con control de contraseña | Resumen en este registro |
| DEV3 | develop | Dashboard con tarjetas alineadas y detalle a dos columnas en ≥1280 px; el error de SSR resultó ser caché obsoleta | Resumen en este registro |
| POST | testing | **BLOCKED** solo por CI pendiente; sin hallazgos Critical/High/Medium | Resumido en el RETEST (no escribió un archivo POST) |
| DEV4 | develop | Desbordamiento del dashboard a 768 px corregido; corte tarjetas/tabla movido a `lg` | Resumen en este registro |
| RETEST | testing | **BLOCKED** solo por CI pendiente; sin hallazgos nuevos | [TASK-008B-RETEST](TASK-008B-RETEST.md) |

Decisiones de Orchestrator sobre los hallazgos del PRE:
- F-01 se adopta: la función de trigger es SECURITY DEFINER y nadie tiene EXECUTE.
- F-03 se adopta: se conserva el nombre `private.prevent_unarchive`.
- F-06 se adopta: `organization_id` sin cascade.
- F-02: Develop actualizó sus propias pruebas que DH-06 invalidaba; Testing lo revisó en el POST y no encontró nada debilitado.

## Oscurecimiento del dashboard (investigado antes de modificar código)
Reproducido en navegador con sesión real a 393 px. Pasos: abrir «Menú» y pulsar «Panel», que es la ruta actual.
- **Causa:** el estado `open` de `ShellFrame` no se reiniciaba al navegar ni al cambiar de breakpoint. La capa `fixed inset-0 bg-nav/50` quedaba encima de todo `main` (`aria-expanded="true"`; `elementFromPoint` devolvía la capa).
- **Corrección:** cierre al cambiar de ruta, al pulsar un enlace, al pasar a ≥768 px, con Escape, al pulsar la capa y con el botón «Cerrar panel».
- **Accesibilidad y foco:** `inert` y bloqueo del scroll solo en móvil; el foco vuelve al botón «Menú».
- **Regresión:** prueba unitaria en `tests/unit/shell-frame.test.tsx`, que fallaba con el código anterior.
- **Verificación:** comprobado de nuevo en navegador, sin capa, sin bloqueo y con `aria-expanded="false"`.

## Verificación visual de Orchestrator (navegador del panel, sesión real contra Cloud, solo lectura)
- **Sin scroll horizontal:** `/dashboard`, `/customers`, `/customers/new`, `/technicians` y `/technicians/new` a 375, 393, 768, 1024 y 1440 px, tras DEV4. Antes de DEV4, el dashboard a 768 px desbordaba 23 px.
- **Cabecera a 375 y 393 px:** sin solapamientos entre el botón de menú, la marca, la organización, el rol y «Cerrar sesión».
- **Error de SSR descartado:** el error `buttonClass is not a function` desapareció cuando el humano reinició el servidor de desarrollo.
- **No visto en navegador:**
  - Listados con registros: Cloud tiene 0 registros y no se escriben datos allí, porque la migración nueva no está aplicada en Cloud.
  - Archivado y restauración reales.
  - Login a 768 px. El login a 375, 393, 768 y 1440 px lo capturó Develop con Playwright sin sesión.

## Checks locales (último RETEST, exit 0)
`pnpm format:check`, `lint`, `typecheck`, `test:unit` (260), `test:integration` (219, PGlite), `build`, `test:e2e` (12). `playwright -c playwright.supabase.config.ts --list`: 54 tests en 5 archivos.

## Comprobación Git
Antes y después de cada delegación:
- SHA `50dd257`, rama sin cambios, staging vacío.
- Ignorados sensibles iguales a la línea base: `.env.local` y `.claude/settings.local.json`, sin leerlos.
- Manifiestos de hashes fuera del repositorio.

Todas las diferencias están dentro de la lista permitida de cada fase. En DEV3, Orchestrator amplió la lista a `src/lib/records/pages.tsx`, solo para la composición visual. Develop intentó escribir ese archivo en DEV2 sin autorización, el permiso se denegó y se detuvo.

## Pendientes y limitaciones
1. **CI (bloqueante para PASS):** `pnpm test:supabase` y `pnpm test:e2e:supabase` en el job `supabase`, con PostgREST y Auth reales. Incluyen C-31..C-34, `crm.spec.ts` y las specs independientes. Exige un push autorizado por el humano.
2. **Supabase Cloud:** la migración `20261124100000` no está aplicada. Sin ella, archivar y restaurar en Cloud usarán el trigger antiguo, que impide restaurar. Aplicarla requiere autorización.
3. **Ratificación humana:**
   - Diseño de `activity_events`: campos, acciones `archived`/`restored` y actor obligatorio. Anticipa una parte de DH-08 sin resolverla.
   - Cualquier miembro puede restaurar.
   - Los scripts sin JWT ya no pueden archivar ni restaurar.
4. **DH-04/DH-05:** se aplazan a F4; el punto de enganche está documentado en ADR-001.
5. **Hallazgos para aceptación humana:**
   - F-01 Informational: `*` actúa como comodín en la búsqueda.
   - F-02 Low: el control de contraseña se llama «Mostrar»/«Ocultar», sin la palabra «contraseña», para no romper `login-layout.spec.ts`.
   - F-03 Informational: Orchestrator revisó la documentación y es coherente.
   - F-04 Low del PRE: TRUNCATE de administración; mitigado con un trigger BEFORE TRUNCATE que no está probado.

## Decisiones humanas (2026-11-24, tras el RETEST)
Ratificado por el humano:
- `activity_events` como base del futuro módulo de actividad, **sin cerrar DH-08** por completo. Los campos y las acciones siguen abiertos a ampliación en F4/F6.
- Cualquier miembro autorizado (owner o member) puede restaurar registros de su organización.
- Se rechazan el archivado y la restauración sin identidad autenticada (`auth.uid()` nulo).
- Cada evento se registra de forma atómica con su operación, en la misma transacción.
- DH-04 y DH-05 son **obligatorias en F4**. No es una mejora opcional: F4 no se puede cerrar sin ellas.
- Se acepta provisionalmente el comodín `*` de la búsqueda (F-01).

Mejora menor registrada (no se ha implementado):
- **TASK-008B-M1:** el nombre accesible del control de contraseña debe incluir «contraseña» («Mostrar contraseña» / «Ocultar contraseña»).
- Una prueba existente no debe impedir una mejora legítima de accesibilidad. Testing deberá ajustar `tests/e2e/independent/login-layout.spec.ts`, que hoy usa `getByLabel(/contrase/i)` con coincidencia exacta de 1, para que localice el campo sin depender de ese nombre.

## Alcance de la inmutabilidad de `activity_events`
- **Usuarios de la aplicación** (`anon`, `authenticated` vía PostgREST o Server Actions): **inmutable y no falsificable**.
  - Sin privilegios INSERT, UPDATE, DELETE ni TRUNCATE (`revoke all`, solo `grant select` a `authenticated`) y sin políticas de escritura: se rechaza con 42501.
  - Los eventos solo los inserta `private.prevent_unarchive()` (SECURITY DEFINER, sin EXECUTE para usuarios), con el actor sacado de `auth.uid()` y la organización de la fila.
  - Verificado en PGlite (C-20..C-26). La verificación por PostgREST real (C-31..C-34) está pendiente de CI.
- **Administradores de PostgreSQL** (propietario de la tabla, `postgres`, superusuario, `service_role` con SQL): **inmutabilidad de defensa en profundidad, no absoluta**.
  - Los triggers rechazan UPDATE y DELETE fila a fila (23000) y TRUNCATE (BEFORE TRUNCATE). Lo de TRUNCATE no está probado; es el hallazgo F-04 del PRE.
  - Un administrador puede saltárselo: desactivando triggers (`ALTER TABLE … DISABLE TRIGGER`, `session_replication_role = replica`), borrando o reemplazando la tabla o los triggers en una migración, o restaurando copias de seguridad.
  - Que la tabla no se manipule desde la administración depende del control de acceso operativo a la base de datos y de la revisión de migraciones, no del esquema.
- `service_role` no se usa en el código de aplicación (grep en `src/`).
