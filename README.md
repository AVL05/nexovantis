# Nexovantis

Nexovantis es una aplicación de gestión de servicios técnicos para pequeñas empresas de mantenimiento, instalaciones y reparaciones. La prueba técnica usa datos ficticios y ofrece una interfaz en español para escritorio y móvil.

El alcance funcional está integrado en `main`. Consulta el [estado de la entrega](docs/STATUS.md) y la [guía de despliegue](docs/DEPLOYMENT.md) para conocer las comprobaciones pendientes.

## Funcionalidades

| Módulo              | Qué permite hacer                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Acceso              | Iniciar y cerrar sesión con correo y contraseña. Cada cuenta pertenece a una organización y tiene un rol. |
| Clientes y técnicos | Crear, consultar, editar, buscar, archivar y restaurar según el rol.                                      |
| Órdenes de servicio | Asignar técnicos activos, gestionar estados y consultar el historial de cada orden.                       |
| Panel               | Consultar indicadores de órdenes y trabajo pendiente a partir de datos persistidos.                       |
| Presupuestos        | Editar conceptos e IVA en borrador, consultar totales, rechazar o aceptar y generar una única orden.      |
| Inventario          | Consultar catálogo y movimientos, registrar entradas y consumir stock vinculado a una orden.              |
| Actividad           | Consultar eventos de negocio por organización y filtrarlos por tipo, acción y fecha.                      |

## Stack y arquitectura

**Next.js 16 App Router**, **React 19**, **TypeScript estricto**, **Tailwind CSS 4** y **Zod**. **Supabase** aporta Auth, PostgREST y PostgreSQL. El proyecto usa **Node.js 24** y **pnpm 12.16.1**.

Next.js reúne la interfaz y el backend de aplicación en un monolito modular. Los Server Components componen las vistas y las Server Actions procesan las mutaciones. Cada solicitud autenticada accede a Supabase con la clave publicable y la sesión del usuario. PostgreSQL aplica RLS y privilegios por rol, protege referencias entre entidades y garantiza la atomicidad de la aceptación de presupuestos y del consumo de stock. [Arquitectura técnica](docs/ARCHITECTURE.md) · [Matriz de roles](docs/adr/ADR-001-roles-rls.md).

```text
src/app/           portada, login y rutas operativas
src/features/      validación, servicios y acciones por dominio
src/components/    interfaz compartida
src/lib/           entorno, clientes Supabase y utilidades
supabase/          migraciones, comprobaciones SQL y seeds demo
tests/             pruebas unitarias, integración y E2E
.github/workflows/ CI de GitHub Actions
docs/              requisitos, operación y evidencias de revisión
```

## Instalación local

1. Con Node.js 24 y pnpm 12.16.1, instala las dependencias con `pnpm install --frozen-lockfile`.
2. Instala Supabase CLI 2.122.1 y arranca Docker. Sigue la [preparación de la demo](docs/SEED.md#preparación-local) para iniciar el stack aislado, aplicar las migraciones y crear las cuentas y los datos ficticios.
3. Copia [`.env.example`](.env.example) a `.env.local` y configura los dos valores del mismo proyecto:

   | Variable                               | Valor                                                            |
   | -------------------------------------- | ---------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | URL de la API de Supabase. En local, la URL de `supabase start`. |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable. En local también se admite la clave `anon`.    |

4. Ejecuta `pnpm dev` y abre [localhost:3000](http://localhost:3000). Para probar el servidor de producción localmente, ejecuta `pnpm build` y después `pnpm start`.

## Pruebas y seguridad

| Comando                       | Cobertura                                                           |
| ----------------------------- | ------------------------------------------------------------------- |
| `pnpm format:check`           | Formato del código, pruebas, CI y README.                           |
| `pnpm lint`, `pnpm typecheck` | ESLint y comprobación de tipos.                                     |
| `pnpm test:unit`              | Pruebas unitarias con Vitest y Testing Library.                     |
| `pnpm test:integration`       | PostgreSQL en memoria con PGlite y un shim de Auth.                 |
| `pnpm test:e2e`               | Humo de la aplicación con Playwright y Chromium.                    |
| `pnpm test:supabase`          | Integración con PostgreSQL, Auth y PostgREST del stack local.       |
| `pnpm test:e2e:supabase`      | Flujos de navegador con usuarios y sesiones reales del stack local. |

Para E2E, instala Chromium con `pnpm exec playwright install chromium`. El [workflow de CI](.github/workflows/ci.yml) define los dos jobs y prepara las variables del Supabase local para los tests correspondientes. La clave de servicio local se usa en la preparación de fixtures de pruebas. La aplicación usa exclusivamente credenciales públicas del proyecto y sesiones individuales. Las cuentas demo y sus contraseñas se facilitan por un canal privado. [Directrices de testing](docs/TESTING_GUIDELINES.md) · [Seguridad](docs/SECURITY.md).

## Metodología multiagente

El desarrollo se organizó por módulos en Claude Code Desktop. [Orchestrator](CLAUDE.md) fijó alcance y criterios y delegó la implementación a [Develop](.claude/agents/develop.md). [Testing](.claude/agents/testing.md) revisó el diff y ejecutó pruebas independientes. Los fallos volvieron a Develop y se verificaron con retests dirigidos. GitHub Actions aportó la regresión por SHA y Codex realizó auditorías focalizadas en las puertas del roadmap. En F8, Codex se encargó de la preparación documental y del procedimiento de despliegue. [Flujo multiagente](docs/AGENT_WORKFLOW.md) · [Ejemplo de revisión y retest](docs/reviews/claude/TASK-014.md).

## Limitaciones conocidas

- El alta de usuarios y la asignación de organizaciones y roles se administran fuera de la aplicación. Cada usuario tiene una sola organización.
- Órdenes, presupuestos y actividad requieren JavaScript para salir del estado de carga. F7 registró incidencias moderadas de axe y limitaciones de foco y desplazamiento. La revisión queda descrita en [TASK-014](docs/reviews/claude/TASK-014.md).
- El alcance de la prueba técnica excluye facturación fiscal, pagos e integraciones externas. [Requisitos de producto](docs/PRODUCT_REQUIREMENTS.md).
