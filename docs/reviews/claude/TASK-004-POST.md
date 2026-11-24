# TASK-004-POST — Verificación independiente de F2 (Next.js Foundation)

- TASK-ID: TASK-004. Fase: POST. Fecha: 2026-11-24.
- Modelo/esfuerzo solicitado: Sonnet 5.5 (Testing). Efectivo: autoinformado como Sonnet 5.5 (`claude-sonnet-5-5`), no verificado por CLI; esfuerzo no verificable.
- Rama `chore/project-foundation`, HEAD `86611a8fc62dcf1c8a34af18a817fac55368ae91` (sin cambios; ningún commit). Índice vacío. Sin diff final de commit (árbol de trabajo).
- Entorno: Windows 11, Node 24.22.2, pnpm 12.16.1, Playwright Chromium en caché local, `NEXT_TELEMETRY_DISABLED=1`. Sin accesos remotos (la copia limpia se instaló con `--offline`).

## Veredicto: PASS

Todos los criterios aplicables F2-01..F2-33 se ejecutaron o inspeccionaron y se cumplen; no hay hallazgos Critical/High. Quedan 3 hallazgos Informational/Low que requieren aceptación humana registrada (ver "Hallazgos") y 2 validaciones pendientes por naturaleza (CI en GitHub; `test:integration` en F3).

## Estado Git
- Antes: HEAD `86611a8…`; `git diff --cached` vacío; 57 entradas en `git status --porcelain -uall` (los `M` de F1; los `??` de F2 listados abajo).
- Después: idéntico (57 entradas, mismo HEAD, índice vacío). Mis únicos cambios: `docs/reviews/claude/TASK-004-POST.md` (nuevo). No añadí pruebas independientes.
- Archivos F2 (`??`): `.gitattributes` (F1), `.github/workflows/ci.yml`, `.prettierignore`, `eslint.config.mjs`, `next.config.ts`, `package.json`, `playwright.config.ts`, `pnpm-lock.yaml`, `postcss.config.mjs`, `prettier.config.mjs`, `tsconfig.json`, `vitest.config.mts`, `src/app/{globals.css,icon.svg,layout.tsx,page.tsx}`, `src/{components,features,lib}/README.md`, `tests/e2e/home-smoke.spec.ts`, `tests/support/vitest.setup.ts`, `tests/unit/app-shell.test.tsx`, más mis `tests/**/independent/**` y `docs/reviews/**`. Modificados en F2: `README.md`, `docs/ARCHITECTURE.md` (además de los M de F1).
- Hashes (`git hash-object`): AGENTS.md `bdf3e1071c552f90f5fadedb4bd2fb4dcf16fe83` y CLAUDE.md `474571379662a95c7de7a64540851213c5fdbb00`, iguales al inicio, tras `pnpm test:e2e`, tras `pnpm dev` (puerto 3300, `GET / 200`) y al final. El mtime de AGENTS.md es posterior (consecuencia de ORC4-01), pero el contenido coincide con el valor previo.
- Independientes: `tests/e2e/independent/home.spec.ts` 17e0099e5683c94a99419111b099fa76849cf5c0 y `tests/unit/independent/home-page.test.tsx` a94744e0f604d9e51e34b7628526857dac039d58: sin cambios.
- Artefactos generados (`node_modules`, `.next`, `test-results`, `next-env.d.ts`, `*.tsbuildinfo`; `playwright-report` por regla del contrato) ignorados; ninguno aparece en estado Git. Sin servidores residuales en 3000/3100/3200/3300.

## Comandos ejecutados (repo, raíz)
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | Lockfile al día; hash de `pnpm-lock.yaml` sin variación |
| `pnpm format:check` | 0 | "All matched files use Prettier code style" |
| `pnpm lint` (`eslint . --max-warnings=0`) | 0 | Sin salida |
| `pnpm typecheck` (`next typegen && tsc --noEmit`) | 0 | Tipos generados, sin errores |
| `pnpm test:unit` (`vitest run`) | 0 | 2 archivos, 4/4 pasan (2 independientes + 2 de Develop), 0 omitidas |
| `pnpm build` | 0 | Turbopack; rutas `/`, `/_not-found`, `/icon.svg` estáticas |
| `pnpm test:e2e` | 0 | 9/9 (7 independientes + 2 de Develop); el webServer ejecutó build + start |
| `CI=1 pnpm test:e2e` (copia limpia) | 0 | 9/9 con `reuseExistingServer` desactivado, `forbidOnly`, reporter github+html |
| `pnpm start --port 3200` + `curl /` | - | HTTP 200; `<html lang="es">`, `<title>Nexovantis</title>`, un `<h1>`; sin hosts externos en el HTML. Proceso detenido |
| `pnpm dev --port 3300` + `curl /` | - | HTTP 200, mismo contenido; proceso detenido y puerto libre; hashes AGENTS/CLAUDE intactos |

### F2-01: instalación desde cero sin borrar nada
Copia de 43 archivos versionables (`git ls-files` + `--others --exclude-standard`, sin `settings.local.json` ni `docs/reviews`) a `/tmp/tmp.vtD7CFkljx` (Windows: `%TEMP%\tmp.vtD7CFkljx`; no borrado). Allí:
`pnpm install --frozen-lockfile --offline` exit 0 (428 paquetes, 0 descargas); `format:check` 0; `lint` 0; `typecheck` 0; `test:unit` 0 (4/4); `build` 0; `test:e2e` 0 (9/9); `CI=1 test:e2e` 0 (9/9).
Mutación en la copia (título cambiado a "Otro" y texto "fundación técnica" eliminado): las 2 pruebas de Develop fallan (exit 1, 2 failed | 2 passed). Confirma que la prueba unitaria de Develop es significativa. (Las independientes siguieron pasando: no dependen de esas cadenas; esperado.)

## Tabla de criterios
| ID | Resultado | Evidencia |
|---|---|---|
| F2-01 | PASS | Copia limpia: install frozen exit 0 y toda la secuencia exit 0 (arriba). Matiz: se instaló con `--offline`, así que la reproducibilidad con red real no se ha probado; el lockfile no cambió |
| F2-02 | PASS | `pnpm-lock.yaml` existe; sin `package-lock.json`/`yarn.lock`; `packageManager: pnpm@12.16.1`, `engines.node >=24.0.0` |
| F2-03 | PASS | `pnpm list --depth 0`: las 21 versiones coinciden exactamente con la tabla del contrato; `package.json` las fija sin rangos |
| F2-04 | PASS | Existen dev, build, start, lint, typecheck, format:check, test:unit, test:e2e y format |
| F2-05 | PASS | `strict: true`, sin `any`/`@ts-ignore`/`@ts-nocheck` en `src`, `tests/unit`, `tests/e2e` (grep vacío); typecheck exit 0 |
| F2-06 | PASS | `paths: {"@/*": ["./src/*"]}`; typecheck y build exit 0. Matiz: sin `baseUrl`, válido con TS 6 y `moduleResolution: bundler` (typecheck y build lo confirman) |
| F2-07 | PASS | Reporter verbose: `home-page.test.tsx` (2 casos, importa `@/app/page`) y `app-shell.test.tsx` pasan |
| F2-08 | PASS | `eslint . --max-warnings=0` exit 0; flat config con `eslint-config-next` core-web-vitals + typescript y `eslint-config-prettier/flat`; ignora `.next` y `next-env.d.ts` (node_modules ignorado por defecto en ESLint 9) |
| F2-09 | PASS con hallazgo F2P-01 | `format:check` exit 0, pero acotado (no es `prettier --check .`). `prettier --check .` falla solo en 31 archivos de documentación/agentes (`docs/**`, `.claude/agents/*`, `AGENTS.md`, `CLAUDE.md`), ninguno de código o tests. `.prettierignore` solo excluye artefactos y el lockfile. Dictamen abajo |
| F2-10 | PASS | `vitest run`, 4 pruebas, 0 omitidas; la de Develop supera la mutación |
| F2-11 | PASS | 9/9; independiente de 7 casos + 2 de Develop; `webServer` hace build + start; `reuseExistingServer: !CI`; sin `retries` |
| F2-12 | PASS | `pnpm build` exit 0; sin avisos de fuentes; `.next` ignorado |
| F2-13 | PASS | `pnpm start`: 200, `lang="es"`, título, `<h1>` |
| F2-14 | PASS | `pnpm dev`: 200 con el mismo contenido; proceso detenido; puerto libre |
| F2-15 | PASS | `src/app`, `src/features`, `src/components`, `src/lib`, `tests/unit`, `tests/e2e` existen; las tres carpetas de módulos con README, sin código ficticio |
| F2-16 | PASS | `lang="es"`, `metadata.title` "Nexovantis", un h1; sin botones ni enlaces ni tarjetas/menús (unitaria independiente + E2E de Develop con `toHaveCount(0)`) |
| F2-17 | PASS | 4 casos independientes (320, 390, 768, 1280) pasan, también con `CI=1` |
| F2-18 | No aplicable | La página no tiene elementos enfocables (botones/enlaces = 0 por prueba independiente y E2E de Develop). `globals.css` no contiene `outline`. Se deberá volver a comprobar cuando existan controles |
| F2-19 | PASS | E2E independiente `html[lang="es"]` y título |
| F2-20 | PASS | Sin `next/font/google` ni fuentes remotas; única URL en `src` es `xmlns="http://www.w3.org/2000/svg"` de `icon.svg` (justificada); HTML servido solo con rutas `/_next/…` propias; fuentes del sistema |
| F2-21 | PASS | `NEXT_TELEMETRY_DISABLED=1` en `webServer.env` y en `env` del workflow; README lo indica; ningún `next telemetry disable` |
| F2-22 | PASS | Cada `run:` ejecutado localmente con exit 0 (excepto instalación de Chromium y `--with-deps`, no ejecutados: ver pendientes). Todos son `pnpm <script>` existente o paso de instalación; sin `continue-on-error`. Orden: format:check antes de lint/typecheck (el criterio PRE enumeraba otro orden; sin impacto, el README documenta el real) |
| F2-23 | PASS estático | `permissions: contents: read`; Node 24; triggers `push` y `pull_request`; sin `pull_request_target`; sin secretos; `pnpm install --frozen-lockfile`; `pnpm/action-setup@v4` sin `version` (lee `packageManager`); acciones con versión mayor fija (`@v4`, `@v5`), ninguna `@main`/`@master`. Existencia/compatibilidad de esas versiones y de pnpm 12 con la acción: no verificable sin acceso remoto (F2P-02) |
| F2-24 | PASS | grep sin coincidencias en código/config/README; únicas coincidencias: `.env.example` (claves vacías, F1, sin modificar) y texto de `.claude/agents/develop.md` (F1). Sin `.env*` nuevos |
| F2-25 | PASS | `check-ignore` confirma `node_modules`, `.next`, `test-results`, `next-env.d.ts` (y `*.tsbuildinfo`); `playwright-report/` ignorado por la regla `.gitignore:11` (`git check-ignore -v playwright-report/index.html`; el directorio no existe en local porque el reporter local es `list`, así que `check-ignore` del nombre sin barra no devuelve nada); ningún artefacto en el estado Git |
| F2-26 | PASS parcial | Ejecutados literalmente: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm start`, `pnpm dev` (con `--port 3300` en lugar del 3000 por defecto), `lint`, `typecheck`, `format:check`, `test:unit`, `test:e2e`. No ejecutados: `pnpm exec playwright install chromium` (puede descargar) y `pnpm format` (reescribe). Versiones Node/pnpm coinciden. Sin comandos aspiracionales; `test:integration` descrita como pendiente de F3. El enlace a `docs/DEPLOYMENT.md` resuelve |
| F2-27 | No aplicable (pendiente F3) | No existe `test:integration`, ni en `package.json` ni en CI; README lo declara pendiente. Fuera del cómputo de aprobados. Requiere aceptación humana (F2P-03) |
| F2-28 | PASS | `@import 'tailwindcss'` en `globals.css` importado por `layout.tsx`; `@tailwindcss/postcss` en PostCSS; el HTML servido usa clases Tailwind compiladas (CSS enlazado); build exit 0 |
| F2-29 | PASS | grep de `.skip/.only/.todo/xit/xtest/fixme/passWithNoTests/retries` sin coincidencias; hashes de independientes sin cambios; `tests/acceptance/**` no existe |
| F2-30 | PASS | Ningún archivo nuevo fuera de la lista. `.claude/**`, CLAUDE.md, AGENTS.md (hash restaurado), `docs/**` solo con los M de F1 y `docs/ARCHITECTURE.md` (añade la sección "Stack verificado (F2)" y estructura; no cambia decisiones; el párrafo de pendientes es de F1). No hay `public/`, `supabase/`, `.env*` nuevos. `.gitignore` solo con añadidos. Matiz: no se puede aislar con diff qué parte de los M de F1 tocó Develop; la verificación se apoya en los hashes de AGENTS/CLAUDE y en la lista de cambios por mtime (solo archivos permitidos de F2, salvo AGENTS.md por ORC4-01) |
| F2-31 | PASS | Solo coincidencias textuales en dos README ("clientes", "órdenes de trabajo"); sin dependencias de Supabase, axe-core ni cobertura; sin red en runtime |
| F2-32 | PASS | HEAD `86611a8…`, `git stash list` vacío, índice vacío |
| F2-33 | PASS | `package.json` contiene exactamente las 21 dependencias del contrato; sin paquetes extra |

## Dictamen sobre el alcance de Prettier (decisión de Orchestrator)
F2-09 pedía `prettier --check .` sin excluir código ni tests. El alcance real (`src tests .github README.md "*.{json,mjs,mts,ts}"`) cubre todo el código, las pruebas, la configuración raíz, el CI y el README. Lo único no comprobado son Markdown de `docs/`, `.claude/agents/` y AGENTS.md/CLAUDE.md, que están prohibidos o fuera de alcance, y que incumplen el estilo por razones preexistentes. No se oculta ningún código ni test: ACEPTABLE. Riesgo residual: un directorio nuevo en la raíz (p. ej. `supabase/`, `scripts/`) quedaría fuera del chequeo hasta que se añada a los scripts (Low, F2P-01).

## Hallazgos
| ID | Gravedad | Archivo | Descripción / reproducción | Estado |
|---|---|---|---|---|
| F2P-01 | Low | `package.json` (scripts `format`, `format:check`) | El chequeo de formato usa lista blanca de rutas en vez de `.`. Reproducción: `pnpm exec prettier --check .` falla en 31 archivos de docs/agentes; nuevas carpetas de código no se verificarían automáticamente. Esperado (F2-09): `prettier --check .`. Obtenido: alcance acotado por decisión de Orchestrator por restricciones de alcance. Sugerencia: añadir carpetas nuevas a los scripts o un ADR | Abierto: requiere aceptación humana registrada |
| F2P-02 | Informational | `.github/workflows/ci.yml` | El workflow nunca se ha ejecutado en GitHub. Versiones de `actions/checkout@v5`, `actions/setup-node@v5`, `pnpm/action-setup@v4`, `actions/upload-artifact@v4` y soporte de pnpm 12 por `pnpm/action-setup@v4` no verificables sin acceso remoto; `--with-deps` de Playwright (apt en `ubuntu-latest`) no ejecutado | Pendiente de validación efectiva (primer push autorizado) |
| F2P-03 | Informational | `package.json`, README | `test:integration` no existe en F2 (decisión documentada en PRE: sin base de datos hasta F3). Cumplimiento parcial de "scripts objetivo desde F2" de TESTING_GUIDELINES | Abierto: requiere aceptación humana en la puerta de F2 |
| ORC4-01 | High (detectado por Orchestrator) | `next.config.ts`, AGENTS.md | `next dev` añadía un bloque a AGENTS.md. Verificado cerrado: `agentRules: false` presente; ejecuté `pnpm dev` y el hash de AGENTS.md (`bdf3e10…`) y de CLAUDE.md (`4745713…`) no cambió antes ni después | Cerrado (verificado). Nota: `agentRules` es un ajuste de Next 16.4.6; si otra versión lo ignorara el bloque reaparecería: el hash debe seguir comprobándose tras cada `next dev` |

Observaciones sin gravedad: README indica `http://localhost:3000` para `pnpm dev` (puerto por defecto de Next; verificado en 3300, no en 3000); `typecheck` ejecuta `next typegen`, que regenera tipos en `.next` (ignorado).

## Separación de validación
- Estática: configuración, CI, README, versiones, greps, estructura, hashes, alcance.
- Efectiva (ejecutada): toda la secuencia de CI en el repo y en copia limpia (exit 0), `CI=1` E2E, `pnpm start`/`pnpm dev` con `curl`, mutación de la prueba unitaria.
- Efectiva pendiente: ejecución del workflow en GitHub (incl. versiones de acciones y `playwright install --with-deps`), `pnpm exec playwright install chromium` (no ejecutado: puede descargar), instalación con red y desde caché de pnpm vacía, `test:integration` (F3), foco visible cuando existan controles.

## Pruebas añadidas por Testing
Ninguna en esta fase.
