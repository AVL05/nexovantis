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
