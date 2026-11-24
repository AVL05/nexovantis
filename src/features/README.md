# features

Dominio por módulo. Cada módulo agrupará sus componentes, validaciones y reglas de dominio. En F3 hay esquemas Zod y, desde TASK-007, el módulo de autenticación:

- `customers/schema.ts`: alta y edición de clientes.
- `technicians/schema.ts`: alta y edición de técnicos.
- `auth/` (TASK-007): `redirect.ts` (`safeNextPath`, puro), `routes.ts` (rutas protegidas, puro), `schema.ts` (Zod de login), `actions.ts` (Server Actions `loginAction` y `logoutAction`), `session.ts` (server-only: `requireUser()` con `getUser()` y `requireMembership()` desde `memberships` bajo RLS) y `LogoutButton.tsx`. Sin registro público.

Ver [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
