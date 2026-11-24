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

Estructura de F2: `src/app` (layout y página inicial mínima), `src/features`, `src/components` y `src/lib` (vacíos, con README), `tests/unit`, `tests/e2e`, `tests/support` y `.github/workflows/ci.yml`. `test:integration` no existe hasta F3 (requiere base de datos de pruebas).
