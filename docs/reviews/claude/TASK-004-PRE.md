# TASK-004-PRE — Criterios verificables de F2 (Next.js Foundation)

- TASK-ID: TASK-004. Fase: PRE. Fecha: 2026-11-24.
- Modelo/esfuerzo solicitado: Sonnet 5.5, esfuerzo bajo/estándar (instrucción del Orchestrator). Efectivo: modelo autoinformado como Sonnet 5.5 (`claude-sonnet-5-5`), no verificado por CLI; esfuerzo no verificable.
- Rama `chore/project-foundation`, SHA base `86611a8fc62dcf1c8a34af18a817fac55368ae91`, sin commit. Diff final: solo los 3 archivos permitidos de esta fase (ver "Estado Git").
- Nivel de validación: estático. En PRE no hay scaffold; las pruebas independientes no se han ejecutado (no hay runner ni `package.json`). No se ha fabricado ningún fallo: el fallo previo es la ausencia total de scripts (`ls package.json` falla) y se registra como tal.

## Contrato de encaje con las pruebas independientes
- Playwright: `testDir: 'tests/e2e'`, `baseURL` y `webServer` propios (con `NEXT_TELEMETRY_DISABLED=1`).
- Vitest: incluye `tests/unit/**/*.test.{ts,tsx}`; el entorno jsdom lo fija la prueba con `// @vitest-environment jsdom` (también válido globalmente en config); alias `@/` → `src/`; setup que cargue `@testing-library/jest-dom/vitest`; plugin React para JSX.
- `src/app/page.tsx`: export por defecto de un componente síncrono, sin dependencias de servidor.
- Vitest no debe recoger `tests/e2e/**` (Playwright) y Playwright no debe recoger `tests/unit/**`.

## Criterios (todos aprobados en alcance; no reducibles)

Comandos desde la raíz, con `NEXT_TELEMETRY_DISABLED=1`. "Exit 0" = código de salida 0.

| ID | Criterio | Comando de verificación | Resultado esperado |
|---|---|---|---|
| F2-01 | Instalación reproducible desde cero | `rm -rf node_modules` y luego `pnpm install --frozen-lockfile` | Exit 0; lockfile sin cambios (`git status --porcelain pnpm-lock.yaml` sin variación respecto a antes) |
| F2-02 | Lockfile presente y único gestor | `ls pnpm-lock.yaml`; `ls package-lock.json yarn.lock` | Existe `pnpm-lock.yaml`; los otros no existen. `package.json` con `packageManager` o `engines.node` coherente con Node 24 |
| F2-03 | Versiones instaladas = contrato | `pnpm list --depth 0 --json` y comparar con la tabla de TASK-004 (next, eslint-config-next 16.4.6; react, react-dom 19.3.1; typescript 6.0.3; @types/react, react-dom 19.3.0; @types/node 24.19.2; tailwindcss, @tailwindcss/postcss 4.3.5; eslint 9.39.5; eslint-config-prettier 10.1.8; prettier 3.10.1; vitest 5.1.1; vite 8.3.8; @vitejs/plugin-react 6.3.0; jsdom 31.0.1; @testing-library/react 16.3.3, dom 10.4.2, jest-dom 8.0.0; @playwright/test 1.65.1) | Todas las versiones coinciden exactamente; cualquier divergencia justificada y aceptada por Orchestrator, si no es hallazgo |
| F2-04 | Scripts existentes | `node -e "const s=require('./package.json').scripts;for(const k of ['dev','build','start','lint','typecheck','format:check','test:unit','test:e2e'])if(!s[k])throw new Error(k)"` | Exit 0. Existen también `format` (opcional) |
| F2-05 | TypeScript estricto | `node -e "const t=JSON.parse(require('fs').readFileSync('tsconfig.json','utf8'));if(t.compilerOptions.strict!==true)process.exit(1)"` (si el JSON tiene comentarios, inspección manual de `tsconfig.json`) y `pnpm typecheck` | `strict: true`; sin `noImplicitAny: false` ni `"strict": false`; `pnpm typecheck` exit 0 sin errores. `grep -rnE ": any\b|as any|@ts-ignore|@ts-nocheck" src tests/unit tests/e2e` sin coincidencias salvo justificación documentada |
| F2-06 | Alias `@/*` → `src/*` en app | `grep -n '"@/\*"' tsconfig.json`; `pnpm typecheck`; `pnpm build` | `paths: {"@/*": ["./src/*"]}` (con `baseUrl` o rutas relativas válidas); typecheck y build correctos |
| F2-07 | Alias `@/` en Vitest | `pnpm test:unit` ejecuta `tests/unit/independent/home-page.test.tsx` (importa `@/app/page`) | Exit 0; la prueba aparece en el informe como pasada, no omitida |
| F2-08 | Lint sin errores ni warnings | `pnpm lint` (el script debe usar `--max-warnings=0`; si no, verificar con `pnpm exec eslint . --max-warnings=0`) | Exit 0; salida sin "warning" ni "error"; ESLint 9 flat config con `eslint-config-next` y `eslint-config-prettier`; `node_modules`, `.next` ignorados |
| F2-09 | Formato | `pnpm format:check` (`prettier --check .`) | Exit 0; `.prettierignore` excluye `pnpm-lock.yaml`, `.next`, `node_modules`, `test-results`, `playwright-report`; no excluye código fuente ni tests para esquivar el chequeo |
| F2-10 | Pruebas unitarias | `pnpm test:unit` | Exit 0; al menos 1 prueba de Develop significativa (no `expect(true)`) más las 2 independientes; 0 omitidas/todo; modo no interactivo (`vitest run`) |
| F2-11 | Pruebas E2E | `pnpm test:e2e` (la primera vez requiere Chromium: `pnpm exec playwright install chromium`, descarga autorizada) | Exit 0; ejecuta `tests/e2e/independent/home.spec.ts` (7 casos) y al menos una E2E de Develop en `tests/e2e/`; 0 omitidas; `webServer` arranca la app por sí mismo (build + start o dev) y `reuseExistingServer` no oculta fallos en CI |
| F2-12 | Build de producción | `pnpm build` | Exit 0; sin errores de tipo ni de lint bloqueantes; sin avisos de fuentes remotas; `.next` generado y no versionado |
| F2-13 | `pnpm start` sirve la página | `pnpm build && pnpm start` (puerto fijo), `curl -s -o /dev/null -w "%{http_code}" http://localhost:<puerto>/`; luego detener el proceso | 200; HTML con `<html lang="es"`, `<title>` con Nexovantis y un `<h1>` |
| F2-14 | `pnpm dev` sirve la página | `pnpm dev` en segundo plano, `curl` a `/`, detener el proceso | 200 con el mismo contenido; el proceso se detiene y no deja puertos ocupados |
| F2-15 | Estructura requerida | `ls -d src/app src/features src/components src/lib tests/unit tests/e2e` | Todos existen y son directorios; carpetas vacías con `.gitkeep` o contenido real; sin carpetas de módulos de negocio con código ficticio |
| F2-16 | Página inicial mínima | Revisar `src/app/page.tsx`, `src/app/layout.tsx`; pruebas independientes | `lang="es"`, `metadata.title` con Nexovantis, un único h1 "Nexovantis"; sin `<button>`, sin `<a>`/`Link` a módulos inexistentes, sin tarjetas/menús/tablas ni datos simulados (PRD: "No mostrar botones o módulos ficticios") |
| F2-17 | Sin desbordamiento horizontal (T10) | `pnpm test:e2e` (casos 320, 390, 768, 1280) | `scrollWidth <= clientWidth` en los cuatro viewports |
| F2-18 | Foco visible (T10) | Si la página tiene elementos enfocables: recorrido con Tab y revisión de CSS (`outline` no eliminado sin sustituto, contraste del indicador 3:1). Si no hay ninguno | Sin `outline: none`/`outline-none` global sin sustituto visible. Si no hay elementos enfocables: "No aplicable" registrado en POST con la evidencia (`queryAllByRole` de botones/enlaces vacío) |
| F2-19 | Idioma y título (T10 Documento) | Pruebas E2E independientes | `html[lang="es"]` y título con Nexovantis |
| F2-20 | Sin recursos remotos ni fuentes de Google | `grep -rnE "next/font/google|fonts\.googleapis|fonts\.gstatic|https?://" src next.config.ts` y revisión del HTML servido (`curl` a `/`) | Sin `next/font/google`; sin URLs externas en `src` (salvo comentarios sin efecto o `http://www.w3.org/2000/svg` en SVG inline, justificados); HTML servido sin `<link>`/`<script>` a hosts externos |
| F2-21 | Telemetría desactivada | Revisar `playwright.config.ts` (`webServer.env`), `.github/workflows/ci.yml` y README; `grep -rn "next telemetry" .` | `NEXT_TELEMETRY_DISABLED=1` presente en `webServer` y en CI (nivel `env` del job o workflow); README lo indica; no hay llamada a `next telemetry disable` |
| F2-22 | CI coherente | Leer `.github/workflows/ci.yml`; extraer cada `run:` y ejecutarlo localmente | Cada `run:` es `pnpm <script>` existente o un paso de instalación/Playwright; cada uno ejecutado localmente con exit 0 en el mismo orden (`install --frozen-lockfile`, `lint`, `typecheck`, `format:check`, `test:unit`, `build`, `test:e2e`); ningún paso con `continue-on-error: true`; ningún `run:` que no exista en `package.json` |
| F2-23 | CI mínimo privilegio y Node 24 | Inspección del YAML | `permissions: contents: read` a nivel workflow; Node 24 (`node-version: 24` o `.nvmrc`/`engines` coherente); pnpm instalado con versión coherente con `packageManager`; `pnpm install --frozen-lockfile`; triggers `push` y `pull_request` sin `pull_request_target`; acciones sin `@main`/`@master` (versión fija); sin secretos ni `secrets.*` |
| F2-24 | Sin secretos | `git ls-files` (más los nuevos con `git status --porcelain -uall`) y `grep -rIEn "(sk_live|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN [A-Z ]*PRIVATE KEY|service_role|SUPABASE_[A-Z_]*=|password\s*=)" --exclude-dir=node_modules --exclude-dir=.next --exclude=pnpm-lock.yaml .` | Sin coincidencias reales. No hay `.env*` nuevos (`git status --porcelain -uall \| grep -E "\.env"` vacío salvo `.env.example` sin modificar) |
| F2-25 | Higiene de artefactos | `git check-ignore node_modules .next test-results playwright-report next-env.d.ts` y `git status --porcelain -uall` | Los cinco ignorados; ningún artefacto generado aparece como nuevo en estado Git |
| F2-26 | README verificado | Leer `README.md` y ejecutar literalmente cada comando documentado de instalación, desarrollo, calidad y pruebas | Cada comando existe y funciona tal como está escrito (mismos nombres de script y puerto); versiones de Node/pnpm declaradas coinciden con el entorno; sin comandos aspiracionales (p. ej. despliegue, Supabase) ni afirmaciones de resultados no ejecutados |
| F2-27 | Integración: no se presenta ausencia de pruebas como evidencia | Ver F2-27 detallado abajo | Estado "no aplicable / pendiente F3" en POST, nunca PASS |
| F2-28 | Tailwind operativo | `grep -n "tailwindcss" src/app/*.css postcss.config.mjs`; `pnpm build` | `@import "tailwindcss"` en el CSS global importado por el layout; `@tailwindcss/postcss` en PostCSS; build exit 0 |
| F2-29 | Pruebas no debilitadas | `git diff --name-only HEAD`, `git status --porcelain -uall`; `grep -rnE "\.skip|\.only|\.todo|\bxit\b|\bxtest\b|\bxdescribe\b|test\.fixme|\.fixme|it\.fails|passWithNoTests|retries:\s*[1-9]" tests playwright.config.ts vitest.config.mts package.json` | Sin coincidencias (retries en CI solo si declarados y justificados); `tests/e2e/independent/**`, `tests/unit/independent/**` y `tests/acceptance/**` solo con los archivos de Testing, byte a byte iguales a los de PRE (verificar con `git hash-object` contra el valor registrado abajo) |
| F2-30 | Alcance cerrado | `git diff --name-only HEAD` + `git ls-files --others --exclude-standard` comparado con la lista permitida de TASK-004 | Ningún archivo fuera de la lista: nada en `.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/**` (salvo `docs/ARCHITECTURE.md`), `docs/reviews/**`, `supabase/**`, `public/**`, `.env*`, `.gitattributes`; `.gitignore` solo con añadidos; diff de `docs/ARCHITECTURE.md` limitado a stack/estructura sin cambiar decisiones. Fuera de lista = High |
| F2-31 | Sin funcionalidad fuera de alcance | `grep -rliE "supabase|auth|login|signin|inventario|presupuesto|cliente|orden" src` y `grep -nE "supabase|@supabase" package.json` | Sin dependencias ni código de Supabase/autenticación/negocio; sin axe-core ni umbral de cobertura (no aprobados); sin acceso a red en tiempo de ejecución |
| F2-32 | Sin operaciones prohibidas | `git log --oneline -1`, `git stash list`, `git diff --cached --name-only` | HEAD sigue en `86611a8…`; índice vacío; ningún commit, push ni merge realizados por Develop |
| F2-33 | Dependencias justificadas | Revisar `package.json` | Solo las dependencias de la tabla del contrato (más las transitivas necesarias); cada adicional justificada en README o ARCHITECTURE; sin paquetes no aprobados (axe-core, cobertura, ORMs, UI kits) |

### F2-27 Integración (`test:integration`)
Decisión de Testing: no hay base de datos hasta F3, por lo que no existe ninguna prueba de integración real posible en F2 y los mocks no son evidencia (TESTING_GUIDELINES).
- Preferido: no definir el script en F2 y documentar en README "`test:integration`: pendiente de F3 (requiere BD de pruebas)". Si se define, debe imprimir un mensaje explícito de no aplicable y no ser un `vitest run --passWithNoTests` ni un alias de `test:unit`.
- `test:integration` no puede estar en `ci.yml` ni citarse en README como superado.
- En POST se registra como "no aplicable en F2 / validación efectiva pendiente (F3)", fuera del cómputo de aprobados. No bloquea F2 ni cuenta como PASS; el criterio de TESTING_GUIDELINES "scripts objetivo desde F2" se cumple parcialmente por decisión documentada, y esa decisión debe aceptarla el humano en la puerta de F2 (hallazgo Informational).
- Es hallazgo (Medium, FAIL por criterio) si se define con `--passWithNoTests`, si ejecuta `tests/unit` renombrado o si el README/CI lo presentan como verificación superada.

## Casos negativos y regresiones
- F2-16 (sin botones/enlaces) tiene comprobación unitaria y estática; el 404 de ruta inexistente (E2E) cubre que no existan rutas fantasma.
- F2-29 y F2-30 garantizan que no se relajaron pruebas ni se escribió fuera de lista.
- F2-31 garantiza que no hay auth/Supabase/negocio.
- Regresión: tras cualquier corrección de Develop, repetir F2-01 a F2-14, F2-22 y F2-29/30.

## Pruebas independientes entregadas (hashes de PRE)
Cualquier cambio posterior de estas rutas por Develop es High.

| Archivo | Casos |
|---|---|
| `tests/e2e/independent/home.spec.ts` (`git hash-object` 17e0099e5683c94a99419111b099fa76849cf5c0) | 7: 200 + `lang="es"` + título + un h1 (1); sin errores de consola (1); sin desbordamiento a 320/390/768/1280 (4); 404 en ruta inexistente (1) |
| `tests/unit/independent/home-page.test.tsx` (`git hash-object` a94744e0f604d9e51e34b7628526857dac039d58) | 2: h1 único accesible "Nexovantis"; sin botones ni enlaces |

Supuestos de las pruebas (si Develop los considera incorrectos, procedimiento de TESTING_GUIDELINES vía Orchestrator):
- La prueba E2E de consola espera cero `console.error` y `pageerror` con `networkidle`; en `next start` (producción) no debe haber errores; en `next dev` pueden aparecer avisos de desarrollo, por lo que el `webServer` debería usar build + start.
- El 404 se comprueba con una ruta cualquiera (`/ruta-que-no-existe-f2`); Next devuelve 404 con su página por defecto.
- La prueba unitaria usa `// @vitest-environment jsdom` y llama a `cleanup()` explícitamente, de modo que funciona con o sin `globals: true`; requiere el setup de jest-dom (`toBeInTheDocument`, `toHaveTextContent`).

## Reproducción del fallo previo (estático)
- `ls package.json tests` → no existen (antes de F2): no hay runner ni scripts; las pruebas independientes no pueden ejecutarse. Es el estado esperado, no un defecto.

## Estado Git
- Antes: HEAD `86611a8…`; árbol con cambios de F1 sin commit y `docs/reviews/**` sin seguimiento; índice vacío; sin `tests/` ni `.github/workflows/`.
- Después: ver mensaje de retorno (se registra al cerrar la fase). Archivos añadidos por esta fase: `docs/reviews/claude/TASK-004-PRE.md`, `tests/e2e/independent/home.spec.ts`, `tests/unit/independent/home-page.test.tsx` (todos `??`).

## Checks no ejecutados
Todos los F2-xx (no hay scaffold). Las dos pruebas independientes no se han ejecutado ni compilado: no hay evidencia de que pasen; su validez es estática.
