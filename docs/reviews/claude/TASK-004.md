# TASK-004 — F2 Next.js Foundation (contrato y registro de Orchestrator)

Fecha: 2026-11-24. Rama `chore/project-foundation`, HEAD `86611a8fc62dcf1c8a34af18a817fac55368ae91`, sin commit (F1 sigue sin commit en el árbol de trabajo).
Autorización humana (DH-G1, mensaje de 2026-11-24): "Una vez completado el cierre documental, autorizo comenzar F2." y "Comprueba las versiones y compatibilidades antes de instalar las dependencias." El cierre documental terminó con TASK-003-POST PASS.

## Alcance
Scaffold técnico mínimo: Next.js App Router, React, TypeScript estricto, Tailwind CSS, pnpm, directorio `src/`, alias `@/*`, ESLint, Prettier, Vitest, Playwright, scripts de calidad y pruebas, estructura modular de docs/ARCHITECTURE.md, GitHub Actions, README verificado y página inicial mínima.

Fuera de alcance: autenticación, Supabase, inventario, presupuestos, cualquier funcionalidad de negocio, axe-core (no aprobado), umbral de cobertura (DH-09 pendiente), despliegue.

## Versiones verificadas (registro npm, `pnpm view`, 2026-11-24)
| Paquete | Versión | Motivo |
|---|---|---|
| next / eslint-config-next | 16.4.6 | Última estable (publicada 2026-11-09). Node `>=20.9.0` |
| react / react-dom | 19.3.1 | Peer de Next `^19.0.0` |
| typescript | 6.0.3 | 7.0.2 es la última, pero `typescript-eslint` 8.74.0 (dependencia de eslint-config-next) exige `>=4.8.4 <6.1.0` |
| @types/react / @types/react-dom | 19.3.0 | Alineados con React 19.3 |
| @types/node | 24.19.2 (línea 24) | Coincide con Node 24.22.2 local |
| tailwindcss / @tailwindcss/postcss | 4.3.5 | Última estable |
| eslint | 9.39.5 | 10.15.0 excluido: eslint-plugin-react 7.37.5, jsx-a11y 6.10.2 e import 2.32.0 solo admiten ESLint `<=9` |
| eslint-config-prettier | 10.1.8 | Desactiva reglas de formato en conflicto |
| prettier | 3.10.1 | Última estable |
| vitest | 5.1.1 | Node `^22.12 \|\| ^24`; peer vite `^6.4 \|\| ^7 \|\| ^8` |
| vite | 8.3.8 | Requerido por @vitejs/plugin-react 6.3.0 (`^8.0.0`) |
| @vitejs/plugin-react | 6.3.0 | JSX en Vitest |
| jsdom | 31.0.1 | Entorno DOM de Vitest |
| @testing-library/react / dom / jest-dom | 16.3.3 / 10.4.2 / 8.0.0 | Pruebas de componentes |
| @playwright/test | 1.65.1 | Peer de Next `^1.51.1`; solo navegador Chromium |
Entorno: Node 24.22.2, pnpm 12.16.1, Git 2.56.0 (Windows 11).

## Restricciones operativas
- Accesos remotos autorizados: solo el registro npm (instalación) y la descarga del navegador Chromium de Playwright, ambos implícitos en la autorización de F2. Ningún otro servicio.
- Sin `next/font/google` ni recursos remotos en build o runtime (descargaría fuentes de Google). Fuentes del sistema.
- Telemetría de Next desactivada con `NEXT_TELEMETRY_DISABLED=1` en los comandos, en `webServer` de Playwright y en CI. No ejecutar `next telemetry disable` (escribe configuración global).
- Sin `.env*` nuevos; `.env.example` no se toca. Sin secretos.
- Sin `git add`, commit, push, merge ni despliegue. CI se escribe pero no se ejecuta en GitHub (requiere push, no autorizado): su verificación es estática y por ejecución local de los mismos comandos.

## Archivos permitidos para Develop (lista cerrada)
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `prettier.config.mjs` (o `.prettierrc.json`), `.prettierignore`, `vitest.config.mts`, `playwright.config.ts`, `src/app/**`, `src/components/**`, `src/features/**`, `src/lib/**`, `tests/unit/**` y `tests/e2e/**` (excepto `independent/`), `tests/support/**` (compartido; cada cambio se declara), `.github/workflows/ci.yml`, `README.md`, `docs/ARCHITECTURE.md` (solo una sección de stack verificado y estructura; sin cambiar decisiones), `.gitignore` (solo añadidos de artefactos generados). Artefactos ignorados generados por las herramientas: `node_modules/`, `.next/`, `test-results/`, `playwright-report/`, `next-env.d.ts`.

## Archivos prohibidos
`.claude/**` (no leer `.claude/settings.local.json`), CLAUDE.md, AGENTS.md, `docs/**` salvo `docs/ARCHITECTURE.md`, `docs/reviews/**`, `tests/acceptance/**`, `tests/**/independent/**`, `.gitattributes`, `.editorconfig`, `.env*`, `supabase/**`, `public/**` (si hiciera falta, se pide).

## Criterios de aceptación del humano (no reducibles)
Instalación reproducible con pnpm; aplicación ejecutable localmente; build de producción correcto; TypeScript sin errores; ESLint sin errores; al menos una prueba unitaria significativa; al menos una prueba E2E funcional; CI coherente con los comandos reales; sin secretos expuestos; documentación actualizada; revisión independiente de Testing con resultados reales.

## Registro de delegaciones (agentes nativos con la herramienta Agent; modelo autoinformado `claude-sonnet-5-5`, esfuerzo configurado `high`, efectivo no verificable)

| Paso | Agente | Resultado | Comprobación Git de Orchestrator (manifiesto `git hash-object`) |
|---|---|---|---|
| PRE | testing | Criterios F2-01..F2-33 en [TASK-004-PRE](TASK-004-PRE.md); pruebas independientes `tests/e2e/independent/home.spec.ts` (7 casos) y `tests/unit/independent/home-page.test.tsx` (2 casos) | HEAD igual, índice vacío; solo las 3 rutas autorizadas |
| Implementación | develop | Scaffold completo; lint, typecheck, format:check y build exit 0; unit 4/4; e2e 9/9 | **ORC4-01 (High)**: AGENTS.md cambió (hash `bdf3e107…` → `f160e216…`). Causa: `next dev` de Next 16.4.6 añade un bloque gestionado `nextjs-agent-rules` a AGENTS.md cuando detecta un agente (`agentRules`, por defecto `true`). No fue una edición de Develop, pero su informe no lo detectó |
| Corrección | develop | `agentRules: false` en `next.config.ts`; el propio `next dev` retiró su bloque; AGENTS.md vuelve a `bdf3e107…`; checks repetidos en verde | Todas las rutas cambiadas dentro de la lista permitida; AGENTS.md y CLAUDE.md iguales a la línea base |
| POST | testing | **PASS** ([TASK-004-POST](TASK-004-POST.md)). Repo: install frozen, format:check, lint, typecheck, build exit 0; unit 4/4; e2e 9/9; start y dev 200. Copia limpia fuera del repo: install `--frozen-lockfile --offline` (428 paquetes), mismos checks en verde, e2e 9/9 también con `CI=1`. Mutación: las pruebas propias de Develop fallan al cambiar título y texto. ORC4-01 verificado cerrado | HEAD igual, índice vacío; solo el informe POST nuevo |

Hallazgos para aceptación humana: F2P-01 (Low, `format:check` acotado por lista blanca; docs y archivos de agentes no siguen Prettier), F2P-02 (Informational, CI nunca ejecutado en GitHub; versiones de acciones no verificadas sin red), F2P-03 (Informational, `test:integration` inexistente hasta F3). Copia limpia de Testing en `%TEMP%\tmp.vtD7CFkljx`, fuera del repositorio, sin borrar.
