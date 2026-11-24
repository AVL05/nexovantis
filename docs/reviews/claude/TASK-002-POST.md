# TASK-002-POST — Revisión independiente de la implementación

Foundation hardening & multi-agent governance. Informe de Testing, fase POST. Se evalúa contra `docs/reviews/claude/TASK-002-PRE.md` (sha256 `1491632d…581`, verificado idéntico al hash esperado).

**Veredicto: BLOCKED.** No hay ningún incumplimiento confirmado de un criterio aprobado ni hallazgos Critical/High. El bloqueo se debe a que cuatro criterios de tipo S (AC-G05, AC-B16, AC-E01 y AC-E03(i)) dependen del informe literal de Develop, que Testing no ha recibido (solo un resumen del Orchestrator), y a que hay tres puntos que requieren confirmación (sección 8). El veredicto cubre validación estática y efectiva parcial en subagente; no afirma efectividad confirmada en la CLI.

## 1. Cabecera

| Campo | Valor |
|---|---|
| TASK-ID / Fase | TASK-002 / POST |
| Fecha | 2026-11-24 |
| Agente | Testing (subagente nativo) |
| Modelo solicitado / efectivo | `sonnet` / `claude-sonnet-5-5`. Grado: **autoinformado** |
| Esfuerzo solicitado / efectivo | `high` (frontmatter) / **no verificable** desde dentro. Variables `CLAUDE_CODE_EFFORT_LEVEL` y `CLAUDE_CODE_SUBAGENT_EFFORT`: no definidas en el entorno de este subagente (`printenv \| grep`, exit 1), grado autoinformado |
| Rama | `chore/project-foundation` |
| SHA base / HEAD | `86611a8fc62dcf1c8a34af18a817fac55368ae91` (sin commits nuevos) |
| Diff final revisado | `git diff HEAD`: 15 archivos, 799 inserciones, 29 eliminaciones; huella sha256 `692302c1d184b5ac…`. Huellas: `settings.json` `02be3969…`, `develop.md` `9f8efbb1…`, `testing.md` `d4de544c…` |
| Entorno | Windows 11, Claude Code 2.1.327 (`claude --version`, exit 0), Node v24.22.2, pnpm 12.16.1, Git con `core.autocrlf=true` |
| Herramientas efectivas de este subagente (autoinformado) | Read, Glob, Grep, Edit, Write, Bash (Git Bash). **Sin** PowerShell, sin Agent, sin ToolSearch y **sin ninguna herramienta `mcp__` invocable** |

### Estado Git

Antes (idéntico al comunicado por Orchestrator): `git rev-parse HEAD` = `86611a8f…`; `git diff --cached --name-only` vacío; `git status --porcelain=v1 -uall`: 15 `M` (develop.md, testing.md, settings.json, .gitignore, AGENTS.md, CLAUDE.md, AGENT_WORKFLOW, ARCHITECTURE, BUSINESS_RULES, PRODUCT_REQUIREMENTS, ROADMAP, SECURITY, STATUS, TESTING_GUIDELINES, TEMPLATE) y 5 `??` (`.gitattributes`, `docs/reviews/claude/README.md`, `TASK-001.md`, `TASK-002-PRE.md`, `docs/reviews/codex/README.md`).

Después: el mismo conjunto más `?? docs/reviews/claude/TASK-002-POST.md` (este informe). Sin staging, sin commits, sin cambio de rama. Los archivos ficticios de prueba no llegaron a crearse (las escrituras fueron denegadas); no hay temporales en el repositorio. Los scripts auxiliares viven en el directorio temporal de sesión, fuera del repositorio.

### Archivos modificados por Develop (M/A/D/??)

`M` ×15 y `??` ×3 (`.gitattributes`, `docs/reviews/claude/README.md`, `docs/reviews/codex/README.md`): coincide con la lista cerrada 3.1/3.2 del PRE. Ninguna ruta extra. `D`: ninguno.

## 2. Comandos y resultados (selección; todos solo lectura salvo los casos P inocuos)

| Comando | Exit | Resultado |
|---|---|---|
| `git status --porcelain=v1 -uall`; `git diff --cached --name-only`; `git rev-parse HEAD`; `git branch --show-current` | 0 | Estado y SHA según sección 1; staged vacío; rama correcta |
| `sha256sum` de PRE, TASK-001, CHALLENGE, `.env.example` | 0 | PRE `1491632d…` (coincide); TASK-001 `57ddf625…` (coincide); CHALLENGE `502379b1…` (coincide); `.env.example` `37609b95…` |
| `git diff --quiet HEAD -- docs/CHALLENGE.md` / `.editorconfig README.md .env.example docs/DEPLOYMENT.md` | 0 / 0 | Intactos |
| `node check-settings.js .claude/settings.json` (Apéndice A) | 0 | 45 comprobaciones "ok", "todo ok" |
| B.1 (JSON y claves) | 0 | Claves previstas; sin duplicados; deny 232, ask 142, allow 0. "mal formadas" marca 3 reglas MCP por un defecto de mi verificador (POST-09) |
| B.2 (frontmatter) | 0 | Ambos agentes: `name`, `description`, `model: sonnet`, `effort: high`, `tools`, `disallowedTools: mcp__*`; sin campos desconocidos |
| Cobertura B06/B07 con script propio (`cov.js`) | 0 | Todo deny obligatorio presente en Bash y PowerShell con y sin argumentos, salvo `rm -r*` en PowerShell (POST-05). Sin intersección deny/ask. Ningún comando legítimo afectado |
| B.3 `git check-ignore` (22 rutas a ignorar, 10 a rastrear) | 0 | Cero `NO-IGNORADA`, cero `IGNORADA`. `.gitignore`: solo líneas añadidas; `!.env.example` sigue tras `.env.*` (líneas 16-17) |
| B.4 `git check-attr`; `git ls-files --eol`; repositorio temporal con CRLF | 0 | `text=auto eol=lf`; los 20 rastreados son `i/lf`; en el temporal `crlf.txt` → `i/lf`, `.bat` → `eol=crlf`. `git status` sin modificaciones espurias |
| B.5 enlaces Markdown | 0 | 21 enlaces relativos, 0 rotos |
| B.6 cadenas protegidas | 0 | Sin "FALTA" |
| B.7 secretos (diff y archivos nuevos) | 1 (grep sin coincidencias) | "sin coincidencias" |
| Grep A09 (`PASS condicionad…`) fuera de `docs/reviews/claude/` | 1 (sin resultados) | Cero coincidencias |
| Grep C01 (`/agents` como comando) fuera de `docs/reviews/claude/` | 1 (sin resultados) | Cero coincidencias |
| `stat ~/.claude/settings.json` (solo metadatos) | 0 | mtime `2026-11-18 18:15:17 +0100`, 458 bytes (sin cambios); no existen `~/.claude/settings.local.json`, `CLAUDE.md` ni `agents` |
| `ls` de package.json, lockfiles, node_modules, src, tests, supabase, .github, .mcp.json | — | Ninguno existe |
| `printenv \| grep -E '^CLAUDE_CODE_(EFFORT_LEVEL\|SUBAGENT_EFFORT)='` | 1 | Sin variables definidas (en este subagente) |
| `git ls-files --others --ignored --exclude-standard --directory \| grep -E …` (comando de AGENT_WORKFLOW) | 1 (grep vacío) | "sin ignorados sensibles"; el comando funciona y no lista `.env.example` |

### Casos P (efectivos, dentro del subagente)

| Caso | Resultado observado |
|---|---|
| P-R1 Read `.env.local` (inexistente) | Denegado por permisos (no "no existe") |
| P-R2 `cat .env.local` | Denegado por permisos |
| P-R3 Read y `cat .env.example` | Éxito: 4 líneas (2 comentarios, 2 variables sin valor) |
| P-R4 Grep con `path` `.env.local` | Denegado por permisos |
| P-W1 Write `secrets/fictitious.txt` | Denegado por permisos; `secrets/` no existe después |
| P-B1 `git push nonexistent-remote-for-test` | Denegado antes de ejecutar |
| P-B2 `git reset --hard nonexistent-ref-for-test` | Denegado |
| P-B3 `git clean -n` | Denegado |
| P-B4 `rm -rf nonexistent-dir-for-test` | Denegado |
| P-B5 `git merge nonexistent-branch-for-test` | Denegado |
| P-B6 `supabase db push` | Denegado por permisos (no "command not found") |
| P-B7 lista legítima (`git status`, `diff --stat`, `log -1`, `ls-files`, `check-ignore -v .env`, `check-attr`, `node -e`, `node --version`, `pnpm --version`, `claude --version`, `ls`, `grep -c`) | Todos ejecutados, sin denegación |
| Extra: comando compuesto con un `ls secrets` final | Denegado entero: la regla Read sobre `secrets/**` también alcanza a `ls` y el compuesto se evalúa por partes |
| Extra: `rm -rv nonexistent-dir-for-test` (inocuo, objetivo inexistente) | **No denegado**: se ejecutó ("No such file", exit 1). Ver POST-04 |
| Extra: `git config --get user.name`, `curl --version`, `git stash list`, `git add -n <archivo>` (todos coinciden con reglas `ask`) | Se ejecutaron sin denegación ni prompt observable. Ver POST-03 |

## 3. Resultado por criterio

Leyenda: PASS, FAIL, BLOCKED, N.A. (no aplicable a Testing: tipo E).

### Bloque G

| AC | Res. | Evidencia |
|---|---|---|
| G01 | PASS | `git diff --name-only HEAD` (15) y sin rastrear (3 nuevos + informes) ⊂ lista cerrada |
| G02 | PASS | HEAD `86611a8f…`, staged vacío, rama `chore/project-foundation` |
| G03 | PASS | CHALLENGE, TASK-001 y PRE con hash idéntico |
| G04 | PASS | Ningún archivo de scaffold; ningún comando de instalación en el diff |
| G05 | BLOCKED | No he recibido el informe literal de Develop (solo el resumen del Orchestrator, autoinformado). No puedo verificar tabla de líneas eliminadas, comandos con exit code, orden y herramientas declarados |
| G06 | PASS | B.7: cero coincidencias en el diff y en los archivos nuevos |

### Bloque A

| AC | Res. | Evidencia |
|---|---|---|
| A01 | PASS | AGENT_WORKFLOW.md:48-60 (seis comandos, qué comparar, dónde registrar, High) y CLAUDE.md:12 (los cuatro comandos y "ignorados sensibles" por referencia). Ver POST-12 |
| A02 | PASS | AGENT_WORKFLOW.md:39-43 (listas permitidos/prohibidos y devolución a Orchestrator); develop.md:21-22; testing.md ("lista permitida del handoff") |
| A03 | PASS | Tabla única en TESTING_GUIDELINES.md:44-55; develop.md:28-34 y testing.md:20-26 la repiten sin variaciones. Ver POST-11 |
| A04 | PASS | TESTING_GUIDELINES.md:55, AGENT_WORKFLOW.md:62 ("Pruebas independientes"), develop.md:34, testing.md "Después de Develop" (`.skip`, `.only`, `xit`, `xtest`, `.todo`) |
| A05 | PASS | testing.md "Alcance de escritura" (src/, migraciones, package.json, lockfiles, CI, `.claude/**`, CLAUDE.md, AGENTS.md, docs fuera de `docs/reviews/claude/` y `tests/**`; frase de "no es aislamiento técnico") |
| A06 | PASS | develop.md:21-26: prohibido siempre y prohibido salvo lista, con todas las categorías del criterio |
| A07 | PASS | TEMPLATE.md: todas las etiquetas del criterio presentes; testing.md "Informe" alineado |
| A08 | PASS | TESTING_GUIDELINES.md:31-40 con definiciones y efecto; referenciada desde testing.md, TEMPLATE.md y AGENTS.md; sin "Alta/Media/Baja" fuera de los históricos |
| A09 | PASS | Grep sin resultados fuera de `docs/reviews/claude/` |
| A10 | PASS | Párrafo de veredicto idéntico en testing.md, TESTING_GUIDELINES.md, AGENTS.md y TEMPLATE.md (grep del texto completo: 1 coincidencia en cada uno) |
| A11 | PASS | AGENT_WORKFLOW.md:73, README de `claude/` y de `codex/`, testing.md "Ubicación" |
| A12 | PASS | Frases clave intactas (un solo escritor, mismo workspace, dos ciclos sin progreso, no confundir tests de Develop con revisión independiente) |

### Bloque B

| AC | Res. | Evidencia |
|---|---|---|
| B01 | PASS | JSON válido; `$schema` correcto; claves `$schema`, `disableClaudeAiConnectors`, `permissions` |
| B02 | PASS | `defaultMode: default`, `disableBypassPermissionsMode: disable`, `allow` ausente, sin `bypassPermissions`/`acceptEdits`/`auto`/`dontAsk` |
| B03 | PASS | Apéndice A (10 rutas Read denegadas); además `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.git-credentials`, `~/.npmrc` (settings.json:31-35, revisadas a mano) |
| B04 | PASS | S: Apéndice A. P: Read y `cat .env.example` devuelven las 4 líneas |
| B05 | PASS | Sin duplicados ni vacías; reglas MCP sin paréntesis; PowerShell con la forma `PowerShell(...)`. Las 3 "mal formadas" de B.1 son el defecto POST-09 del verificador |
| B06 | PASS | Todo deny obligatorio con y sin argumentos; `git remote` por subcomandos (add, set-url, remove, rm, rename) en deny; recomendados en `ask` presentes; justificación en SECURITY.md:16-17. Casos P-B1..B6 denegados. Variantes sueltas de `rm -r`: POST-04 |
| B07 | PASS | Equivalentes PowerShell presentes; `Remove-Item -Recurse|-r|-Force`, `rd|rmdir|del /s`, `Format-Volume` en deny; `Invoke-WebRequest|Invoke-RestMethod|iwr|irm` en ask; saltos `powershell|pwsh|cmd` (y `.exe`) en ask desde Bash. Alias de PowerShell: POST-05 |
| B08 | PASS | S y P: lista legítima ejecutada sin denegación; ningún comando de B08 en deny. Prompts no observables (POST-03) |
| B09 | PASS | Ver la valoración de DH-12 en la sección 5. `disableClaudeAiConnectors: true`; deny por servidor con justificación en SECURITY.md:23; sin paréntesis; no existe `.mcp.json`; sin tocar `~/.claude.json` |
| B10 | PASS | Frontmatter correcto (B.2); `disallowedTools: mcp__*`; sin `mcpServers`, `hooks` ni `permissionMode`; `tools` sin ampliar; PowerShell fuera de `tools`. La sintaxis de `disallowedTools` descansa en los hechos oficiales aportados por Orchestrator (no verificables por Testing sin red) |
| B11 | PASS | Apéndice A (Edit denegado: `.env`, `.env.local`, `.env.production`, `secrets/**`, `.claude/settings.local.json`; permitido: `.env.example`); P-W1 denegado. Develop cita la fuente en SECURITY.md:11 como hechos aportados por Orchestrator |
| B12 | PASS | `~/.claude/settings.json` sin cambios; no existen los demás; informe de Develop no visto (G05) |
| B13 | PASS | SECURITY.md:8 conservada; SECURITY.md:28-29 y AGENT_WORKFLOW.md:65 ("Límites de las reglas de permisos") enumeran las evasiones |
| B14 | PASS | SECURITY.md:31-32 y AGENT_WORKFLOW.md:9-34 (reinicio, `/permissions`, `/status`, `/mcp`, `/context`, `claude doctor`, `~/.claude.json` global) |
| B15 | N.A. (E) | Validación efectiva humana tras reinicio; ver sección 7 |
| B16 | BLOCKED | Evidencia indirecta favorable: el orden de modificación en disco es documentos, `.gitignore`/`.gitattributes`/READMEs, agentes (12:49:33-39), SECURITY.md (12:51:26) y `settings.json` el último (12:51:33). Pero no puedo verificar el orden declarado ni los exit codes sin el informe de Develop |

### Bloque C

| AC | Res. | Evidencia |
|---|---|---|
| C01 | PASS | Grep sin resultados. Ver la valoración C01/C02 (sección 5) |
| C02 | PASS | AGENT_WORKFLOW.md:9-34: todos los elementos (comandos, quién ejecuta cada uno, variables con formas Git Bash y PowerShell, precedencia, recarga, aviso del asistente, no existe comando que liste herramientas). Precedencia coincide con los hechos aportados |
| C03 | PASS | CLAUDE.md:8-12 y :20; modelo objetivo y prohibiciones intactos |
| C04 | PASS | TESTING_GUIDELINES.md:57-60 y referencia desde AGENT_WORKFLOW.md:79 |
| C05 | PASS | TC-TEAM-01..11 (TESTING_GUIDELINES.md:94-107) |
| C06 | PASS | TC-ARCH-01..05; DH-04..DH-06 pendientes |
| C07 | PASS | TC-ORD-03, TC-CANC-01..06; DH-02 pendiente |
| C08 | PASS | TC-EVT-01..09; mapeo F4/F6; DH-08. Ver POST-12 |
| C09 | PASS | BUSINESS_RULES.md:14-33: cada punto ambiguo con DH-xx; reglas derivadas de BR01-BR03; la "misma transacción" interpreta "de forma consistente" (POST-12) |
| C10 | PASS | TESTING_GUIDELINES.md:71-86 con todos los umbrales y la distinción automático/manual |
| C11 | PASS | TESTING_GUIDELINES.md:88 y ROADMAP.md:30; sin `package.json` |
| C12 | PASS | ROADMAP.md:21-61 con cada término en su fase; puntero desde ARCHITECTURE.md:17 (con la errata POST-08) |
| C13 | PASS | TESTING_GUIDELINES.md:65; umbral sin inventar (DH-09) |
| C14 | PASS | TESTING_GUIDELINES.md:68 y testing.md:15 |
| C15 | PASS | TEMPLATE.md (sección de validación) y STATUS.md:11-12 |
| C16 | PASS | Con POST-01 (Low) y POST-10: una afirmación de verificación por el Orchestrator pendiente de confirmar |

### Bloques D, E y N

| AC | Res. | Evidencia |
|---|---|---|
| D01 | PASS | B.3 sin discrepancias; solo líneas añadidas |
| D02 | PASS | S y P (repositorio temporal): `text=auto eol=lf`, binarios marcados, `*.bat|*.cmd` con CRLF; 20 `i/lf`; sin modificaciones espurias; sin `--renormalize` |
| D03 | PASS | Ambos README con todos los puntos exigidos; `codex/` contiene solo su README; no están ignorados |
| D04 | PASS | STATUS.md: fecha, rama, SHA base, F0 completada, 2.1.327 verificado, F1 en curso, TASK-001 BLOCKED preliminar con enlace, TASK-002 "pendiente de Testing POST", G1 no aprobado, Codex no realizado, esfuerzo no verificable, validaciones efectivas pendientes, D1 pendiente |
| D05 | PASS | Filas de la tabla de ROADMAP sin cambios (`git diff` solo añade texto bajo la tabla) |
| D06 | PASS | Igual que G04 |
| D07 | PASS | `git diff --quiet HEAD -- .editorconfig README.md .env.example`: exit 0 |
| E01 | BLOCKED | Lista cerrada respetada (verificado), pero no he visto la justificación individual por archivo de agentes/directrices |
| E02 | PASS | CHALLENGE.md idéntico (diff exit 0 y sha256) |
| E03 | BLOCKED | (ii) Cadenas protegidas: PASS. (i) Revisión independiente de las 24 líneas eliminadas: todas están sustituidas por texto igual o más estricto (p. ej. "defectos altos/críticos" pasa a "hallazgos Critical/High"; "Menores… requieren aceptación humana" se conserva ampliada; `Read(./.claude/settings.local.json)` se conserva con coma). No encuentro reducción. Falta cruzarlas con la tabla de Develop, que no he recibido |
| E04 | PASS | develop.md conserva la prohibición permanente (develop.md:18 y 21-26) sin cláusula de excepción; la excepción consta solo como histórica (STATUS.md:9) |
| E05 | PASS | STATUS y documentos: sin PASS, sin G1 aprobado, sin Codex realizado (informe de Develop no visto) |
| N01 | PASS | Las cuatro reglas previas siguen literales (settings.json:8-11) y cubiertas |
| N02 | PASS | B.2: `name`, `model`, `effort` intactos; texto contractual previo conservado |
| N03 | PASS | B.5 |
| N04 | PASS | Gravedad, veredictos, rutas de evidencias y nombres coherentes (greps A08..A10) |
| N05 | PASS | `.env.example` legible, sin bypass, CHALLENGE y TASK-001 intactos |

Recuento: 62 PASS, 4 BLOCKED (G05, B16, E01, E03), 1 N.A. (B15, tipo E) = 67. FAIL: 0.

## 4. Hallazgos nuevos

Gravedad según TESTING_GUIDELINES.md. Ninguno incumple un criterio aprobado; todos (salvo POST-03, provisional) se listan para aceptación humana explícita y registrada.

| ID | Gravedad | Archivo/línea | Reproducción | Esperado / obtenido | Criterio | Estado |
|---|---|---|---|---|---|---|
| POST-01 | Low (sube a Medium si el Orchestrator no lo confirma) | docs/AGENT_WORKFLOW.md:27 | Leer la frase "Orchestrator comprobó en TASK-002 que ninguna de las dos variables está definida y que no pasa parámetro `effort`" | Esperado: toda afirmación de una verificación ejecutada tiene registro que la respalde. Obtenido: no consta en TASK-001 ni en el handoff que he visto. Mi comprobación (`printenv`, exit 1) la corrobora solo para el entorno del subagente, grado autoinformado. Además es un hecho puntual dentro de un documento normativo | C16; CLAUDE.md "No afirmar resultados no ejecutados" | Abierto: el Orchestrator confirma y lo registra en su nota de la tarea, o se reformula como acción pendiente |
| POST-02 | Medium | .claude/settings.json:3 y 237-239; docs/SECURITY.md:23-25 | Esta invocación aún recibe el texto de instrucciones de varios servidores MCP (conectores de la cuenta, documentación de bibliotecas, Supabase, Notion, Google) además de `computer-use` | Esperado: sin superficie MCP en la conversación principal antes de G1. Obtenido: solo tres servidores tienen deny; los conectores de cuenta dependen de `disableClaudeAiConnectors`, que según el Orchestrator aún no ha surtido efecto (requiere reinicio) y cuyos nombres de herramienta son desconocidos. Mientras tanto, una herramienta de BD remota (p. ej. Supabase) podría ser invocable desde la conversación principal | B09 (cumple su redacción, con la justificación de DH-12); B15 (E) | Abierto: decisión humana sobre DH-12 y validación efectiva tras reinicio (`/mcp`, `/context`) |
| POST-03 | Medium (provisional; High si se confirma que no hubo prompt) | .claude/settings.json:241-384 (`ask`); docs/SECURITY.md:17 | Desde el subagente: `git config --get user.name`, `curl --version`, `git stash list` y `git add -n docs/reviews/claude/README.md` (coinciden con `Bash(git config *)`, `Bash(curl *)`, `Bash(git stash *)`, `Bash(git add *)`) | Esperado: un prompt de confirmación (o una denegación visible). Obtenido: se ejecutaron sin que yo observe ningún prompt. Puede haber aprobación invisible del arnés o que `ask` no actúe en subagentes; no puedo distinguirlo. Si fuese lo segundo, DH-10 (no commit sin autorización) descansaría solo en el contrato textual | B06 (recomendación `ask`), B08, DH-10 | Abierto: el Orchestrator indica si aparecieron prompts para esos cuatro comandos; el humano lo confirma con `/permissions` |
| POST-04 | Low | .claude/settings.json:129-146 | `rm -rv nonexistent-dir-for-test` (objetivo inexistente) | Esperado: "variantes" de `rm -r` denegadas. Obtenido: se ejecutó. Cubiertas: `-rf`, `-fr`, `-r`, `-R`, `-Rf`, `-fR`, `-f -r`, `-f -R`, `--recursive`; sin cubrir: `-rv`, `-vr`, `-rfv`, `-rI`, `-dr`… Ya declarado como fragilidad conocida (SECURITY.md:29) | B06 (parte de "variantes"), B13 | Abierto: aceptar o ampliar la lista |
| POST-05 | Low | .claude/settings.json:223-234 | Revisión de la lista PowerShell | Esperado: equivalente PowerShell de `rm -r`. Obtenido: `Remove-Item` se cubre por nombre; los alias `rm`, `ri`, `del`, `rd`, `erase` con `-r`/`-Recurse` y el orden `Remove-Item -Path x -Recurse` no coinciden con reglas por prefijo. `PowerShell(Remove-Item *)` en ask lo mitiga solo para el nombre completo | B07 (cumple lo enumerado), B13 | Abierto |
| POST-06 | Informational | .claude/settings.json:107-128, 288-299 | Revisión de cobertura Supabase y GitHub | Sin regla para `supabase migration up --linked`, `supabase branches` (puede facturar), `supabase functions delete`, `gh issue`/`gh run`. `gh api` y `supabase db dump` están en ask. No exigido por el criterio | B06 | Informativo |
| POST-07 | Informational | .claude/settings.json:255, 259 y 251 | `git config --get`, `git stash list`, `git restore` en ask | Las reglas `ask` alcanzan también a variantes de solo lectura (`git config --get`, `git stash list`). Puede producir prompts innecesarios si `ask` se aplica | B08 | Informativo (ligado a POST-03) |
| POST-08 | Informational | docs/ARCHITECTURE.md:17 | `grep -n support docs/ROADMAP.md` (sin resultados) | ARCHITECTURE afirma que los pendientes, incluida la "propiedad de tests/support", están "registrados por fase en ROADMAP.md". ROADMAP no la lista y TESTING_GUIDELINES.md:52 ya la define como compartida | C12, N04 | Abierto (errata) |
| POST-09 | Informational | PRE Apéndice B.1 (defecto mío) | B.1 marca `mcp__computer-use__*`, `mcp__claude-in-chrome__*`, `mcp__scheduled-tasks__*` como "mal formadas" | Falso positivo del verificador: su regex `[\w*]` no admite el guion de los nombres de servidor. Las reglas son válidas. No se penaliza. Corrección para RETEST: `^[A-Za-z_][\w*-]*(\(.+\))?$` | B05 | Cerrado (sin acción de Develop) |
| POST-10 | Informational | docs/SECURITY.md:23 | Lectura | La premisa de DH-12 (un deny global `mcp__*` bloquearía herramientas MCP internas de la aplicación) es una observación del Orchestrator, no verificada por Testing; el texto la presenta como hecho | C16 | Informativo |
| POST-11 | Informational | docs/TESTING_GUIDELINES.md:46-53; develop.md:28-34; testing.md:20-26 | Lectura | `tests/unit/**` (Develop) contiene `tests/unit/independent/**` (Testing). La tabla lo resuelve por fila pero no enuncia que la regla más específica prevalece | A03 | Informativo |
| POST-12 | Informational | docs/BUSINESS_RULES.md:32, 34-47; TESTING_GUIDELINES.md:140-147; CLAUDE.md:12 | Lectura | (a) La matriz dice "misma transacción" donde BR03 dice "de forma consistente" (lo pedía mi PRE en C07/C08, pero conviene marcarlo como interpretación). (b) TC-EVT-01..08 usan campos y eventos de la propuesta DH-08 sin estar marcados como condicionados. (c) La columna "Propuesta de Develop (no aprobada)" no estaba pedida; está rotulada y no decide nada. (d) CLAUDE.md remite al detalle de "ignorados sensibles" a AGENT_WORKFLOW.md. (e) DH-13 es una ambigüedad real detectada por Develop (PRD: alta con técnico frente a flujo que asigna después); debe adoptarla el Orchestrator como DH formal | C08, C09, A01 | Informativo |
| POST-13 | Informational | docs/SECURITY.md (escrito 12:51:26) | `stat` | SECURITY.md se modificó después de los agentes y antes de `settings.json`; el orden 3.4 pedía documentos, agentes, settings. Sin consecuencia | B16 | Informativo |

## 5. Valoraciones solicitadas

**DH-12 y AC-B09.** El criterio admite literalmente `mcp__*` "o `mcp__<servidor>__*` por servidor, con la justificación de DH-12", y la variante por servidor está justificada en SECURITY.md:23. Por tanto cumple AC-B09 en su redacción: **PASS, no FAIL**. No es BLOCKED, porque la parte no verificable se aísla en B15 (tipo E). Dejo constancia de dos matices que no cambian el veredicto: (1) la protección de la conversación principal frente a conectores de cuenta queda pendiente del reinicio (POST-02), y mi PRE apuntaba a deny global por defecto, de modo que esta variante es una relajación que debería ratificar el humano; (2) la premisa que la motiva es una observación no verificada (POST-10). Evidencia efectiva a favor: la notificación de herramientas retiradas de `computer-use`, `claude-in-chrome` y `scheduled-tasks` es del Orchestrator (observación en sesión). En mi propia invocación no hay ninguna herramienta `mcp__` invocable, pero ya no se podría distinguir si lo causa `tools`, `disallowedTools` o el deny.

**Falso positivo de B.1.** Confirmado (POST-09), defecto de mi verificador. No penalizado.

**Tensión C01/C02.** Aceptable. La redacción "el comando `agents` precedido de barra" (AGENT_WORKFLOW.md:10) cumple el contenido exigido por C02 (documentar que el asistente solo muestra un aviso y no sirve para verificar) sin presentar el comando como paso de verificación, que es lo que prohíbe C01. El criterio se formuló de forma literal en exceso; para RETEST propongo que C01 excluya expresamente esa única frase explicativa, sin reducir su alcance.

**Variante "por servidor" frente a los hechos de la sesión.** Véase POST-02.

## 6. Trazabilidad con TASK-001 y PRE

| ID | Resolución verificada (archivo:línea) | Estado |
|---|---|---|
| TST-01 | AGENT_WORKFLOW.md:39-43, 48-62; CLAUDE.md:8,12; hooks no incluidos (AGENT_WORKFLOW.md:68; DH-11) | Resuelto; residual (d) aceptado |
| TST-13 | settings.json:53-240 (Bash y PowerShell); SECURITY.md:16-18, 28-29 | Resuelto; residual (d) documentado. Ver POST-04/05 |
| TST-14 | settings.json:8-52; SECURITY.md:14-15 | Resuelto; residual (d) documentado |
| TST-02 | TESTING_GUIDELINES.md:44-55; develop.md:28-34; testing.md:20-26 | Resuelto |
| TST-03 | develop.md:21-26 | Resuelto |
| TST-04 | TESTING_GUIDELINES.md:71-88; ROADMAP.md:30, 46 | (b) resuelto; (c) F2/F3/F4/F7 pendiente |
| TST-05 | TESTING_GUIDELINES.md:31-40, 65; ROADMAP.md:31 (DH-09) | (b) resuelto; umbral en F2 |
| TST-06 y TST-16 | TESTING_GUIDELINES.md:57-60; AGENT_WORKFLOW.md:79 | Resuelto |
| TST-07 | TESTING_GUIDELINES.md:135-147; BUSINESS_RULES.md:51 | (b) resuelto; (c) F4/F6 |
| TST-08 | TESTING_GUIDELINES.md:94-133; BUSINESS_RULES.md:14-47 (DH-01..08, DH-13) | (b) resuelto; decisiones humanas pendientes |
| TST-09 | settings.json:3, 237-239; develop.md:7, testing.md:7; SECURITY.md:21-27 | Resuelto en configuración; efectividad pendiente (E). POST-02 |
| TST-10 | AGENT_WORKFLOW.md:73; README de `claude/` y `codex/` | Resuelto |
| TST-11 | TESTING_GUIDELINES.md:68; testing.md:15 | Resuelto; runner en F2 |
| TST-12 | AGENT_WORKFLOW.md:9-34 | (b) resuelto; efectividad pendiente (E) |
| TST-15 | .gitignore:25-39 | Resuelto (B.3 sin discrepancias) |
| TST-17 | ROADMAP.md:36, 49 | Registrado como pendiente (F3 y F5) |
| TST-18 | .gitattributes:2 | Resuelto (prueba en repositorio temporal) |
| D1 | ROADMAP.md:39; STATUS.md:13 | Registrado (F3 preflight) |
| D2 | SECURITY.md:13 (sin allowlist, justificada) | Resuelto |
| D3 | AGENT_WORKFLOW.md:68 y SECURITY.md (contrato más diff; hooks pendientes DH-11) | Aceptado como (d) |
| D4 | ROADMAP.md:38, 50, 54 | Registrado (F3, F5/F6) |
| D5 | STATUS.md:5 | Resuelto |
| D6 | TEMPLATE.md:20 | Resuelto |
| `/agents` | AGENT_WORKFLOW.md:10 y 9-34; CLAUDE.md:20 | Resuelto |

Cada hallazgo de TASK-001 tiene resolución o tarea futura con ubicación. Ninguno queda sin tratar.

## 7. Validación estática, efectiva parcial y efectiva pendiente

**Validación estática (hecha):** G01-G04, G06, A01-A12, B01-B03, B05-B07, B09-B14, C01-C16, D01-D07, E02, E04, E05, N01-N05; verificador del Apéndice A; B.1-B.7; repositorio temporal para `.gitattributes`; trazabilidad.

**Validación efectiva parcial en subagente (hecha):** denegación de Read, Grep, Write y `cat` sobre rutas sensibles; legibilidad de `.env.example`; denegación de `git push`, `git reset --hard`, `git clean`, `rm -rf`, `git merge` y `supabase db push`; comandos legítimos sin denegación; ausencia de herramientas MCP y PowerShell en la lista de este subagente (autoinformado). Las reglas PowerShell no se pudieron ejecutar (el subagente no tiene la herramienta).

**Validación efectiva pendiente (humano o reinicio; prerrequisito de G1, no del cierre de TASK-002, según DH-00 decidido por Orchestrator y sujeto a revisión humana):**

| Qué | Responsable |
|---|---|
| `/permissions`: reglas con origen proyecto (incluidas `ask`) | Humano |
| `/status`: `.claude/settings.json` en Setting sources | Humano |
| `claude doctor`: sin entradas rechazadas | Humano, terminal |
| `/mcp` y `/context`: sin conectores claude.ai ni definiciones MCP tras reiniciar | Humano |
| `/tasks`: modelo y esfuerzo reales de ambos subagentes | Humano |
| `claude --debug`: sin campos no reconocidos en los agentes | Humano, terminal |
| Carga real de `develop.md` con una invocación trivial posterior | Orchestrator |
| Reglas PowerShell en la conversación principal | Orchestrator o humano |
| Si aparecieron prompts para los comandos `ask` de POST-03 | Orchestrator y humano |

## 8. Qué falta para desbloquear

1. **Informe literal de Develop** (o su extracto saneado) con: lista cerrada y autorización citadas; justificación individual por archivo de agentes y directrices (archivo, líneas, hallazgo, necesidad, "sin reducción"); tabla de líneas eliminadas o reemplazadas con motivo; comandos con exit code; orden de trabajo; herramientas visibles en su sesión; checks no ejecutados. Con él cierro G05, B16, E01 y E03(i).
2. **POST-01:** el Orchestrator confirma (o retira) la afirmación de AGENT_WORKFLOW.md:27.
3. **POST-03:** el Orchestrator indica si hubo prompts para los cuatro comandos `ask`.

Correcciones de código exigidas a Develop para desbloquear: **ninguna** hasta ver el informe. Corrección menor recomendada (Informational/Low, a decidir por el humano): POST-08 (errata de ARCHITECTURE.md:17), POST-01 si no se confirma, POST-04/05 si se quiere cerrar variantes. Si el informe de Develop es completo y no aparecen nuevos defectos, el RETEST no requeriría cambios de código y el veredicto esperable sería PASS con los hallazgos Medium/Low/Informational pendientes de aceptación humana explícita.

## 9. Limitaciones y checks no ejecutados

- Sin red: no se verificó la documentación oficial (permisos, subagentes, sintaxis `disallowedTools`); se usan los hechos aportados por Orchestrator.
- No se ejecutó ningún comando interactivo de la CLI (`/status`, `/permissions`, `/mcp`, `/context`, `/tasks`, `claude doctor`, `claude --debug`).
- No se probaron las reglas PowerShell, ni `Edit` sobre archivos distintos de `secrets/`, ni los deny de comandos remotos reales (`gh`, `vercel`) ni las reglas `~/…` (solo simulación y lectura).
- No se pudieron enumerar herramientas diferidas: este subagente no dispone de ToolSearch.
- El verificador del Apéndice A es una aproximación de la comparación de patrones; no sustituye a `/permissions`.
- El esfuerzo efectivo y el modelo de este subagente no son verificables desde dentro (grado autoinformado).
- Si los casos `ask` fueron aprobados fuera de mi vista, no puedo saberlo (POST-03).

## 10. Veredicto

**BLOCKED.** Hallazgos abiertos: POST-01 (Low), POST-02 (Medium), POST-03 (Medium provisional), POST-04 y POST-05 (Low), POST-06..POST-13 (Informational salvo POST-09, cerrado). Ningún hallazgo Critical/High; ningún FAIL. BLOCKED no se convierte en PASS sin la evidencia de la sección 8.

Iteraciones: 1 (POST). Aceptación humana de los hallazgos Medium/Low/Informational: pendiente.
