# Arquitectura técnica

Monolito modular Next.js App Router + React + TypeScript estricto. pnpm, Tailwind, shadcn/ui según necesidad, Zod en servidor. Supabase PostgreSQL/Auth y @supabase/ssr. Vercel gratuito si es elegible. Vitest, Playwright, ESLint y GitHub Actions. Versiones estables compatibles, lockfile versionado; se verificarán en F2.

## Capas
src/app (rutas y composición), src/features (dominio por módulo), src/components (UI compartida), src/lib (clientes servidor/navegador y utilidades), supabase/migrations (SQL), tests (unit, integration, e2e, acceptance). Server Actions/Route Handlers validan entrada, identidad y permisos; dominio centraliza reglas. No usar claves elevadas en solicitudes normales.

## Backend de aplicación (decisión de arquitectura)

Next.js App Router sobre Node.js es el backend propio de Nexovantis; Supabase proporciona Auth, API de datos y PostgreSQL. Un solo proyecto/despliegue Next.js en Vercel, sin Express, NestJS, Laravel ni otro servidor/API independiente. No añadir microservicios ni ORM por defecto. PGlite se limita a desarrollo/pruebas; no sustituye Supabase Cloud.

- `src/app/`: Server Components para lecturas y composición; Server Actions para mutaciones internas; Route Handlers solo si se necesita HTTP (integraciones, callbacks o endpoints específicos). No llamar por HTTP a la propia app desde Server Components si puede invocar un servicio directamente.
- `src/features/<dominio>/`: esquemas Zod, lógica de negocio y módulos server-only (servicios y acceso a datos, separar archivos cuando aporte claridad). Un módulo por auth, customers, technicians, work-orders y futuros módulos. No importar módulos exclusivos del servidor desde Client Components.
- `src/lib/`: clientes Supabase de servidor/navegador, utilidades de sesión/autorización, errores seguros y validación compartida. Crear clientes de servidor con la sesión de la petición; no compartir sesiones entre usuarios.
- Cada operación de servidor valida input, identidad verificada, membresía y autorización por rol. Obtener la organización desde la membresía autorizada; nunca confiar en identificadores, roles o datos de sesión no verificados del cliente. Tratar Server Actions y Route Handlers como entradas no confiables. El proxy de sesión no sustituye los controles de autorización de cada operación.
- Acceso a datos normal con JWT del usuario y clave publicable, sin service_role. RLS, GRANT y constraints son segunda frontera que debe resistir llamadas directas a PostgREST. Las invariantes críticas (referencias, cambios de estado, archivado con órdenes, aceptación de presupuestos, consumo concurrente) se protegen también en PostgreSQL; RPC/transacciones cuando se necesita atomicidad, sin depender de varios round-trips. SECURITY DEFINER solo si se justifica y con privilegios mínimos.
- Manejo consistente de errores de validación, autorización, inexistencia y conflictos; no exponer SQL, secretos o detalles internos. Mantener datos sensibles y respuestas personalizadas fuera de cachés compartidas.
- Validar el backend mediante pruebas de servicios y flujos, aislamiento real con dos usuarios/organizaciones, pruebas directas de API de datos y E2E. Evitar capas vacías y abstracciones genéricas: crear módulos cuando se implementa su funcionalidad.

Esta sección define responsabilidades futuras, no afirma que el backend esté completo. La matriz de roles y las decisiones de negocio pendientes se ratifican por separado; no se modifican aquí.

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
- Triggers: `updated_at`, inmutabilidad de `organization_id` y, desde TASK-008B, archivado/restauración con evento en `public.activity_events` (ver la sección de Clientes y Técnicos); el cambio de `archived_at` entre dos fechas sigue rechazado.
- Aplicación: `src/lib/env.ts` (validación Zod perezosa), `src/lib/supabase/client.ts` y `server.ts` (clientes `@supabase/ssr` con clave publicable), `database.types.ts` escrito a mano (se regenerará con la CLI) y esquemas Zod en `src/features/customers` y `src/features/technicians`. Sin `service_role` en `src/`. Login, sesión, proxy y rutas protegidas: ver la sección siguiente (TASK-007).
- Pruebas: `tests/integration/` (PGlite, `pnpm test:integration`), `tests/integration/supabase/` (stack local en CI, `pnpm test:supabase`) y soporte compartido en `tests/support/` (`pglite.ts`, `supabase-shim.sql`, `fixtures.ts`).

## Autenticación y sesión F3 (TASK-007)
Estado: implementado. La verificación con Auth real solo se ejecuta en el job `supabase` de CI (`pnpm test:e2e:supabase`); no se ha ejecutado en local ni contra Supabase Cloud.

- `src/proxy.ts` (Next.js 16; sin `middleware.ts`): crea un cliente `@supabase/ssr` por solicitud, refresca la sesión con `getClaims()` y aplica las cookies y las cabeceras anti-caché de `setAll` a la respuesta (POST-07). Redirige a `/login` (307, `private, no-store`, `next` validado) las rutas protegidas sin sesión. Sin variables de Supabase, las rutas públicas siguen funcionando y las protegidas fallan cerradas. No es la única barrera.
- `src/features/auth/session.ts` (`server-only`): `requireUser()` verifica la sesión contra Auth con `getUser()` (decisión sobre DH-T7-1: una cookie copiada antes del logout deja de autorizar) y redirige a `/login`; `requireMembership()` obtiene organización y rol de `memberships`/`organizations` con el cliente del usuario bajo RLS, nunca de datos del cliente. No se usa `getSession()` para decidir.
- `/login`: Server Action con Zod y `signInWithPassword`; un único mensaje de error genérico para cualquier fallo; `next` pasa por `safeNextPath` (solo rutas internas). Con sesión redirige a `/dashboard`. No hay registro público.
- `/dashboard`: Server Component dinámico (sin caché compartida) que muestra organización y rol, o un estado de acceso denegado sin datos si no hay membresía. Cierre de sesión por Server Action POST (`signOut`), también en el estado denegado; no existe ninguna ruta GET de logout.
- Pruebas: unitarias (`safeNextPath`, guardas estáticas, rutas y esquema) en `tests/unit/`; E2E con Auth real en `tests/e2e-supabase/` con `playwright.supabase.config.ts` (puerto 3200, un worker). El job `supabase` sube `sign_in_sign_ups` a 300 solo en el stack local (`supabase/config.toml`).

## Clientes y Técnicos (TASK-008B)
Estado: implementado; verificado con PGlite, pruebas unitarias y E2E local de humo. La verificación con Auth real es el job `supabase` de CI.

- Migración `20261124100000_task008b_restore_and_activity.sql`: `activity_events` (historial de archivado/restauración, solo lectura para miembros, inmutable) y `private.prevent_unarchive()` como trigger SECURITY DEFINER que escribe el evento de forma atómica con el cambio (detalle y puntos de F4 para DH-04/DH-05 en [ADR-001](adr/ADR-001-roles-rls.md)).
- `src/features/<customers|technicians>/`: `schema.ts` (Zod), `service.ts` (`server-only`; cliente del usuario bajo RLS; la organización sale siempre de `requireMembership()`), `actions.ts` (Server Actions delgadas: Zod, membresía, errores seguros, `revalidatePath`) y componentes de UI. `src/features/activity/` lee los eventos. Utilidades compartidas en `src/lib/` (paginación, búsqueda segura frente a inyección en filtros PostgREST, resultado de acción, mapeo de errores).
- Rutas protegidas `/customers` y `/technicians` (listado paginado de 20 con búsqueda y filtro por estado en `searchParams`, alta, detalle con historial, edición, archivar/restaurar con confirmación).
