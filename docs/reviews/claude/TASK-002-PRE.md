# TASK-002-PRE — Criterios de aceptación y contrato para Develop

Foundation hardening & multi-agent governance. Informe de Testing, fase PRE. Los criterios son verificables y no reducen ninguno de los criterios aprobados previos.

## 1. Cabecera

| Campo | Valor |
|---|---|
| TASK-ID / Fase | TASK-002 / PRE |
| Fecha | 2026-11-24 |
| Rama / SHA inicial | `chore/project-foundation` / `86611a8fc62dcf1c8a34af18a817fac55368ae91` |
| Estado Git al empezar | único cambio sin rastrear: `docs/reviews/claude/TASK-001.md` |
| Agente / modelo | Testing (subagente nativo). Modelo `claude-sonnet-5-5` (Sonnet 5.5), **autoinformado** |
| Esfuerzo | Solicitado `high` (frontmatter). **No verificable desde dentro** de la sesión |
| Herramientas efectivas (autoinformadas) | Read, Glob, Grep, Edit, Write, Bash (Git Bash). Sin PowerShell ni herramientas MCP invocables en la lista. El prompt de sistema sí contiene un bloque de "instrucciones de servidores MCP" (evidencia directa de TST-09: texto heredado, herramientas no invocables) |
| Entorno | Windows 11, Claude Code 2.1.327, Node 24.22.2, Git 2.56.0.windows.4, `core.autocrlf=true`, sin dependencias instaladas |
| Hecho de partida | Los hechos de documentación oficial (permisos, MCP, subagentes) los aporta Orchestrator; Testing no tiene red y **no los ha verificado de forma independiente**. Donde dependo de ellos lo indico |
| Archivos escritos | solo este informe. Scripts de ensayo en el directorio temporal de sesión, fuera del repositorio |
| Hash base (solo lectura) | `docs/reviews/claude/TASK-001.md` sha256 `57ddf6253cd62b50ef73925f476f2425028a4904a614f468f3f9623662d7fadb`; `docs/CHALLENGE.md` sha256 `502379b17d4fe2ebc6cc89d2afe1d91b1e2a2ef3dbb06a4cca8039781bb696d2` (working tree, CRLF) |
| Metadatos globales (solo `stat`, sin leer contenido) | `~/.claude/settings.json`: mtime `2026-11-18 18:15:17 +0100`, 458 bytes. No existen `~/.claude/settings.local.json`, `~/.claude/CLAUDE.md` ni `~/.claude/agents` |

### Línea base reproducida (estado "rojo" antes de Develop)

Ejecutado en solo lectura sobre el repositorio actual (exit codes reales):

- `node check-settings.js .claude/settings.json` (Apéndice A) devuelve **exit 1, 21 comprobaciones fallidas**. Entre ellas: `.env`, `.env.development.local`, `supabase/.env`, `.vercel/**`, `secrets/**`, `*.pem` no están protegidos para Read; ninguna regla Edit; ningún deny Bash/PowerShell para push, reset --hard, clean, rm recursivo, Supabase remoto; ningún deny MCP; sin `disableBypassPermissionsMode`. Esto reproduce TST-13 y TST-14 con evidencia ejecutable, no solo por lectura.
- Cobertura de `.gitignore` (`git check-ignore`) sobre rutas ficticias: **12 rutas que deberían ignorarse no lo están** (`secrets/key.json`, `.secrets/k`, `foo.pfx`, `foo.p12`, `id_rsa`, `id_ed25519`, `service-account.json`, `credentials.json`, `.claude/agent-memory/x.md`, `.claude/worktrees/a/b`, `CLAUDE.local.md`, `db.dump`). Ninguna ruta que deba rastrearse está ignorada (OK). Reproduce TST-15.
- `grep -rnP '(?<![\w.])/agents(?![\w/])'` encuentra `/agents` como comando en `CLAUDE.md:20` y `docs/AGENT_WORKFLOW.md:7` (además de menciones históricas en TASK-001.md, excluido).
- `git ls-files --eol`: los 20 archivos rastreados están en el índice como `i/lf` y en el working tree como `w/crlf`; no hay `.gitattributes`. Reproduce TST-18.
- `git check-attr -a .gitattributes README.md` devuelve vacío (exit 0): no hay atributos.
- Los comandos interactivos de Claude Code (`/permissions`, `/status`, `/mcp`, `/context`, `/tasks`) no se pueden ejecutar desde un subagente; son del humano.
- Las comprobaciones B.1, B.5 y B.6 del Apéndice B se ensayaron sobre la línea base: B.1 sin claves ni duplicados anómalos (hoy sin `$schema`: `undefined`), B.5 con 0 enlaces rotos, B.6 sin ausencias.

---

## 2. Clasificación de hallazgos previos

Clases: **(a)** corrección con efecto sobre configuración o contrato, necesaria antes de G1; **(b)** corrección documental (texto) a entregar en TASK-002; **(c)** verificación en fase posterior (con fase y tarea futura); **(d)** limitación técnica de Claude Code (se documenta y se acepta o mitiga). Un hallazgo puede tener clase principal y residual. Las clases (a) y (b) se entregan en TASK-002 y su incumplimiento es FAIL. Los IDs de tareas futuras son propuestas de nombre; el ID definitivo lo asigna Orchestrator.

| ID | Grav. TASK-001 | Clase | Resolución esperada / tarea futura | AC |
|---|---|---|---|---|
| TST-01 | Alta | (a) + residual (d) | Protocolo Git antes/después de cada delegación, alcance de escritura cerrado por tarea y comprobación diff vs lista. Residual (d): no hay aislamiento técnico por ruta sin hooks; se acepta con la mitigación por diff. Hooks de frontmatter quedan como opción a decidir por el humano (DH-11), no obligatoria | A01, A02, A05, G01 |
| TST-13 | Alta | (a) + residual (d) | `deny`/`ask` para Bash (Git Bash) y PowerShell: Git remoto, merge, despliegue, comandos destructivos, BD remotas. Residual (d): no son frontera de seguridad (`/usr/bin/curl`, `sh -c`, `powershell -Command`) | B06, B07, B08, B13 |
| TST-14 | Alta | (a) + residual (d) | Deny Read/Edit con patrones concretos que no bloqueen `.env.example`. Residual (d): `grep -r`, scripts que abren archivos y Grep/Glob solo "best-effort" | B03, B04, B05, B11, B13 |
| TST-02 | Media | (a) | Tabla de propiedad de `tests/` por subdirectorio, coherente en develop.md, testing.md y TESTING_GUIDELINES.md | A03 |
| TST-03 | Media | (a) | Develop con denegación por defecto de `.claude/**`, CLAUDE.md, AGENTS.md, settings, directrices, criterios, CI y `tests/acceptance/**`, salvo lista de la tarea | A04, A06, E04 |
| TST-04 | Media | (b) + (c) F2/F3/F7 | Umbrales medibles de accesibilidad ahora (b). Automatización en F2 (tarea futura `F2-A11Y-HARNESS`), ejecución por UI en F3/F4 y regresión final F7. No se instala nada en TASK-002 | C10, C11 |
| TST-05 | Media | (b) + (c) F2 | Escala Critical/High/Medium/Low/Informational y regla de trazabilidad mínima (cada BR/criterio con al menos un caso positivo y uno negativo) ahora. Umbral numérico de cobertura: propuesta a aprobar por humano en F2 (`F2-ADR-COVERAGE`) | A08, C13 |
| TST-06 | Baja | (b) | Definición de evidencia válida de T01, un solo texto (compartido con TST-16) | C04 |
| TST-07 | Media | (b) + (c) F4/F6 | Criterios y casos de ACTIVITY/BR08 y del historial de órdenes ahora (b). Casos del historial en F4 (`F4-ORDER-EVENTS`); ACTIVITY P1 en F6 (`F6-ACTIVITY`) | C08 |
| TST-08 | Media | (b) + (c) F3/F4 + decisión humana | Casos de TEAM, archivado y cancelación y matriz de estados. Semántica ambigua: DH-01..DH-08, no la decide Develop. Casos ejecutables: TEAM/archivado en F3 (`F3-TEAM-CRM`), cancelación y transiciones en F4 (`F4-ORDER-STATES`) | C05..C07, C09 |
| TST-09 | Baja (Develop: media-alta) | (a) + residual (d) | `disableClaudeAiConnectors: true`, deny `mcp__*` y `disallowedTools` en ambos agentes, con mecanismos oficiales. Residual (d): el texto de instrucciones MCP puede seguir visible en el contexto; requiere reinicio y comprobación humana con `/mcp` y `/context`. Mi evaluación: **Media**, porque no he comprobado que sean invocables | B09, B10, B15 |
| TST-10 | Media | (a)/(b) | Directorios de evidencias (claude y codex con README), regla para tareas de solo lectura (Testing devuelve el informe en el mensaje y Orchestrator lo registra), nomenclatura | A11, D03 |
| TST-11 | Baja | (b) + (c) F2 | Hasta F2 la "reproducción del fallo previo" es una comprobación estática o manual registrada; el runner llega en F2 (`F2-TEST-HARNESS`). Se documenta | C14 |
| TST-12 | Media | (d) + (b) | El esfuerzo efectivo no es verificable desde dentro. Se documenta el procedimiento de comprobación humana (`/tasks`, `claude --debug`, variables de entorno, precedencia) y la gradación de evidencia (verificado por CLI / autoinformado / no verificable). Validación efectiva: humano (E-items) | C02, C15, B15 |
| TST-15 | Baja | (a) (higiene) | Ampliar `.gitignore` con credenciales genéricas, `.claude/agent-memory/` y similares | D01 |
| TST-16 | Media | (b) | Igual que TST-06 (misma resolución) | C04 |
| TST-17 | Info | (c) F3/F5 + registro (b) | Roles/permisos exactos (ADR en F3, `F3-ADR-ROLES`), IVA y redondeo (decisión humana y ADR antes de implementar en F5, `F5-ADR-IVA`). Ahora solo se registran como pendientes | C12 |
| TST-18 | Info | (a) (higiene) | `.gitattributes` coherente con `.editorconfig` (LF), sin renormalizar masivamente | D02 |
| D1 | — | (c) F3 | Docker, WSL y Supabase CLI no verificados: preflight del entorno local (`F3-PRE-ENV`), instalación decidida por el humano. Ahora solo se registra | C12, D06 |
| D2 | — | (b) + (d) | No exigir allowlist explícita. Develop documenta su decisión citando la documentación oficial. Si añade `allow`, solo comandos de solo lectura y sin banderas de escritura (p. ej. `git diff --output=`) | B02 |
| D3 | — | (d) | Testing y Develop comparten herramientas (`tools`). Mitigación: contrato por texto, protocolo Git y diff. La diferenciación técnica (hooks o `disallowedTools` con especificadores de ruta) solo si la documentación oficial lo confirma; decisión humana (DH-11) | A05, B10 |
| D4 | — | (c) F3 / F5-F6 | Revisar `GRANT`, `EXECUTE` de RPC y exposición PostgREST además de RLS (`F3-RLS-GRANTS`; RPC en `F5-RPC-HARDENING` y `F6`). Ahora solo se registra | C12 |
| D5 | — | (b) (cerrado) | Versión 2.1.327 ya verificada con `claude --version`; STATUS debe citarla como verificada | D04 |
| D6 | — | (b) | La plantilla incluye archivos modificados | A07 |
| `/agents` | — (Orchestrator) | (b) | Eliminar `/agents` como comando; documentar la verificación efectiva por otras vías | C01..C03 |

Notas de clasificación: no hay hallazgos clasificados fuera de TASK-002 salvo los (c). Ninguno se descarta. TST-09 lo mantengo en Media (Develop propone media-alta): sin evidencia de herramientas MCP invocables, el riesgo es contexto inflado y superficie potencial, no ejecución probada.

---

## 3. Alcance de escritura de Develop en TASK-002 (lista cerrada)

Autorización: la excepción E del humano, solo para TASK-002. Develop debe citar en su informe esta lista y la autorización recibida en el handoff. develop.md:18 le prohíbe editar `.claude/agents/`, CLAUDE.md, AGENTS.md y directrices: **Orchestrator debe incluir en el handoff la autorización humana literal** o Develop puede negarse con razón.

### 3.1 Modificar (existentes)

1. `.claude/settings.json`
2. `.claude/agents/develop.md`
3. `.claude/agents/testing.md`
4. `CLAUDE.md`
5. `AGENTS.md` (condicional: solo escala de gravedad, veredictos y ruta de evidencias Codex)
6. `docs/AGENT_WORKFLOW.md`
7. `docs/TESTING_GUIDELINES.md`
8. `docs/BUSINESS_RULES.md` (solo precisiones, sin cambio de semántica)
9. `docs/PRODUCT_REQUIREMENTS.md` (condicional, solo aditivo para TEAM/ACTIVITY)
10. `docs/ARCHITECTURE.md` (solo aditivo, apartado "Decisiones pendientes")
11. `docs/SECURITY.md`
12. `docs/ROADMAP.md`
13. `docs/STATUS.md`
14. `docs/reviews/TEMPLATE.md`
15. `.gitignore`

### 3.2 Crear (nuevos)

16. `.gitattributes`
17. `docs/reviews/claude/README.md`
18. `docs/reviews/codex/README.md`

Cada archivo de los puntos 1 a 14 que sea configuración de agentes o directriz exige **justificación individual** (archivo, líneas, hallazgo que resuelve, por qué es estrictamente necesario, confirmación de que no reduce criterios).

### 3.3 Prohibido (cualquier cambio es FAIL)

- `docs/CHALLENGE.md`, `docs/reviews/claude/TASK-001.md`, `docs/reviews/claude/TASK-002-PRE.md` y cualquier `docs/reviews/claude/TASK-002-POST*.md` / `RETEST*.md` (informes de Testing y Orchestrator)
- `src/`, `tests/` (no existe y no se crea), `supabase/`, `.github/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules/`, `.mcp.json`
- `.env*` de cualquier tipo (incluido `.env.example`, que debe permanecer idéntico; se puede leer), `.claude/settings.local.json`, `.editorconfig`, `README.md`, `docs/DEPLOYMENT.md`
- Configuración global o de otros proyectos: `~/.claude/**`, `~/.claude.json`, cualquier ruta fuera del repositorio
- Cualquier otro archivo no listado en 3.1/3.2
- Acciones: instalar dependencias o herramientas (Docker, WSL, Supabase CLI), `git add`/`commit`/`push`/`merge`/`checkout`/`reset`, `git add --renormalize`, conversión masiva de saltos de línea, red, MCP, Codex, declarar G1 aprobado, declararse PASS a sí mismo

### 3.4 Orden de trabajo obligatorio

`.claude/settings.json` y `.claude/agents/*.md` se recargan en caliente y las nuevas reglas pueden restringir al propio Develop o a sus comandos siguientes. Orden exigido: 1) documentos, `.gitignore`, `.gitattributes`, READMEs; 2) agentes; 3) `settings.json` el último, validando `JSON.parse` tras cada edición. Develop debe declarar el orden en su informe.

---

## 4. Decisiones humanas previas (a resolver por Orchestrator antes de invocar a Develop)

La precisión de transiciones no debe inventar semántica (BUSINESS_RULES: "Cualquier cambio de semántica requiere decisión humana"). Si no hay decisión, Develop **no decide**: registra el punto como "Pendiente de decisión humana (DH-xx)" con la lectura estricta del texto actual como valor por defecto y excluye ese punto de los casos de prueba ejecutables. Esto es un registro de pendientes, no una reducción de criterios.

| ID | Pregunta | Lectura estricta por defecto |
|---|---|---|
| DH-00 | ¿Las validaciones efectivas (E) forman parte del cierre de TASK-002 o son prerrequisitos de G1? | Prerrequisitos de G1 (ver sección 7). Si el humano decide lo contrario, el veredicto POST es BLOCKED hasta que las ejecute |
| DH-01 | Reasignar técnico en estado asignada o en curso; retroceso asignada → pendiente | No definido en BR03: se registra como pendiente. Solo transiciones hacia delante |
| DH-02 | Cancelar desde pendiente; ¿la cancelación exige motivo? | Cancelación permitida desde cualquier estado no terminal ("antes de completar"); motivo sin definir |
| DH-03 | Saltar estados (p. ej. pendiente → en curso) | No permitido (secuencia lineal) |
| DH-04 | Archivar técnico con órdenes abiertas asignadas | No definido; pendiente |
| DH-05 | Archivar cliente con órdenes abiertas | No definido; pendiente |
| DH-06 | Restaurar (desarchivar) cliente o técnico | No definido; pendiente |
| DH-07 | Editar campos descriptivos de una orden terminal | No definido; pendiente (BR03 solo fija el estado como terminal) |
| DH-08 | Conjunto mínimo de eventos ACTIVITY y actor en eventos del sistema/seed | Propuesta de Develop a aprobar por humano |
| DH-09 | Umbral numérico de cobertura | Propuesta, decisión en F2 |
| DH-10 | Política de `git add`/`commit` por agentes | `ask` (los agentes no commitean sin autorización) |
| DH-11 | Hooks de frontmatter para aplicación por ruta (opcional) | No incluir en TASK-002 |
| DH-12 | `deny` global `mcp__*` frente a por servidor (p. ej. Supabase MCP en F3) | Global ahora, relajación explícita por humano en su fase |

---

## 5. Criterios de aceptación verificables

Tipos de verificación: **S** estática, ejecutable por Testing con comandos de solo lectura; **P** efectiva parcial, ejecutada por Testing dentro del subagente con casos inocuos (sección 6); **E** efectiva que requiere humano o reinicio (no ejecutable por Testing). La definición de veredicto está en la sección 7. Los comandos largos están en el Apéndice B.

### Bloque G — Proceso y alcance de TASK-002

- **AC-G01 (S)** Todos los archivos modificados, staged o sin rastrear pertenecen a la lista cerrada 3.1/3.2 y a los informes de Testing/Orchestrator. Verif.: `git status --porcelain -uall` y `git diff --name-only HEAD`, comparados con la lista; cualquier ruta extra es FAIL.
- **AC-G02 (S)** No hay commits, staging ni cambio de rama. Verif.: `git rev-parse HEAD` igual a `86611a8f…`; `git diff --cached --name-only` vacío; `git branch --show-current` igual a `chore/project-foundation`.
- **AC-G03 (S)** Archivos prohibidos intactos. Verif.: `git diff --quiet HEAD -- docs/CHALLENGE.md` (exit 0) y `sha256sum` de CHALLENGE.md y TASK-001.md iguales a la cabecera; `TASK-002-PRE.md` sin modificar respecto a su hash entregado.
- **AC-G04 (S)** Sin dependencias ni scaffold. Verif.: no existen `package.json`, `pnpm-lock.yaml`, `node_modules`, `src`, `tests`, `supabase`, `.github`, `.mcp.json`; el informe de Develop no contiene comandos de instalación.
- **AC-G05 (S)** Informe de Develop completo: TASK-ID, archivos modificados, justificación individual por archivo de configuración/directriz (3.2), tabla de líneas eliminadas o reemplazadas con motivo, comandos exactos con exit code, orden de trabajo (3.4), herramientas disponibles en su sesión (autoinformadas), tests/checks no ejecutados y riesgos. Verif.: revisión del mensaje de Develop entregado por Orchestrator.
- **AC-G06 (S)** Sin secretos. Verif.: búsqueda de patrones de clave sobre el diff y archivos nuevos (Apéndice B.7); cero coincidencias. Las menciones en prosa de nombres como `service_role` no cuentan.

### Bloque A — Gobernanza

- **AC-A01 (S)** El protocolo de comprobación Git antes y después de **cada** delegación (a develop y a testing) está documentado en CLAUDE.md y docs/AGENT_WORKFLOW.md, con los comandos exactos: `git rev-parse HEAD`, `git status --porcelain -uall`, `git diff --name-only`, `git diff --cached --name-only`, además de una comprobación de ignorados sensibles (`git status --porcelain --ignored` acotado o `git ls-files --others --ignored --exclude-standard` filtrado a `.env*`/`secrets/`). Debe indicar qué comparar (modificados, staged, untracked, SHA), dónde registrar el resultado y que una diferencia fuera de la lista permitida es hallazgo High. Verif.: grep de cada comando en ambos documentos y revisión del texto.
- **AC-A02 (S)** El handoff exige "Archivos permitidos (lista cerrada)" y "Archivos prohibidos" por tarea, y establece que una escritura fuera de la lista se devuelve a Orchestrator. Verif.: grep en docs/AGENT_WORKFLOW.md, develop.md y testing.md.
- **AC-A03 (S)** Propiedad de `tests/` explícita **por subdirectorio** (`acceptance`, `unit`, `integration`, `e2e`, soporte/fixtures) y por tarea, sin contradicciones entre develop.md, testing.md y TESTING_GUIDELINES.md. Propuesta de referencia: `tests/acceptance/**` y `tests/**/independent/**` son de Testing; `tests/unit/**` es de Develop; `integration`/`e2e` los asigna el handoff (por defecto Develop, con casos independientes de Testing en `independent/`); `tests/support/**` es compartido y sus cambios se declaran en el handoff y los revisa Testing. Develop puede proponer otra tabla si es inequívoca. Verif.: lectura cruzada y grep de `tests/acceptance` en los tres archivos.
- **AC-A04 (S)** Develop no puede modificar, eliminar, saltar o debilitar pruebas independientes (`tests/acceptance/**` y casos de Testing) sin aprobación registrada. Debe haber procedimiento de petición vía Orchestrator hacia Testing, y Testing POST debe comprobar `git diff --name-only` contra esas rutas y buscar `.skip`, `.only`, `xit`, `xtest`, `todo` y aserciones relajadas. Verif.: grep y lectura en develop.md, testing.md, AGENT_WORKFLOW.md.
- **AC-A05 (S)** testing.md prohíbe a Testing modificar producción: `src/`, migraciones, `package.json` y lockfiles, CI, `.claude/**`, CLAUDE.md, AGENTS.md y documentación fuera de `docs/reviews/claude/` y `tests/**`. Se mantiene la frase de que las herramientas permiten escrituras más amplias y el límite se comprueba por diff. Verif.: grep.
- **AC-A06 (S)** develop.md pasa a denegación por defecto: sin lista de la tarea, no edita `.claude/**`, CLAUDE.md, AGENTS.md, `docs/TESTING_GUIDELINES.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/BUSINESS_RULES.md`, `docs/CHALLENGE.md`, `docs/SECURITY.md`, `docs/reviews/**`, `.github/workflows/**`, `.gitignore`/`.gitattributes`/`.editorconfig`, `tests/acceptance/**`. Verif.: grep de cada categoría en develop.md. Resuelve TST-03.
- **AC-A07 (S)** `docs/reviews/TEMPLATE.md` incluye los campos: TASK-ID; fase (PRE/POST/RETEST/AUDIT); fecha; agente, modelo y esfuerzo (solicitado, efectivo y fuente de verificación); rama; SHA base y SHA/diff final; estado Git antes y después; **archivos modificados** (con estado M/A/D/??); resumen de diff; entorno (SO y versiones); comandos con exit code y resultado; hallazgos (ID, gravedad, archivo/línea, reproducción, esperado, obtenido, criterio, estado); validación estática frente a efectiva; limitaciones y checks no ejecutados; veredicto; iteraciones; aceptación humana. testing.md "Informe" alineado. Verif.: grep de cada etiqueta.
- **AC-A08 (S)** Escala de gravedad exactamente Critical, High, Medium, Low, Informational, con definición medible y efecto sobre el veredicto, en TESTING_GUIDELINES.md y referenciada desde testing.md, TEMPLATE.md y AGENTS.md. Propuesta de efecto: Critical/High incumplen siempre (FAIL); Medium/Low/Informational fuera de criterios requieren aceptación humana explícita y registrada; incumplir un criterio aprobado es FAIL con independencia de la etiqueta. Verif.: grep de las cinco etiquetas y revisión de definiciones; no deben quedar escalas alternativas ("Alta/Media/Baja") en documentos normativos.
- **AC-A09 (S)** Eliminado el "PASS condicionado": los únicos veredictos son PASS, FAIL y BLOCKED. Verif.: `grep -rniE "PASS condicionad|conditional PASS|PASS parcial|PASS con (reserva|salvedad)|con reservas" --include=*.md . | grep -v 'docs/reviews/claude/'` sin resultados (TASK-001 y los informes TASK-002 lo citan como historia). Ensayado sobre la línea base: la expresión no da falsos positivos con "condicionadas" (README) ni con "PASS con evidencia insuficiente" (testing.md). TEMPLATE.md permite seleccionar solo uno de los tres.
- **AC-A10 (S)** Definición idéntica de PASS/FAIL/BLOCKED en testing.md, TESTING_GUIDELINES.md, AGENTS.md y TEMPLATE.md, incluida la regla de que BLOCKED por falta de evidencia o requisito no verificable nunca se convierte en PASS y que "los hallazgos menores requieren aceptación humana" es un registro, no una variante de veredicto. Verif.: lectura cruzada.
- **AC-A11 (S)** Tareas de solo lectura y ubicación de informes: se documenta que en tareas AUDIT/solo lectura Testing devuelve el informe en su mensaje y Orchestrator lo registra; cuando la tarea autoriza escritura, Testing escribe `docs/reviews/claude/TASK-ID-FASE.md`. Convención de nombres incluida. Verif.: grep.
- **AC-A12 (S)** Se mantienen sin cambio de fondo: un solo escritor activo, mismo workspace, regla de dos ciclos sin progreso, "no confundir tests propios de Develop con revisión independiente". Verif.: grep de las frases clave en CLAUDE.md y AGENT_WORKFLOW.md.

### Bloque B — Seguridad (`.claude/settings.json` y agentes)

- **AC-B01 (S)** `.claude/settings.json` es JSON válido (exit 0 de `JSON.parse`), con `$schema` igual a `https://json.schemastore.org/claude-code-settings.json` y solo claves documentadas. Claves permitidas sin justificación adicional: `$schema`, `permissions` (`defaultMode`, `allow`, `ask`, `deny`, `disableBypassPermissionsMode`) y `disableClaudeAiConnectors`. Cualquier otra clave exige cita de documentación oficial en el informe de Develop. Sin duplicados. Verif.: Apéndice B.1. Nota: un JSON inválido haría que las reglas no se apliquen en silencio; por eso este AC es bloqueante.
- **AC-B02 (S)** Modo manual y sin bypass: `permissions.defaultMode` es `"default"`; `permissions.disableBypassPermissionsMode` es `"disable"`; no aparecen `bypassPermissions`, `acceptEdits`, `auto`, `dontAsk` ni `skipDangerousModePermissionPrompt`; no hay `allow` amplio (`Bash`, `Bash(*)`, `Edit`, `Write`, `Read` sin especificador). Si añade `allow`, justificarlo y limitarlo a comandos de solo lectura sin banderas de escritura. Verif.: Apéndice A (última línea) y B.1.
- **AC-B03 (S)** Deny de **Read** para archivos sensibles que cubra, como mínimo, estos casos (el verificador del Apéndice A los simula): `.env`, `.env.local`, `.env.production`, `.env.development.local`, `.env.test.local`, `supabase/.env`, `.vercel/**`, `secrets/**`, `**/*.pem`, `**/*.key`, `.claude/settings.local.json`. Además, y como mejora recomendada (SHOULD), credenciales del usuario fuera del repositorio con sintaxis `~/`: `~/.ssh/**`, `~/.aws/**`, `~/.config/gh/**`, `~/.git-credentials`, `~/.npmrc`; no se tocan los archivos, solo se declara la regla. Verif.: Apéndice A.
- **AC-B04 (S + P)** `.env.example` sigue siendo legible: ningún patrón `Read` lo cubre (no usar `.env.*` ni `.env*`, porque `allow` no puede excepcionar un `deny`). Verif. S: Apéndice A ("Read permitido: .env.example"). Verif. P: lectura con la herramienta Read y con `cat .env.example` desde el subagente devuelve las 4 líneas esperadas.
- **AC-B05 (S)** Sintaxis de reglas válida según los hechos oficiales: forma `Tool(especificador)`; rutas con `./`, `/`, `//`, `~/` o relativas; patrón Bash `Bash(cmd *)` (no `:*` intermedio ni en medio de la cadena); PowerShell con la forma `PowerShell(...)`; ninguna regla `mcp__...` con paréntesis (se ignoran); sin paréntesis desbalanceados, vacías o duplicadas. Verif.: Apéndice B.1.
- **AC-B06 (S + P parcial)** Bash (Git Bash): deny obligatorio, con forma sin argumentos y con argumentos (por ejemplo `git push` y `git push *`), para: `git push`, `git merge`, `git reset --hard`, `git clean`, `rm -rf`/`rm -fr`/`rm -r` en sus variantes, `gh pr merge`, `gh repo create|delete|edit|rename|archive`, `gh release`, `gh secret`, `gh variable`, despliegues (`vercel`, `npm publish`, `pnpm publish`), y BD remotas/credenciales de Supabase (`supabase db push`, `supabase db reset --linked`, `supabase link`, `supabase login`, `supabase functions deploy`, `supabase secrets`, `supabase projects`, `supabase migration repair`, `supabase db dump --linked`). Se recomienda `ask` para: `git commit`, `git add`, `git checkout`, `git switch`, `git stash`, `git rebase`, `git config`, `git remote`, `pnpm|npm install|add|dlx`, `curl`, `wget`, `psql`, `pg_dump`. Develop justifica cada elección entre deny y ask. Verif. S: Apéndice A y revisión; P: casos 6.2.
- **AC-B07 (S)** PowerShell: cada deny Bash con equivalente en PowerShell tiene su regla `PowerShell(...)` (git, gh, vercel, supabase, publish) más los específicos de Windows: `Remove-Item` recursivo o con `-Force`, `rd /s`, `rmdir /s`, `del /s`, `Format-Volume`, `Invoke-WebRequest`/`Invoke-RestMethod` (alias `iwr`/`irm`) en `ask`. Reglas de salto de shell desde Git Bash: `Bash(powershell *)`, `Bash(pwsh *)`, `Bash(cmd *)` en `ask` o `deny`, documentando la limitación (no cubren rutas absolutas). Verif.: Apéndice A (casos PowerShell, insensible a mayúsculas) y revisión.
- **AC-B08 (S + P)** No se bloquean comandos legítimos de desarrollo: `git status`, `git diff`, `git log`, `git show`, `git ls-files`, `git check-ignore`, `git check-attr`, `git rev-parse`, `git branch --show-current`, `node -e`, `node --version`, `pnpm --version`, `claude --version`, `cat .env.example`, `ls`, `grep`, y los futuros `pnpm lint|typecheck|test:*|build|dev` no están en `deny` y no producen prompt innecesario. Verif. S: Apéndice A ("Bash no denegado"). Verif. P: ejecución real de la lista en POST; si alguno es denegado o pide confirmación, es hallazgo Medium como mínimo.
- **AC-B09 (S)** MCP restringido con mecanismos oficiales: `disableClaudeAiConnectors: true` y `permissions.deny` incluye `mcp__*` (o `mcp__<servidor>__*` por servidor, con la justificación de DH-12); ninguna regla `mcp__` con paréntesis; no existe `.mcp.json`; no se toca `~/.claude.json`. Verif.: Apéndice A y `ls`.
- **AC-B10 (S)** Frontmatter de agentes: `develop.md` y `testing.md` mantienen `name`, `description`, `model: sonnet`, `effort: high`; añaden `disallowedTools` que incluya `mcp__*` (sintaxis verificada en la documentación; si Develop no puede citarla, no la usa); no definen `mcpServers`, `hooks` ni `permissionMode` (y nunca con valor de bypass, `acceptEdits`, `auto`); solo campos reconocidos; `tools` sin ampliar sin justificación (PowerShell fuera de `tools`; decisión documentada: las reglas PowerShell protegen la conversación principal). Cualquier especificador de ruta en `disallowedTools` solo con cita oficial. Verif.: Apéndice B.2.
- **AC-B11 (S + P)** Deny de **Edit** (que según la documentación oficial cubre las herramientas de edición; Develop cita la fuente para `Write`) para `.env`, `.env.local`, `.env.*.local`, `.env.production`, `secrets/**`, `.claude/settings.local.json`, **sin** cubrir `.env.example` (Develop podrá actualizar nombres de variables más adelante). Verif. S: Apéndice A. Verif. P: caso 6.1 (Write a `secrets/` ficticio).
- **AC-B12 (S)** No se toca configuración global ni otros proyectos. Verif.: `stat` de `~/.claude/settings.json` mantiene mtime `2026-11-18 18:15:17 +0100` y 458 bytes; siguen sin existir `~/.claude/settings.local.json`, `~/.claude/CLAUDE.md`, `~/.claude/agents`; el informe de Develop no menciona rutas fuera del repositorio como escritas. `~/.claude.json` no se usa como criterio (lo reescribe la propia sesión activa).
- **AC-B13 (S)** La documentación (SECURITY.md y AGENT_WORKFLOW.md) declara que `deny` no es una frontera absoluta y enumera las evasiones conocidas (`grep -r .`, scripts que abren archivos, `/usr/bin/curl`, `sh -c '...'`, `powershell -Command`, Bash puede modificar archivos aunque falten Edit/Write, patrones de argumentos frágiles), sin afirmar protección total. Mantiene la frase existente de SECURITY.md:8. Verif.: grep y lectura.
- **AC-B14 (S)** Documentado qué requiere intervención humana o reinicio: validación efectiva de `disableClaudeAiConnectors` (reinicio, no documentado como en caliente), `/permissions`, `/status` (Setting sources), `/mcp`, `/context`, `claude doctor`, y que los toggles de `/mcp` se guardan en `~/.claude.json` (global, no tocar). Verif.: grep y lectura en AGENT_WORKFLOW.md o SECURITY.md.
- **AC-B15 (E)** Validación efectiva por humano tras reiniciar: `/permissions` muestra las reglas con origen proyecto; `/status` incluye `.claude/settings.json` en Setting sources; `claude doctor` no informa entradas rechazadas; `/mcp` no muestra conectores claude.ai activos; `/context` no incluye definiciones ni instrucciones MCP; `/tasks` (≥2.1.242) muestra modelo y esfuerzo de los subagentes; opcionalmente `claude --debug` (≥2.1.296) no registra campos no reconocidos en los agentes. Resultado registrado por Orchestrator con evidencia saneada. No es ejecutable por Testing.
- **AC-B16 (S)** Develop declara y respeta el orden de 3.4 (settings al final, `JSON.parse` tras cada edición) y no ejecuta comandos que sus propias reglas nuevas denegarían. Verif.: informe de Develop y exit codes.

### Bloque C — Documentación

- **AC-C01 (S)** `/agents` ya no aparece como comando o paso de verificación. Verif.: `grep -rnP '(?<![\w.])/agents(?![\w/])' --include=*.md --include=*.json .` sin resultados fuera de `docs/reviews/claude/` (históricos). Las rutas `.claude/agents/` siguen válidas.
- **AC-C02 (S)** Procedimiento "Comprobación de agentes, modelos, esfuerzos y permisos" en docs/AGENT_WORKFLOW.md con: `claude --version`; `/status`; `/permissions`; `/mcp`; `/context`; `claude doctor`; `/tasks` (≥2.1.242, modelo y esfuerzo del subagente); `claude --debug` (≥2.1.296, campos no reconocidos); variables `CLAUDE_CODE_EFFORT_LEVEL` y `CLAUDE_CODE_SUBAGENT_EFFORT` con la forma para Git Bash y para PowerShell; precedencia de esfuerzo (`CLAUDE_CODE_EFFORT_LEVEL` > parámetro de invocación > campo `effort` > esfuerzo del padre solo sin campo > `CLAUDE_CODE_SUBAGENT_EFFORT`); recarga en caliente de `.claude/agents/*.md` y de permisos; que `/agents` solo muestra un aviso en esta versión; y que **no existe comando documentado que liste las herramientas efectivas** (se usa la autodescripción del subagente como evidencia de grado "autoinformado"). Indica quién ejecuta cada comando (humano interactivo / Orchestrator no interactivo). Verif.: grep de cada elemento.
- **AC-C03 (S)** CLAUDE.md "Inicio" y el protocolo reflejan lo anterior, sin `/agents`, y el paso 4 incluye la comprobación Git (A01). Sin cambio del modelo objetivo ni de las prohibiciones existentes. Verif.: diff.
- **AC-C04 (S)** Definición única de evidencia válida de T01 en TESTING_GUIDELINES.md, referenciada desde AGENT_WORKFLOW.md (Gate G1). Evidencia válida: invocación real de cada subagente nativo con la herramienta Agent (no simulación de roles); TASK-ID; fecha; nombre del subagente; extracto saneado de la respuesta; resultados de herramientas reportados por el arnés; estado Git antes/después y SHA; modelo y esfuerzo con su grado (verificado/autoinformado/no verificable); para Develop, al menos una delegación con escritura real atribuible por diff (TASK-002 la proporciona). **No válida**: roles simulados en la conversación principal, tests propios de Develop como revisión independiente, informes retrospectivos, transcripciones sin sanear, y afirmaciones sin SHA. Verif.: lectura.
- **AC-C05 (S)** TEAM: casos de prueba definidos (ID propio) para crear, consultar, editar, buscar y archivar técnicos; solo técnicos activos y de la organización asignables (UI y API/RLS); técnico archivado conserva historial y no se asigna a nuevas órdenes; referencia a técnico de otra organización inválida. Fase de ejecución F3. Verif.: lectura y grep de IDs.
- **AC-C06 (S)** Archivado/borrado: criterios para clientes y técnicos: archivar conserva historial; archivados excluidos de selección para nuevas órdenes y visibles en historial; no existe borrado de registros vinculados sin política explícita (el intento se rechaza o la operación no existe). Los puntos DH-04..DH-06 constan como pendientes. Verif.: lectura.
- **AC-C07 (S)** Cancelación: criterios: solo desde estados no terminales; completada y cancelada rechazan cualquier transición posterior; la cancelación genera evento atómico con el cambio; la orden cancelada sale de "pendientes" y se contabiliza coherentemente en el dashboard tras recargar; DH-02 pendiente o decidido. Fase de ejecución F4. Verif.: lectura.
- **AC-C08 (S)** ACTIVITY/BR08 y evento de órdenes: criterios y casos con ID: campos obligatorios (identidad del actor, fecha/hora, tipo de entidad, id de entidad, organización, acción, valores anterior/nuevo cuando proceda); eventos mínimos propuestos (creación y cambio de estado de orden, asignación, cancelación, archivado; P1: aceptación/rechazo de presupuesto, movimiento de stock); inmutabilidad (sin UPDATE/DELETE por usuarios); atomicidad con el cambio de negocio (rollback conjunto); aislamiento por organización (RLS); ausencia de secretos y datos innecesarios. Mapeo de fases: historial de órdenes F4, ACTIVITY F6. Verif.: lectura.
- **AC-C09 (S)** Matriz de transiciones en BUSINESS_RULES.md: lista explícita de transiciones permitidas (pendiente → asignada → en curso → completada; cancelación desde estados no terminales), prohibidas (retrocesos, saltos, salida de estados terminales) y restricciones (asignada/en curso exigen técnico activo de la misma organización; cliente activo y de la organización; terminales). Sin cambio de semántica: cada punto ambiguo está **decidido con referencia a decisión humana** o **marcado DH-xx pendiente**. Verif.: diff y revisión; cualquier regla nueva no derivada del texto previo ni marcada como decisión humana es FAIL.
- **AC-C10 (S)** Criterios medibles de accesibilidad en TESTING_GUIDELINES.md (T10), objetivo WCAG 2.2 AA sin certificación, con al menos: contraste 4.5:1 (texto) y 3:1 (texto grande y componentes/indicador de foco); operabilidad total por teclado sin trampas y orden de foco lógico; foco visible y no oculto; etiquetas/nombres accesibles en todos los controles; mensajes de error identificados y asociados al campo; mensajes de estado anunciados; tamaño mínimo de objetivo 24×24 px CSS; reflow sin scroll horizontal a 320 px CSS de ancho y zoom de texto al 200%; viewports de verificación (propuesta: 320, 390, 768 y 1280 px); `lang="es"`, título de página; autenticación accesible (sin pruebas cognitivas, admite gestor de contraseñas y pegado). Debe distinguir qué se automatiza y qué es manual. Verif.: lectura y grep de umbrales.
- **AC-C11 (S)** Plan de automatización en F2 documentado (TESTING_GUIDELINES.md o ROADMAP.md): herramienta propuesta (p. ej. Playwright con axe-core) sujeta a la aprobación de dependencias en F2; umbral (0 violaciones serious/critical; moderate/minor se reportan con gravedad); comprobación de desbordes por viewport; recorrido por teclado; integración en `pnpm test:e2e` o en un script nuevo declarado y aprobado; y una nota explícita de cobertura parcial de las herramientas automáticas. Sin añadir dependencias ahora. Verif.: lectura y `package.json` ausente.
- **AC-C12 (S)** Registro de pendientes por fase en ROADMAP.md (con puntero desde ARCHITECTURE.md "Decisiones pendientes"), redactado como pendiente/no implementado: roles y permisos exactos (F3, ADR); RLS por operación y membresía (F3); `GRANT` y exposición PostgREST (F3); hardening de RPC `SECURITY DEFINER` (`search_path`, `REVOKE` de PUBLIC/anon, `EXECUTE`) (F5/F6); IVA y redondeo (F5, decisión humana antes de implementar, BR06); concurrencia e idempotencia (F5/F6); preflight Docker/WSL/Supabase CLI (F3, D1); harness y automatización de accesibilidad (F2); umbral de cobertura (F2). Verif.: grep de cada término en la sección de la fase indicada.
- **AC-C13 (S)** Trazabilidad mínima en TESTING_GUIDELINES.md: toda regla BR y todo criterio aprobado se mapea a al menos un caso positivo y uno negativo ejecutable; sin umbral numérico inventado (propuesta marcada "pendiente de aprobación", DH-09). Verif.: lectura.
- **AC-C14 (S)** Aclaración TST-11: antes de F2 la "reproducción del fallo previo" se hace con comprobación estática o manual registrada; desde F2 con el runner. Verif.: lectura.
- **AC-C15 (S)** Los informes y STATUS distinguen **validación estática** de **validación efectiva pendiente** y declaran como "no verificable" el esfuerzo efectivo cuando lo sea. Verif.: lectura de TEMPLATE.md y STATUS.md.
- **AC-C16 (S)** Los documentos no afirman capacidades no confirmadas (p. ej. no se declara que un comando liste herramientas efectivas, ni que `deny` bloquea toda lectura). Verif.: lectura crítica; cualquier afirmación sobre la CLI debe coincidir con los hechos oficiales aportados o citar su fuente.

### Bloque D — Higiene

- **AC-D01 (S)** `.gitignore` ampliado sin perder nada: cada línea previa sigue presente (comprobado por diff: solo líneas añadidas, o reemplazos justificados); `!.env.example` sigue después de `.env.*`. Deben quedar **ignoradas** las rutas ficticias del Apéndice B.3 (`secrets/`, `.secrets/`, `*.pfx`, `*.p12`, `id_rsa*`, `id_ed25519*`, `service-account*.json`, `credentials*.json`, `.claude/agent-memory/`, `.claude/worktrees/`, `CLAUDE.local.md`, `*.dump`, entre otras) y **no ignoradas** las rutas rastreables (`.env.example`, `.gitattributes`, `.claude/settings.json`, `.claude/agents/*.md`, `docs/reviews/claude/*.md`, `docs/reviews/codex/*.md`, `supabase/migrations/*.sql`, `pnpm-lock.yaml`, `tests/acceptance/*`). Verif.: `git check-ignore` del Apéndice B.3, con resultado esperado para cada ruta.
- **AC-D02 (S + P)** `.gitattributes` coherente con `.editorconfig` (`end_of_line = lf`): `* text=auto eol=lf` o equivalente; binarios marcados (`*.png`, `*.jpg`, `*.ico`, `*.pdf`, fuentes); sin `eol=crlf` para md/json/ts/tsx/sql; si incluye `*.bat`/`*.cmd` con `crlf` es aceptable. `git check-attr` devuelve lo esperado; `git ls-files --eol` mantiene `i/lf` en todos los archivos rastreados (ninguno `i/crlf` ni `i/mixed`); `git status --porcelain` no muestra modificaciones espurias por saltos de línea en archivos no tocados; no se usó `git add --renormalize` ni conversión masiva. Verif. P: repositorio temporal en el directorio de sesión con el `.gitattributes` real y un archivo CRLF ficticio: `git add` produce `i/lf` (Apéndice B.4). Los archivos existentes pueden conservar CRLF en el working tree; se documenta, no se corrige en masa.
- **AC-D03 (S)** Directorios de evidencias: `docs/reviews/claude/README.md` y `docs/reviews/codex/README.md` existen, no están ignorados y contienen: propósito, convención de nombres (`TASK-NNN-FASE.md`; Codex `G<n>-<fecha>.md` o `TASK-NNN-AUDIT.md`), referencia a TEMPLATE.md, reglas de saneado (sin secretos, tokens, identificadores de sesión, credenciales ni enlace privado de entrega), quién registra (Orchestrator registra los resultados de Codex; Codex no escribe), y que solo se aceptan evidencias de ejecuciones reales, nunca retrospectivas ni ficticias. `docs/reviews/codex/` contiene únicamente su README (sin informes fabricados). Verif.: `ls`, `git check-ignore`, lectura.
- **AC-D04 (S)** STATUS.md refleja el estado real: fecha; rama y SHA base `86611a8`; F0 completada con versiones; Claude Code 2.1.327 **verificado** con `claude --version`; F1 en curso con TASK-001 resultado preliminar BLOCKED (enlace al informe) y TASK-002 en estado "pendiente de Testing POST" (no PASS hasta que exista el veredicto); G1 **no** aprobado; auditoría Codex **no** realizada; sin aplicación ni pruebas ni despliegue; esfuerzo efectivo no verificable hasta la comprobación humana con `/tasks`; validaciones efectivas pendientes (B15); D1 pendiente (Docker/WSL/Supabase CLI no verificados). Verif.: lectura; cualquier afirmación de PASS, G1 aprobado o Codex realizado es FAIL.
- **AC-D05 (S)** ROADMAP.md refleja el estado real (F0 completada, F1 en curso con G1 pendiente, F2–F8 pendientes) sin cambiar fases, alcance ni puertas (el texto de la columna Gate de F1..F8 permanece idéntico) y con el registro de pendientes de C12. Verif.: diff de la tabla.
- **AC-D06 (S)** Sin instalaciones ni herramientas nuevas (reitera G04 sobre Docker, WSL, Supabase CLI y dependencias). Verif.: `git status`, `ls`, informe de Develop.
- **AC-D07 (S)** `.editorconfig`, `README.md` y `.env.example` sin modificar. Verif.: `git diff --quiet HEAD -- .editorconfig README.md .env.example`.

### Bloque E — Excepción de TASK-002

- **AC-E01 (S)** Solo se modificaron archivos de la lista 3.1/3.2, y cada archivo de agentes/directrices tiene justificación individual (archivo, líneas, hallazgo, necesidad, "sin reducción de criterios"). Verif.: `git diff --name-only` y mensaje de Develop.
- **AC-E02 (S)** `docs/CHALLENGE.md` idéntico byte a byte. Verif.: `git diff --quiet HEAD -- docs/CHALLENGE.md` y sha256 de la cabecera.
- **AC-E03 (S)** Ningún criterio reducido. Verif.: (i) cada línea eliminada o reemplazada (`git diff -U0 HEAD | grep '^-'`) figura en la tabla de Develop con motivo; una eliminación sin justificar es FAIL; (ii) heurística de cadenas protegidas (Apéndice B.6): filas T01..T12, BR01..BR08, módulos AUTH/CRM/TEAM/ORDERS/DASH/QUOTES/STOCK/ACTIVITY, los seis scripts objetivo, puertas G1..G5, "Fuera de alcance", "FAIL ante cualquier incumplimiento", "BLOCKED si falta evidencia", "No reducir criterios", "No avanzar con FAIL/BLOCKED", "Una fase a la vez". Un fallo de la heurística obliga a revisar el diff, no es FAIL automático. Los criterios pueden endurecerse, no relajarse.
- **AC-E04 (S)** La excepción caduca: develop.md conserva la prohibición permanente de editar `.claude/agents/`, CLAUDE.md, AGENTS.md y directrices, sin cláusula general de excepción; la excepción de TASK-002 queda solo registrada como hecho histórico (STATUS o informe). Verif.: grep y lectura de develop.md.
- **AC-E05 (S)** Develop no se autoaprueba ni emite veredicto; no declara G1 aprobado. Verif.: lectura del informe y de STATUS.

### Bloque N — No regresión transversal

- **AC-N01 (S)** Las entradas deny previas (`Read(./.env.local)`, `Read(./.env.production)`, `Read(./.env.test.local)`, `Read(./.claude/settings.local.json)`) siguen cubiertas por las nuevas reglas (igual o superconjunto). Verif.: Apéndice A.
- **AC-N02 (S)** Los agentes siguen cargando: frontmatter bien formado (`---` de apertura y cierre, claves reconocidas), `name` sin cambios, `model: sonnet` y `effort: high` intactos, texto contractual previo conservado salvo cambios justificados. Verif.: Apéndice B.2. La carga real de `develop.md` la comprueba Orchestrator con una invocación trivial posterior (E, ver sección 7).
- **AC-N03 (S)** Enlaces relativos de Markdown sin rotos. Verif.: Apéndice B.5 (línea base: 0 enlaces rotos, exit 0).
- **AC-N04 (S)** Vocabulario normativo coherente: gravedad, veredictos, rutas de evidencias, nombres de agentes y de scripts no se contradicen entre documentos. Verif.: lectura cruzada y greps de A08..A10.
- **AC-N05 (S)** Anclas de regresión explícitas, ya cubiertas arriba y reverificadas en el informe: `.env.example` legible (B04), sin bypass (B02), CHALLENGE.md intacto (E02), TASK-001.md intacto (G03).

Total: **67 criterios** (G 6, A 12, B 16, C 16, D 7, E 5, N 5). Cinco incluyen componente P (B04, B06, B08, B11, D02), uno es exclusivamente E (B15) y el resto son S.

---

## 6. Casos de prueba inocuos para POST

Reglas: sin secretos reales, sin red, sin remoto, sin destructivos. Los comandos "denegados" son inocuos incluso si la regla fallara. Todo archivo temporal vive en el directorio de sesión o se elimina y se comprueba con `git status`.

### 6.1 Permisos efectivos desde el subagente (P)

Esperado: mensaje de denegación por regla de permisos, no un error del comando.

| Caso | Acción | Si el deny falla (efecto) | Esperado |
|---|---|---|---|
| P-R1 | Herramienta Read sobre la ruta absoluta de `.env.local` (no existe) | error "no existe" | Denegado por permisos. Si responde "no existe", queda **inconcluso**; se anota como limitación y no se crea ningún archivo salvo autorización expresa de Orchestrator para un `.env.local` ficticio con el texto `FICTITIOUS_SENTINEL=not-a-secret`, que se eliminaría después |
| P-R2 | `cat .env.local` (no existe) | "No such file" | Denegado por permisos |
| P-R3 | Herramienta Read sobre `.env.example` y `cat .env.example` | n/a | Éxito: las 4 líneas de la línea base (2 comentarios y 2 variables sin valor) |
| P-R4 | Herramienta Grep con `path` en `.env.local` (no existe) | sin resultados | Informativo: se registra el mensaje; no es criterio por ser "best-effort" |
| P-W1 | Herramienta Write sobre `secrets/fictitious.txt` con el texto `FICTITIOUS` (solo si hay `Edit(./secrets/**)`) | crea un archivo ficticio ignorado | Denegado; si se crea, se elimina con `rm` y se verifica con `git status`/`ls`, y es hallazgo High (regla Edit inefectiva) |

### 6.2 Bash

| Caso | Comando | Si el deny falla | Esperado |
|---|---|---|---|
| P-B1 | `git push nonexistent-remote-for-test` | error de remoto inexistente | Denegado |
| P-B2 | `git reset --hard nonexistent-ref-for-test` | error de referencia desconocida | Denegado |
| P-B3 | `git clean -n` | solo lista, no borra | Denegado |
| P-B4 | `rm -rf nonexistent-dir-for-test` | no hace nada | Denegado |
| P-B5 | `git merge nonexistent-branch-for-test` | error de rama desconocida | Denegado |
| P-B6 | `supabase db push` | "command not found" (CLI no instalada) | Denegado por permisos, no "command not found" |
| P-B7 | Lista legítima: `git status --porcelain -uall`; `git diff --stat`; `git log -1 --format=%H`; `git ls-files`; `git check-ignore -v .env`; `git check-attr -a .gitattributes`; `node -e "1"`; `node --version`; `pnpm --version`; `claude --version`; `ls`; `grep -c Read .claude/settings.json` | n/a | Todos se ejecutan sin denegación; cualquier prompt o denegación se registra |

Los casos de remoto real (`gh pr merge`, `vercel`, `supabase db push` con CLI instalada) **no se ejecutan** nunca: se validan por simulación estática y por `/permissions` del humano. Los casos PowerShell no son ejecutables desde el subagente (no tiene esa herramienta): se validan por simulación (Apéndice A); su ejecución efectiva la haría Orchestrator si dispone de la herramienta, o el humano.

### 6.3 Estáticos (S)

1. Apéndice A sobre `.claude/settings.json` real. Esperado: exit 0, "todo ok" (más los casos adicionales que Develop incluya).
2. B.1, B.2: JSON y frontmatter.
3. B.3: `git check-ignore` sobre las rutas ficticias de cada lista. Esperado: cada ruta "debe ignorarse" produce coincidencia y cada ruta "no debe ignorarse" no.
4. B.4: repositorio temporal en el directorio de sesión para probar `.gitattributes`: se copia el archivo, se crea un archivo con CRLF, `git -c core.autocrlf=true add` y `git ls-files --eol` devuelve `i/lf`; se borra el directorio temporal.
5. `git ls-files --eol` del repositorio real: ningún `i/crlf` ni `i/mixed`.
6. B.5 enlaces; B.6 cadenas protegidas; B.7 secretos; `grep` de A09 y C01.
7. `stat` de `~/.claude/settings.json` (solo metadatos).
8. Comparación de cada archivo modificado con la lista 3.1/3.2 (G01) y revisión de `git diff -U0 HEAD` de líneas eliminadas (E03).
9. Autodescripción de herramientas del propio Testing (B10, C02), registrada como evidencia "autoinformada".

### 6.4 Limpieza

Al final de POST: `git status --porcelain -uall` debe contener solo el cambio de Develop y los informes de Testing; los temporales del directorio de sesión se eliminan; no se deja ningún archivo ficticio en el repositorio.

---

## 7. Cómo se emitirá el veredicto POST

Solo PASS, FAIL o BLOCKED. Sin variantes.

**Alcance del veredicto de TASK-002.** Se evalúan los criterios de tipo S y P (secciones 5 y 6). Las validaciones efectivas que requieren humano o reinicio (tipo E: B15 y la carga real de `develop.md` por invocación posterior) **no forman parte del cierre de TASK-002 sino de los prerrequisitos de G1**, sujeto a la confirmación de DH-00. En el informe POST se listarán en una sección propia, "Validación efectiva pendiente", con su responsable, y se declarará de forma explícita que **el veredicto cubre la validación estática y efectiva parcial en subagente, no la efectividad confirmada en la CLI**. No es un "PASS condicionado": el veredicto sigue siendo uno de tres valores, y G1 no puede aprobarse sin ejecutar y registrar los ítems E.

- **PASS**: todos los AC de tipo S y P ejecutados y superados; cero hallazgos Critical/High; archivos modificados dentro de la lista cerrada; sin criterios reducidos; los DH están decididos o marcados como pendientes; los hallazgos Medium/Low/Informational fuera de criterios quedan listados para aceptación humana explícita.
- **FAIL**, cualquiera de: incumplimiento de un AC (S o P); escritura fuera de la lista o en archivos prohibidos; criterio reducido sin justificación; `settings.json` inválido o con bypass; `.env.example` bloqueado; deny efectivo que bloquea un comando legítimo de B08 o regla que no se aplica en el subagente (P); secreto en el diff; afirmación falsa en STATUS (PASS, G1 aprobado, Codex realizado); semántica inventada en BR03; defecto High o Critical.
- **BLOCKED**: no se puede ejecutar o verificar un AC S/P aplicable (herramienta no disponible, información ausente, DH-00 resuelto en sentido contrario y E no ejecutadas). BLOCKED nunca se convierte en PASS sin evidencia.

Gravedad de referencia: Critical/High para secretos expuestos, bypass habilitado, escritura en producción o archivos prohibidos, regla de seguridad inefectiva o reducción de criterios; Medium para omisiones documentales de AC y bloqueos de comandos legítimos; Low/Informational para erratas que no incumplen un criterio.

El informe POST seguirá la plantilla ampliada (A07): archivos modificados, SHA, diff, comandos con exit code, resultados, limitaciones, y la separación **Validación estática / Validación efectiva parcial (subagente) / Validación efectiva pendiente (humano o reinicio)**. Tras FAIL, RETEST sobre los mismos criterios.

---

## 8. Riesgos y notas para Orchestrator

1. Develop (develop.md:18) tiene prohibido editar los archivos que TASK-002 le pide modificar. Incluir la autorización humana literal en el handoff.
2. Resolver o registrar DH-00..DH-12 antes de invocar a Develop, sobre todo DH-01..DH-08 (semántica) y DH-00 (criterio de cierre).
3. La edición de `settings.json` puede dejar sin protección si el JSON es inválido y no hay aviso inmediato; B01 y los casos P lo detectan.
4. El deny global `mcp__*` y `disableClaudeAiConnectors` pueden afectar a funciones de la aplicación de escritorio (conectores). Es una decisión de DH-12; se puede relajar por el humano en su fase.
5. Los casos P dependen de que el subagente use los permisos recargados. Si un deny correcto no surte efecto, puede ser un reinicio pendiente: se registraría FAIL High con la hipótesis y se haría RETEST tras reiniciar.
6. Pedir a Develop que liste las herramientas visibles en su sesión, para contrastarlas con `tools` (grado autoinformado).
7. No se creó ningún archivo de prueba en `tests/` en esta fase: los criterios son comprobaciones estáticas con comandos registrados. Un directorio `tests/acceptance/governance/` podría automatizarlas tras F2 (tarea futura).

---

## Apéndice A — Verificador estático de reglas (`check-settings.js`)

Solo lectura. Aproximación del comportamiento oficial (comparación de patrones simplificada, sin sustituir a `/permissions`). Uso: `node check-settings.js .claude/settings.json`. Ensayado: sobre la configuración actual devuelve exit 1 con 21 fallos; sobre un ejemplo de referencia bien formado devuelve exit 0.

```js
const fs = require('fs');
const s = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const P = s.permissions || {};
const rules = k => (P[k] || []);
const esc = x => x.replace(/[.+^${}()|[\]\\]/g, '\\$&');
const glob = g => {
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { r += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') r += '[^/]*';
    else r += esc(c);
  }
  return new RegExp('^' + r + '$', 'i');
};
const pathRe = p => {
  if (p.startsWith('~/') || p.startsWith('//')) return null;
  let q = p.replace(/^\.\//, '').replace(/^\//, '');
  const any = q.startsWith('**/');
  return { any, re: glob(any ? q.slice(3) : q), raw: p };
};
const mk = tool => rules('deny').filter(r => r.startsWith(tool + '(')).map(r => pathRe(r.slice(tool.length + 1, -1))).filter(Boolean);
const readDeny = mk('Read');
const editDeny = mk('Edit');
const hit = (L, f) => L.some(d => d.any
  ? f.split('/').some((_, i, a) => d.re.test(a.slice(i).join('/')))
  : d.re.test(f));
let bad = 0;
const chk = (ok, msg) => { if (!ok) { bad++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
for (const f of ['.env', '.env.local', '.env.production', '.env.development.local', '.env.test.local', 'supabase/.env', '.vercel/project.json', 'secrets/a.json', 'x/y/cert.pem', '.claude/settings.local.json']) chk(hit(readDeny, f), 'Read denegado: ' + f);
for (const f of ['.env.example', '.claude/settings.json', 'docs/SECURITY.md', 'src/lib/env.ts', 'supabase/config.toml', '.gitignore']) chk(!hit(readDeny, f), 'Read permitido: ' + f);
for (const f of ['.env', '.env.local', '.env.production', 'secrets/a.json', '.claude/settings.local.json']) chk(hit(editDeny, f), 'Edit denegado: ' + f);
for (const f of ['.env.example', '.gitignore', 'docs/STATUS.md', 'src/app/page.tsx']) chk(!hit(editDeny, f), 'Edit permitido: ' + f);
const cmdHit = (tool, cmd, list) => list.filter(r => r.startsWith(tool + '(')).some(r => {
  let p = r.slice(tool.length + 1, -1);
  let c = cmd;
  if (tool === 'PowerShell') { p = p.toLowerCase(); c = c.toLowerCase(); }
  if (p.endsWith(':*')) p = p.slice(0, -2) + ' *';
  if (p.endsWith(' *')) { const b = p.slice(0, -2); return c === b || c.startsWith(b + ' '); }
  return c === p;
});
const D = rules('deny');
for (const c of ['git push', 'git push origin main', 'git reset --hard nonexistent-ref', 'git clean -n', 'rm -rf nonexistent-dir', 'supabase db push --linked']) chk(cmdHit('Bash', c, D), 'Bash denegado: ' + c);
for (const c of ['git status', 'git diff --stat', 'git log -1', 'git ls-files', 'git check-ignore -v .env', 'node -e 1', 'cat .env.example', 'pnpm --version', 'claude --version']) chk(!cmdHit('Bash', c, D), 'Bash no denegado: ' + c);
for (const c of ['git push origin main', 'Remove-Item -Recurse -Force x']) chk(cmdHit('PowerShell', c, D), 'PowerShell denegado: ' + c);
chk(D.some(r => /^mcp__/.test(r)), 'MCP denegado');
chk(!D.concat(rules('ask'), rules('allow')).some(r => /^mcp__.*\(/.test(r)), 'sin reglas mcp__ con parentesis');
chk(P.defaultMode === 'default' && !JSON.stringify(s).includes('bypassPermissions') && P.disableBypassPermissionsMode === 'disable', 'modo manual y bypass deshabilitado');
console.log(bad ? ('RESULTADO: ' + bad + ' fallos') : 'RESULTADO: todo ok');
process.exit(bad ? 1 : 0);
```

Nota sobre limitaciones del verificador: `Read(~/...)` y `Read(//...)` se ignoran en la simulación (se revisan a mano); `git merge`, `gh`, `vercel`, otras reglas del AC-B06 y B07 se revisan además por lectura de la lista; el verificador comprueba una muestra representativa, no sustituye a `/permissions`.

## Apéndice B — Comandos de verificación (Git Bash, solo lectura)

**B.1 JSON y claves de settings**

```
node -e "const s=JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'));const ok=new Set(['\$schema','permissions','disableClaudeAiConnectors']);const pk=new Set(['defaultMode','allow','ask','deny','disableBypassPermissionsMode']);console.log('claves no previstas:',Object.keys(s).filter(k=>!ok.has(k)),Object.keys(s.permissions||{}).filter(k=>!pk.has(k)));const all=['allow','ask','deny'].flatMap(k=>s.permissions[k]||[]);console.log('duplicados:',all.filter((r,i)=>all.indexOf(r)!==i));console.log('mal formadas:',all.filter(r=>!/^[A-Za-z_][\w*]*(\(.+\))?$/.test(r)||(r.match(/\(/g)||[]).length!==(r.match(/\)/g)||[]).length&&!/^Bash|^PowerShell|^Read|^Edit/.test(r)));console.log('schema:',s['\$schema'])"
```

**B.2 Frontmatter de agentes** (ensayado sobre el estado actual: sin campos desconocidos)

```
node -e "const OK=new Set(['name','description','tools','disallowedTools','model','permissionMode','maxTurns','skills','mcpServers','hooks','memory','background','effort','isolation','color']);for(const f of ['develop','testing']){const t=require('fs').readFileSync('.claude/agents/'+f+'.md','utf8').replace(/\r/g,'');const m=t.match(/^---\n([\s\S]*?)\n---\n/);if(!m)throw new Error('sin frontmatter '+f);const k=Object.fromEntries(m[1].split('\n').map(l=>l.split(/:\s*(.*)/).slice(0,2)));console.log(f,JSON.stringify(k),'desconocidos:',Object.keys(k).filter(x=>!OK.has(x)))}"
```

**B.3 Cobertura de `.gitignore`**

```
# Deben estar ignoradas (alguna sin coincidencia = FAIL)
for p in .env .env.local .env.production.local apps/web/.env.local supabase/.env secrets/key.json .secrets/k foo.pem foo.key foo.pfx foo.p12 id_rsa id_ed25519 service-account.json credentials.json .claude/settings.local.json .claude/agent-memory/x.md .claude/agent-memory-local/x.md .claude/worktrees/a/b CLAUDE.local.md .vercel/project.json supabase/.temp/x db.dump; do git check-ignore -q -- "$p" || echo "NO-IGNORADA $p"; done
# No deben estar ignoradas (alguna ignorada = FAIL)
for p in .env.example .gitattributes .claude/settings.json .claude/agents/develop.md docs/reviews/claude/TASK-002.md docs/reviews/claude/README.md docs/reviews/codex/README.md supabase/migrations/0001_init.sql pnpm-lock.yaml tests/acceptance/a.test.ts; do git check-ignore -q -- "$p" && echo "IGNORADA $p"; done
```

Línea base: 12 `NO-IGNORADA` y ningún `IGNORADA`.

**B.4 `.gitattributes`**

```
git check-attr text eol -- README.md .gitignore pnpm-lock.yaml src/a.ts supabase/migrations/a.sql
git ls-files --eol | grep -vE '^i/lf' || echo "todo i/lf"
# Repositorio temporal en el directorio de sesión (no en el proyecto):
T="<directorio-de-sesion>/gitattr-test"; mkdir -p "$T" && cd "$T" && git init -q && cp <repo>/.gitattributes . && printf 'a\r\nb\r\n' > crlf.txt && git -c core.autocrlf=true add crlf.txt .gitattributes && git ls-files --eol crlf.txt
```

**B.5 Enlaces Markdown relativos** (ensayado: exit 0, 0 rotos)

```
node -e "const fs=require('fs'),path=require('path');let bad=0;const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.name==='.git'?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);for(const f of walk('.').filter(f=>f.endsWith('.md'))){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)){const u=m[1];if(/^[a-z]+:/i.test(u))continue;if(!fs.existsSync(path.resolve(path.dirname(f),u))){bad++;console.log('ROTO',f,u)}}}console.log('rotos:',bad);process.exit(bad?1:0)"
```

**B.6 Cadenas protegidas (heurística; un fallo exige revisar el diff)**

```
c(){ grep -qF -- "$2" "$1" || echo "FALTA en $1: $2"; }
for i in T01 T02 T03 T04 T05 T06 T07 T08 T09 T10 T11 T12; do c docs/TESTING_GUIDELINES.md "| $i"; done
for i in BR01 BR02 BR03 BR04 BR05 BR06 BR07 BR08; do c docs/BUSINESS_RULES.md "$i"; done
for i in AUTH CRM TEAM ORDERS DASH QUOTES STOCK ACTIVITY; do c docs/PRODUCT_REQUIREMENTS.md "$i"; done
c docs/TESTING_GUIDELINES.md "pnpm lint; pnpm typecheck; pnpm test:unit; pnpm test:integration; pnpm test:e2e; pnpm build"
c docs/TESTING_GUIDELINES.md "FAIL ante cualquier incumplimiento"; c docs/TESTING_GUIDELINES.md "BLOCKED si falta evidencia"
c docs/TESTING_GUIDELINES.md "No reducir criterios"; c docs/ROADMAP.md "No avanzar con FAIL/BLOCKED"; c docs/ROADMAP.md "Una fase a la vez"
c docs/PRODUCT_REQUIREMENTS.md "Fuera de alcance"; c CLAUDE.md "Los criterios de aceptación aprobados no se reducen"
for g in G1 G2 G3 G4 G5; do c docs/ROADMAP.md "$g"; done
```

**B.7 Búsqueda de secretos en el diff y en archivos nuevos**

```
git diff HEAD | grep -nE 'eyJ[A-Za-z0-9_-]{20,}|sb_(secret|publishable)_[A-Za-z0-9]{10,}|-----BEGIN|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}' || echo "sin coincidencias"
# y lo mismo con grep -rnE sobre .gitattributes y docs/reviews/*/README.md (archivos nuevos)
```

**B.8 Comprobación Git del contrato (G01, G02)**

```
git rev-parse HEAD; git branch --show-current; git status --porcelain -uall; git diff --name-only HEAD; git diff --cached --name-only
```

---

## 9. Limitaciones de esta fase PRE

- No se ejecutó ningún comando interactivo de Claude Code (`/status`, `/permissions`, `/mcp`, `/context`, `/tasks`, `claude doctor`).
- No se verificaron los hechos de documentación oficial (sin red); se usan tal como los entregó Orchestrator. Las sintaxis marcadas "con cita oficial" las debe fundamentar Develop.
- No se probó el efecto real de ninguna regla `deny` porque aún no existen; se ha ensayado únicamente la lógica del verificador y los comandos de línea base, sin leer secretos ni tocar red.
- El esfuerzo efectivo del propio Testing no es verificable desde la sesión.
- No hay veredicto: la fase PRE solo define criterios y la línea base (estado "rojo" reproducido: 21 fallos de reglas, 12 rutas sin ignorar, 2 referencias a `/agents`, sin `.gitattributes`).

Iteraciones: 1 (PRE). Aceptación humana: pendiente.
