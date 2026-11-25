# Nexovantis

Gestión de operaciones y servicios técnicos para pequeñas empresas de mantenimiento, instalaciones y reparaciones.

**Estado:** F3 en curso (base de datos). Hay un scaffold Next.js con una página inicial mínima, comprobaciones de calidad y CI, y el esquema de base de datos (migraciones de Supabase, RLS y pruebas). Sin interfaz de negocio, autenticación, ni despliegue.

## Producto

El núcleo conecta clientes, técnicos, órdenes de trabajo y un dashboard basado en datos persistentes. Presupuestos, inventario y trazabilidad son ampliaciones condicionadas a la aprobación del núcleo.

## Ingeniería

Next.js App Router, TypeScript, Supabase PostgreSQL/Auth, pnpm y Vercel (plan gratuito sujeto a elegibilidad). Claude Code coordina dos subagentes nativos: Develop y Testing. Codex realiza auditorías independientes, sin implementar producción. En F2 solo están implementados Next.js, React, TypeScript, Tailwind CSS y las herramientas de calidad; el resto es arquitectura prevista.

## Requisitos

- Node.js 24 (verificado con 24.22.2).
- pnpm 12.16.1 (fijado en `packageManager`; verificado con 12.16.1).

## Instalación

```bash
pnpm install --frozen-lockfile
```

Para las pruebas E2E hace falta el navegador Chromium de Playwright (descarga única):

```bash
pnpm exec playwright install chromium
```

## Ejecución

```bash
pnpm dev          # desarrollo en http://localhost:3000
pnpm build        # build de producción
pnpm start        # servidor de producción (requiere build previo)
```

La telemetría de Next.js está desactivada en la configuración de Playwright y de CI. En local, exporta `NEXT_TELEMETRY_DISABLED=1` antes de ejecutar los comandos si quieres desactivarla.

## Scripts

| Script                  | Descripción                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint 9 (flat config, `eslint-config-next` y Prettier) con `--max-warnings=0`.                                |
| `pnpm typecheck`        | `next typegen` y `tsc --noEmit` con TypeScript estricto.                                                       |
| `pnpm format:check`     | Comprueba el formato con Prettier (código, tests, CI y README).                                                |
| `pnpm format`           | Aplica el formato con Prettier a los mismos archivos.                                                          |
| `pnpm test:unit`        | Pruebas unitarias con Vitest y Testing Library.                                                                |
| `pnpm test:integration` | Migraciones y RLS en PGlite (PostgreSQL real in-process con un shim de `auth`; no es Supabase).                |
| `pnpm test:supabase`    | Pruebas contra el stack local de Supabase (`supabase start`): pensadas para CI; requieren variables del stack. |
| `pnpm test:e2e`         | Pruebas E2E con Playwright (Chromium); construye y arranca la app en el puerto 3100.                           |

`format` y `format:check` no incluyen `docs/` ni los archivos de instrucciones de agentes: su estilo de Markdown no coincide con la configuración de Prettier y su formato se decide aparte.

## Variables de entorno

Copia `.env.example` a `.env.local` (no se versiona) y rellena solo valores públicos:

| Variable                               | Uso                                             |
| -------------------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL de la API de Supabase (http o https).       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (nunca una clave de servicio). |

`src/lib/env.ts` las valida bajo demanda con Zod: `pnpm build` no las exige. Las pruebas `test:supabase` usan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` del stack local (`supabase status -o env`); la clave de servicio local solo prepara datos de prueba y nunca se usa en `src/`.

## Base de datos

El esquema vive en `supabase/migrations/` (organizaciones, membresías, clientes y técnicos, con RLS por operación). La matriz de roles y las decisiones asociadas son una propuesta pendiente de aprobación humana: ver [ADR-001](docs/adr/ADR-001-roles-rls.md).

Las pruebas de base de datos se ejecutan en tres niveles distintos:

1. `pnpm test:integration` (PGlite): aplica el shim de `auth` y las migraciones sobre PostgreSQL real en memoria y prueba esquema, restricciones, privilegios y RLS. No requiere Docker. **No es Supabase**: no incluye PostgREST ni Auth.
2. `pnpm test:supabase` (stack local de Supabase): se ejecuta en el job `supabase` de CI con `supabase start` (CLI 2.122.1, requiere Docker). Aún no se ha ejecutado: necesita un push autorizado.
3. Proyecto de Supabase Cloud: no se ha creado ni usado.

Los tipos de `src/lib/supabase/database.types.ts` están escritos a mano y se regenerarán con la CLI de Supabase.

## Pruebas

- Unitarias: `tests/unit/` (las de `independent/` pertenecen a Testing).
- Integración: `tests/integration/` (PGlite; las de `independent/` pertenecen a Testing) y `tests/integration/supabase/` (stack local de CI).
- E2E: `tests/e2e/` (las de `independent/` pertenecen a Testing). `playwright.config.ts` ejecuta `pnpm build && pnpm start --port 3100`; en local reutiliza un servidor ya iniciado en ese puerto y en CI no.
- Soporte compartido: `tests/support/`.

## CI

`.github/workflows/ci.yml` se ejecuta en `push` y `pull_request` con permisos de solo lectura, Node 24 y pnpm según `packageManager`. Ejecuta, en orden: `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test:unit`, `test:integration`, `build`, instalación de Chromium y `test:e2e`; sube el informe de Playwright si falla. Un segundo job, `supabase`, arranca el stack local con la CLI 2.122.1, exporta las variables del stack sin imprimirlas y ejecuta `pnpm test:supabase`. El workflow con estos cambios aún no se ha ejecutado en GitHub (requiere push); los comandos del job `quality` sí se han ejecutado en local, los del job `supabase` no (sin Docker en el entorno de desarrollo).

## Estructura

```text
src/app/          rutas y composición (App Router)
src/features/     dominio por módulo (esquemas Zod de clientes y técnicos)
src/components/   UI compartida (vacío)
src/lib/          entorno y clientes de Supabase
supabase/         config.toml y migraciones SQL
tests/            unit, integration, e2e y soporte
docs/             documentación de producto, arquitectura y flujo
```

## Documentación

- [Requisitos](docs/PRODUCT_REQUIREMENTS.md) y [contrato de entrega](docs/CHALLENGE.md)
- [Arquitectura](docs/ARCHITECTURE.md) y [reglas de negocio](docs/BUSINESS_RULES.md)
- [Flujo multiagente](docs/AGENT_WORKFLOW.md) y [directrices de testing](docs/TESTING_GUIDELINES.md)
- [Seguridad](docs/SECURITY.md), [roadmap](docs/ROADMAP.md) y [despliegue](docs/DEPLOYMENT.md)

## Agentes

[Orchestrator](CLAUDE.md) · [Develop](.claude/agents/develop.md) · [Testing](.claude/agents/testing.md) · [Codex auditor](AGENTS.md).

No hay todavía URL de producción: se incorporará al verificar el despliegue. Las evidencias de revisión se registrarán únicamente después de ejecutar las comprobaciones reales. Los datos serán ficticios y las credenciales de evaluación se comunicarán por un canal privado.
