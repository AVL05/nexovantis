# Arquitectura técnica

Monolito modular Next.js App Router + React + TypeScript estricto. pnpm, Tailwind, shadcn/ui según necesidad, Zod en servidor. Supabase PostgreSQL/Auth y @supabase/ssr. Vercel gratuito si es elegible. Vitest, Playwright, ESLint y GitHub Actions. Versiones estables compatibles, lockfile versionado; se verificarán en F2.

## Capas
src/app (rutas y composición), src/features (dominio por módulo), src/components (UI compartida), src/lib (clientes servidor/navegador y utilidades), supabase/migrations (SQL), tests (unit, integration, e2e, acceptance). Server Actions/Route Handlers validan entrada, identidad y permisos; dominio centraliza reglas. No usar claves elevadas en solicitudes normales.

## Datos
P0: organizations, memberships (user/org/role), customers, technicians, work_orders, work_order_events. P1: quotes, quote_items, inventory_items, stock_movements. Toda entidad operativa tiene organization_id; constraints y claves foráneas compuestas o mecanismos equivalentes impiden referencias cruzadas. RLS en tablas expuestas, políticas por operación y membresía. Migraciones reproducibles y seed sintético; probar dos identidades de organizaciones distintas.

## Operaciones críticas
Transacciones PostgreSQL/RPC para aceptar presupuesto y consumir stock; concurrencia, idempotencia, constraints y rollback. Dinero en céntimos enteros o numeric con política explícita. Fechas persistidas con semántica clara y presentación es-ES.

## Decisiones pendientes
Definir permisos exactos, esquema, estrategia de entornos y versiones en F2/F3 con ADRs cuando haya decisiones de impacto. No confundir esta propuesta con implementación existente.

Pendientes conocidos, todos sin implementar y registrados por fase en [docs/ROADMAP.md](ROADMAP.md): roles y permisos exactos; RLS por operación y membresía; GRANT y exposición de PostgREST además de RLS; endurecimiento de RPC SECURITY DEFINER (search_path, REVOKE a PUBLIC y anon, EXECUTE); política de IVA y redondeo; concurrencia e idempotencia; preflight del entorno local (Docker, WSL, Supabase CLI no verificados). La propiedad de `tests/support/**` no es un pendiente: está definida como compartida en la tabla de propiedad de `tests/` de [docs/TESTING_GUIDELINES.md](TESTING_GUIDELINES.md). Las reglas de negocio ambiguas (DH-01..DH-08 y DH-13) están en docs/BUSINESS_RULES.md.

## Stack verificado (F2)
Versiones exactas instaladas y verificadas en F2 (2026-11-24, Node 24.22.2, pnpm 12.16.1): Next.js 16.4.6 (App Router, Turbopack), React 19.3.1, TypeScript 6.0.3 estricto (TypeScript 7 queda fuera hasta que `typescript-eslint` lo soporte), Tailwind CSS 4.3.5 (`@tailwindcss/postcss`), ESLint 9.39.5 con `eslint-config-next` 16.4.6 (ESLint 10 queda fuera por incompatibilidad de plugins), Prettier 3.10.1, Vitest 5.1.1 con Vite 8.3.8, `@vitejs/plugin-react` 6.3.0, jsdom 31.0.1 y Testing Library, Playwright 1.65.1 (solo Chromium). Alias `@/*` → `src/*`. Fuentes del sistema; sin recursos remotos en build ni runtime.

Estructura de F2: `src/app` (layout y página inicial mínima), `src/features`, `src/components` y `src/lib` (en F2 vacíos, con README; en F3 contienen esquemas Zod, `env.ts` y los clientes de Supabase), `tests/unit`, `tests/e2e`, `tests/support` y `.github/workflows/ci.yml`. `test:integration` se añade en F3 (ver la sección siguiente).

## Modelo de datos F3 (TASK-006)
Estado: implementado en migraciones y verificado solo en PGlite (PostgreSQL real in-process con un shim de `auth`; no es Supabase). La verificación en Supabase local es el job `supabase` de CI y no se ha ejecutado; Supabase Cloud no se ha usado. La matriz de acceso y las reglas DH-04..DH-06 son propuestas pendientes de aprobación humana: ver [ADR-001](adr/ADR-001-roles-rls.md).

- Tablas en `public` (`supabase/migrations/`): `organizations`, `memberships` (rol `owner` o `member`; `unique (user_id)`: una organización por usuario), `customers` y `technicians` (con `organization_id`, `archived_at` y `unique (organization_id, id)` para claves compuestas de F4). Sin órdenes, presupuestos ni inventario.
- Seguridad: RLS en las cuatro tablas, políticas por operación y rol `authenticated`; `anon` sin privilegios; sin DELETE ni TRUNCATE; privilegios por columna para impedir escribir `id`, `organization_id` y marcas de tiempo; `memberships` es de solo lectura para usuarios. Organizaciones y membresías se crean fuera de la app.
- Funciones auxiliares `private.is_org_member` y `private.has_org_role` (SECURITY DEFINER, `search_path` vacío, EXECUTE solo para `authenticated`) en un esquema no expuesto por la API.
- Triggers: `updated_at`, inmutabilidad de `organization_id` y bloqueo de restauración y de cambio de `archived_at` en registros ya archivados hasta ratificar DH-06.
- Aplicación: `src/lib/env.ts` (validación Zod perezosa), `src/lib/supabase/client.ts` y `server.ts` (clientes `@supabase/ssr` con clave publicable), `database.types.ts` escrito a mano (se regenerará con la CLI) y esquemas Zod en `src/features/customers` y `src/features/technicians`. Sin `service_role` en `src/`. Login, sesión, proxy y rutas protegidas: TASK-007.
- Pruebas: `tests/integration/` (PGlite, `pnpm test:integration`), `tests/integration/supabase/` (stack local en CI, `pnpm test:supabase`) y soporte compartido en `tests/support/` (`pglite.ts`, `supabase-shim.sql`, `fixtures.ts`).
