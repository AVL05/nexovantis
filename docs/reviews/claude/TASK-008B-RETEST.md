# TASK-008B-RETEST (Testing, medium)

Rama feat/supabase-auth, base 50dd257 + cambios sin commit (DEV4). Solo escribí este informe.

## Resumen fiel del POST anterior (sin archivo)
Veredicto POST: BLOCKED, únicamente por jobs CI supabase pendientes (no ejecutables en local).
Criterios verificados: CRUD/archivo/restauración de clientes y técnicos, búsqueda/paginación, RLS y aislamiento multi-tenant, historial de actividad, validaciones, accesibilidad básica, sin relajación de tests independientes. Pruebas independientes añadidas en tests/**/independent/**.
Hallazgos (no bloqueantes):
- F-01 Informational: uso de '*' comodín en un select (revisar).
- F-02 Low: el toggle carece de nombre accesible adecuado.
- F-03 Informational: discrepancias menores de documentación.

## Revisión del diff DEV4
- dashboard/page.tsx: grid 1/md:2/lg:3; tarjeta Órdenes md:col-span-2 lg:col-span-1; cabecera flex-wrap min-w-0. Enlaces de módulos siguen siendo <Link> con texto; sin pérdida de semántica (h2/h3 conservados).
- RecordList.tsx (sin seguimiento, no hay diff vs HEAD): tabla con caption dentro de `hidden lg:block`; lista `<ul aria-label="Listado de ...">` con `lg:hidden`. display:none retira lo oculto del árbol de accesibilidad, así que no hay duplicidad. Enlaces de tarjetas intactos.
- dashboard-layout.test.tsx: aserción de clases por fuente (frágil pero válida; no relaja nada).

## Coherencia e2e-supabase
crm.spec.ts y records-search-login.spec.ts usan getByRole('table') a viewport Desktop Chrome 1280 (>= lg, tabla visible) y el test móvil fija 375 (tabla count 0, lista visible). Ambos coherentes con el corte lg. No requieren cambios. No ejecutados (requieren stack Supabase/CI).

## Comandos (local, todos exit 0)
format:check, lint --max-warnings=0, typecheck, test:unit, test:integration (6 archivos, 219 tests), build, test:e2e (12 passed).

## No ejecutado / pendiente
- Jobs CI supabase (test:e2e-supabase, integración Supabase, RLS) del SHA final: pendientes.
- Listados con datos a 768/1024 comprobados solo visualmente por Orchestrator sin registros; no cubiertos por test automático.

## Hallazgos nuevos
Ninguno.

## Veredicto: BLOCKED
Todo lo ejecutable pasa; solo faltan los jobs CI supabase. Pasa a PASS al verificarse en verde.
