# TASK-003-PRE — Criterios para cerrar AUD-01 a AUD-05

TASK-ID / GATE: TASK-003 (cierre de hallazgos de la auditoría independiente AUDIT-001) / prerrequisito de G1
Fase: PRE
Fecha: 2026-11-24

Alcance: exclusivamente AUD-01 a AUD-05 de [AUDIT-001](../codex/AUDIT-001.md). No es una auditoría nueva ni añade endurecimientos. Referencia de proceso: [TASK-002-PRE](TASK-002-PRE.md), [RETEST](TASK-002-RETEST.md) y [RUNTIME](TASK-002-RUNTIME.md). Este documento define criterios; no es evidencia de cumplimiento.

## Agente, modelo y esfuerzo
Agente: Testing (subagente nativo), invocado por Orchestrator.
Modelo solicitado / efectivo / fuente: `sonnet` (frontmatter, hash de `testing.md` sin cambios respecto a RETEST) / `claude-sonnet-5-5` / autoinformado (descripción del propio arnés).
Esfuerzo solicitado / efectivo / fuente: `high` (frontmatter) / **no verificable**. Observación autoinformada: mi contexto incluye un marcador `reasoning_effort` con valor 10 (escala no documentada), compatible con el esfuerzo bajo que ya autoinformó Testing en RUNTIME (RV-03) y que no permite afirmar `high` como efectivo.
Grado de evidencia: modelo autoinformado; esfuerzo no verificable.

Herramientas invocables (autoinformado): Read, Glob, Grep, Edit, Write y Bash (Git Bash). Sin PowerShell, Agent, ToolSearch ni ninguna herramienta `mcp__*` en mi lista. Mi contexto recibe instrucciones de siete bloques de servidores MCP (documentación de bibliotecas, Google Docs, Claude Docs, Google Sheets, Supabase, Notion y computer-use), sin esquemas de herramientas. El mensaje de sistema menciona "herramientas diferidas" pero no lista ninguna, y no dispongo de ToolSearch para enumerarlas: no puedo afirmar que no existan, solo que no figuran en mi lista. No invoqué nada remoto. Esta es la línea base de C01-03 para Testing, previa a la desactivación de conectores.

## Git
Rama: `chore/project-foundation`
SHA base: `86611a8fc62dcf1c8a34af18a817fac55368ae91`
SHA o diff final: sin commit; árbol de trabajo con cambios de TASK-002 sin integrar.
Estado Git antes: HEAD `86611a8f…`; índice vacío (`git diff --cached --name-only` sin salida); 15 `M` y 12 `??` (27 rutas): las 15 `M` de TASK-002 más `.gitattributes`, `docs/reviews/claude/{README, TASK-001, TASK-002, TASK-002-DEVELOP-1, TASK-002-DEVELOP-2, TASK-002-POST, TASK-002-PRE, TASK-002-RETEST, TASK-002-RUNTIME}.md` y `docs/reviews/codex/{AUDIT-001, README}.md`.
Estado Git después: el mismo más `?? docs/reviews/claude/TASK-003-PRE.md` (28 rutas); HEAD e índice sin cambios (verificado al cierre, sección "Comandos").

## Archivos modificados
`??` | `docs/reviews/claude/TASK-003-PRE.md` | único archivo creado, autorizado por Orchestrator. Ningún otro archivo modificado. `git diff --stat`: sin cambios en archivos versionados por esta fase.

## Entorno
Windows 11, Git Bash. Claude Code 2.1.331 según RUNTIME (no reverificado en esta fase). `tests/`, `src/` y `package.json` no existen.

## Línea base (hashes a 2026-11-24, sha256 completo de los informes históricos)
Sirve para comprobar en POST que lo prohibido no cambió. Se calculó con `sha256sum` sobre el árbol de trabajo actual.

| Ruta | sha256 |
|---|---|
| `docs/reviews/claude/TASK-002-PRE.md` | `1491632dbd03c38b7c788a6adfe10e8fec2529e1b3b64c3102e0904271f3b581` (coincide con el valor citado en RETEST) |
| `docs/reviews/claude/TASK-002-POST.md` | `0d96dc9b008978796a6e5793cec859036e08290b894bbc56104801fc09673d42` |
| `docs/reviews/claude/TASK-002-RETEST.md` | `efc0cce4f910f57e79664080c994f1f400d5beb902ca6c7c38b5d5fd0da74591` |
| `docs/reviews/claude/TASK-002-RUNTIME.md` | `a2c185acf3eadfc62a9d692dac403518adb2391d2b0ee85e93f7c810e8c8b5e7` |
| `docs/reviews/claude/TASK-002-DEVELOP-1.md` | `c86f77478b396f3ec0042551f04d1057f5addb1e3561439142be789c00275330` |
| `docs/reviews/claude/TASK-002-DEVELOP-2.md` | `0af60f87eacbcdd5ef3deebec19c79de1c46713c492f26a9b79bb8266eb8a8b7` |
| `.claude/settings.json` | `d065240c67e63d5fee364873cbc7e4d16922cac86ab1608ab180e7831fec7f32` (igual que RETEST y RUNTIME) |
| `.claude/agents/develop.md` | `0455046c4c194b1cb3b2086d3b8755bbc5a2c04e868c74b5b615637bcb255af3` |
| `.claude/agents/testing.md` | `1d3ddc166961a62c4dd96a84d2da12bf722e389dc21ccd7838ab55aaa8f58fd1` |

Prefijos sha256 (16 caracteres) de otros archivos protegidos o de referencia: `CHALLENGE.md` `502379b17d4fe2eb`; `TESTING_GUIDELINES.md` `5db63218777cdb5b`; `reviews/TEMPLATE.md` `a533cc846d9fa038`; `CLAUDE.md` `590797dcc461cc6b`; `AGENTS.md` `c5a29b9b385033ce`; `TASK-001.md` `57ddf6253cd62b50`; `codex/AUDIT-001.md` `1f6c1ba29429b2bd`. Previos a edición, para el diff de Develop: `AGENT_WORKFLOW.md` `d0ffcfbb54df3b0a`; `ROADMAP.md` `6542291b2b3a4ed7`; `SECURITY.md` `2af321b5ea7b20a3`; `STATUS.md` `4d6972e4b5a36207`.

Hechos de línea base relevantes para los criterios:
- `.claude/settings.local.json` existe (4429 bytes, mtime 2026-11-24 14:53:44; solo metadatos, **no leí su contenido**) y está ignorado por `.gitignore:21`. El filtro actual de AGENT_WORKFLOW.md (`grep -E '(^|/)(\.env[^/]*|secrets/?)$'`) responde "sin ignorados sensibles" con exit 0 aunque `git ls-files --others --ignored --exclude-standard --directory` lista ese archivo. Es la parte comprobable de AUD-04.
- `git diff --check HEAD`: exit 0 (sin errores de espacios).
- Un manifiesto `git hash-object` de las 27 rutas no ignoradas del árbol (nombres y hashes, sin leer ignorados) se genera con exit 0, es determinista entre dos ejecuciones y no incluye `settings.local.json`. Demuestra que el procedimiento de AUD-04 es viable en este entorno.

## Criterios

Convenciones.
- Grado de evidencia esperado. **Directa**: salida de herramienta, comando o archivo observada por quien registra (equivale a "verificado por CLI" del vocabulario heredado; ver C05-02). **Directa-humana**: lo observa el humano en la interfaz y lo confirma por escrito; el registrante la transcribe con cita. **Autoinformada**: la declara el agente sobre sí mismo. **No verificable**: no existe comprobación disponible.
- Responsable: quién ejecuta o registra. Testing no aprueba G1, no sustituye decisiones humanas y no modifica nada fuera de sus informes.
- Estados de resultado por hallazgo en POST: **RESOLVED** (todos sus criterios cumplidos con la evidencia exigida); **OPEN** (falta, falla o no se ha podido ejecutar algún criterio); **ACCEPTED DEVIATION** (el humano aceptó por escrito, citado y fechado, un incumplimiento concreto; ver "Agregación").
- Condición común: ninguna herramienta remota se invoca; ningún secreto ni contenido de `.claude/settings.local.json`, `~/.claude*` o `.env*` se lee ni se registra; los registros solo llevan nombres, hashes y extractos saneados.

### AUD-01 — Conectores externos (High)

| ID | Qué verifica | Cómo | Responsable | Grado esperado |
|---|---|---|---|---|
| C01-01 | El humano desactivó los conectores innecesarios y la comprobación se hizo en una sesión posterior a ese cambio | El humano desactiva los conectores (menú `+` del compositor > Connectors, según RUNTIME) y abre una sesión nueva o reinicia. Declara por escrito qué conectores dejó activos, solo por nombre, y que su alcance (sesión y valor por defecto de sesiones nuevas, no solo este proyecto) es aceptable. Orchestrator transcribe | Humano; registra Orchestrator | Directa-humana |
| C01-02 | Herramientas invocables en la sesión principal, sin llamarlas | Orchestrator lista los nombres de herramientas disponibles en su sesión, incluidas las diferidas, sin invocar ninguna, y cuenta las `mcp__*`. Las clasifica en tres columnas separadas: (a) servidor conectado (estado de conectores de la app), (b) instrucciones MCP presentes en el contexto, (c) herramienta invocable. Esperado: cero `mcp__*` invocables fuera de lo que el humano autorizó nominalmente en C01-01. Cualquier otra se registra con su nombre y el motivo concreto (límites L1 a L3 de RUNTIME) | Orchestrator | Directa (lista del arnés), con la columna (b) autoinformada |
| C01-03 | Herramientas invocables en Develop y Testing, en delegaciones reales posteriores al cambio | En su informe de la delegación, cada agente enumera sus herramientas invocables y si su contexto recibe instrucciones MCP, con las tres columnas de C01-02. Esperado: sin `mcp__*` invocable. Instrucciones MCP presentes sin herramientas se registran como Informational (RV-05), no como incumplimiento. Línea base de Testing: sección "Agente, modelo y esfuerzo" de este informe | Develop y Testing; recoge Orchestrator | Autoinformada. No existe comando que liste las herramientas efectivas de un subagente |
| C01-04 | Decisión humana sobre DH-12 con ese resultado | El humano escribe si ratifica DH-12 (variante por servidor, deny global o la que decida) o la mantiene pendiente con motivo. Orchestrator la registra. Testing no la decide | Humano; registra Orchestrator | Directa-humana |

Si persiste una herramienta externa no autorizada, el bloqueo se registra (nombre de herramienta, sesión, agente, causa) y **no** se amplían reglas deny ni ask: `.claude/settings.json` y los agentes conservan los hashes de la línea base (CX-02).

Condición de resultado:
- RESOLVED: C01-01 a C01-04 cumplidos y cero `mcp__*` invocables no autorizados en Orchestrator, Develop y Testing.
- OPEN: alguna `mcp__*` invocable no autorizada (verificada, por tanto incumplimiento de la restricción aprobada y High confirmado) o algún criterio sin evidencia (la falta de evidencia lleva a BLOCKED en el veredicto, ver "Agregación").
- ACCEPTED DEVIATION: no aplicable a una herramienta externa invocable no autorizada, porque es High. El humano puede decidir continuar a G1 con constancia, pero el veredicto de Testing seguirá siendo FAIL.

### AUD-02 — B16, recuento y limitaciones de G05/E01 (Medium)

El humano autorizó (cita literal, a reproducir en la adenda): "Autorizo aceptar el desvío histórico del orden de edición como excepción de procedimiento si Testing confirma que no produjo efectos perjudiciales. Esta excepción no convierte el criterio histórico incumplido en PASS."

| ID | Qué verifica | Cómo | Responsable | Grado esperado |
|---|---|---|---|---|
| C02-01 | La adenda existe y no altera la historia | Existe `docs/reviews/claude/TASK-002-ADDENDUM.md`, con fecha y sin contenido retroactivo ficticio. `sha256sum` de PRE, POST, RETEST, RUNTIME, DEVELOP-1 y DEVELOP-2 idéntico al de la línea base antes y después de escribirla; ninguna edición repetida para reconstruir el orden histórico. Testing registra los hashes antes y después | Testing | Directa |
| C02-02 | B16 rectificado y desvío documentado | La adenda cambia B16 de PASS a **FAIL (Medium)** con la razón verificable: AC-B16 exige respetar el orden de PRE 3.4 (documentos, agentes, `settings.json` al final) y `SECURITY.md` se editó después de los agentes en ambas iteraciones (POST-13: 12:51:26 frente a 12:49:33-39; RETEST sección 2: 13:26:27 frente a 13:14). Documenta: orden exigido, orden observado por iteración, la autorización humana citada, y que no convierte B16 en PASS. Para aplicar la excepción, Testing confirma con evidencia **registrada** (no con mtimes actuales, posteriores a más ediciones) que no hubo efectos perjudiciales: `settings.json` quedó último y `JSON.parse` exit 0 (RETEST sección 3), 45 comprobaciones del verificador exit 0, los dos comandos que las reglas nuevas denegaban fueron denegados antes de ejecutarse sin que Develop los eludiera, y los informes de Develop no registran un estado intermedio inconsistente o un bloqueo de flujo causado por el orden. Si encuentra un efecto perjudicial, la excepción no aplica y B16 queda FAIL sin ACCEPTED DEVIATION | Testing | Mixta: directa para lo releíble en los informes, autoinformada para lo que solo consta en el informe de Develop; se rotula cada una |
| C02-03 | Recuento y veredicto de RETEST corregidos | La adenda corrige el recuento sobre los 67 criterios (G 6, A 12, B 16, C 16, D 7, E 5, N 5). Con solo B16 rectificado: 65 PASS, 1 FAIL (B16), 0 BLOCKED, 1 N.A. (B15) = 67, y el veredicto agregado de RETEST pasa de PASS a **FAIL** (cualquier incumplimiento de un criterio aprobado es FAIL), con B16 en ACCEPTED DEVIATION si procede. Si C02-04 rectifica además G05 o E01, el recuento se ajusta con ellos. El informe RETEST original no se edita | Testing | Directa |
| C02-04 | Limitaciones de G05 y E01 aclaradas | La adenda contrasta, elemento por elemento, lo que AC-G05 y AC-E01 de PRE exigían (G05: TASK-ID, archivos, justificación individual por archivo de configuración o directriz, tabla de líneas eliminadas con motivo, comandos exactos con exit code, orden de trabajo, herramientas, no ejecutados y riesgos; E01: lista cerrada respetada y, por archivo, ruta, líneas, hallazgo, necesidad y "sin reducción") con lo que contienen DEVELOP-1 y DEVELOP-2, citando sección. Para cada elemento ausente (RETEST-01 ya señala rangos de línea solo para `develop.md` y comandos sin literal ni exit code individual) debe decidir sobre evidencia: elemento ausente = incumplimiento parcial documental, es decir criterio no PASS salvo que otro informe aportado en su momento lo cubra. El mapeo por diff del Anexo A de RETEST se declara como mitigación independiente, no como sustituto del informe de Develop | Testing | Directa |

Condición de resultado:
- RESOLVED: C02-01 a C02-04 cumplidos. Que B16 conste como FAIL o ACCEPTED DEVIATION no impide RESOLVED: lo que se cierra es la rectificación del registro, no el criterio histórico.
- OPEN: la adenda mantiene B16 en PASS, altera algún informe histórico, no cita la autorización, afirma "sin efectos perjudiciales" sin la evidencia de C02-02, o no desglosa G05/E01.
- ACCEPTED DEVIATION: solo el desvío de orden de B16, y solo con la autorización citada arriba más la confirmación de Testing. No existe autorización humana equivalente para G05/E01 ni para RV-02; si C02-04 los deja en FAIL, constituyen una **decisión humana nueva** (aceptar el incumplimiento documental o pedir la subsanación) que Orchestrator debe plantear. Testing no la presupone.

### AUD-03 — Prueba de `ask` bajo observación humana (Medium provisional, High si se confirma que no hay diálogo)

Comando único permitido en toda la prueba: `git add -n .gitattributes` (simulación: no modifica el índice). Ningún otro `git add`, ningún `commit`, y el humano elige **permitir una vez**, nunca "permitir siempre" ni una regla permanente.

| ID | Qué verifica | Cómo | Responsable | Grado esperado |
|---|---|---|---|---|
| C03-01 | `ask` en la sesión principal | Estado previo: HEAD y `git diff --cached --name-only` vacío. Orchestrator ejecuta el comando dos veces. Ejecución A: el humano **rechaza** el diálogo; esperado: el comando no se ejecuta. Ejecución B: el humano **aprueba una vez**; esperado: se ejecuta, salida `add '.gitattributes'`, exit 0. El humano confirma por escrito, por ejecución: si apareció diálogo, qué respondió y con qué opción. Lo que cuenta es esa confirmación, no la percepción del agente | Orchestrator ejecuta; el humano observa y confirma | Directa-humana |
| C03-02 | `ask` en una delegación real | Igual que C03-01 (rechazo y aprobación puntual) dentro de una delegación real al subagente que escribe, Develop, en una invocación sin escrituras. La repetición en Testing es opcional. Un subagente no distingue "ejecutado sin preguntar" de "aprobado por el humano" (RUNTIME), así que cuenta lo que el humano confirme | Orchestrator delega; el humano observa; el subagente informa | Directa-humana; el informe del subagente es autoinformado y solo corrobora |
| C03-03 | Sin efectos persistentes | Tras cada ejecución: `git diff --cached --name-only` vacío y HEAD sin cambios (directa). `.claude/settings.json` conserva su hash de línea base (directa). Para `.claude/settings.local.json`, solo metadatos (`stat`: tamaño y mtime, comparados con los del inicio de la prueba) más la declaración del humano de que no creó permisos permanentes. Si cambian los metadatos, el humano revisa el archivo; ningún agente lo lee | Orchestrator; humano para la revisión de contenido | Directa para Git y hash; directa-humana para permisos |
| C03-04 | Alternativa mínima, solo si `ask` no funciona | Condicional: aplica únicamente si el humano confirma que alguna de las ejecuciones se ejecutó sin diálogo o que el rechazo no impidió el comando. Entonces Orchestrator o Testing **identifican sin aplicar** una alternativa mínima (p. ej. deny explícito de `git add` y `git commit` en Bash y PowerShell dentro de Claude Code y Git usado por el humano fuera del agente), con la prueba inocua que la verificaría y el resultado observable esperado, y la plantean como decisión humana. `settings.json` conserva su hash | Orchestrator y Testing; decide el humano | Directa (documento); su efectividad queda pendiente |

Condición de resultado:
- RESOLVED: C03-01, C03-02 y C03-03 cumplidos con diálogo observado en ambos contextos, rechazo efectivo y aprobación puntual efectiva. DH-10 pasa a verificado en ejecución. C03-04 N.A.
- OPEN, con **High confirmado** (por la propia escala de AUDIT-001): el humano confirma que el comando continuó sin su aprobación en cualquiera de los dos contextos, o que un rechazo no lo impidió. El hallazgo se reclasifica de Medium provisional a High, el veredicto es FAIL y C03-04 pasa a obligatorio.
- OPEN, sin High confirmado: falta la observación o confirmación del humano en alguna ejecución, o no se realizó la delegación. No es posible verificar el criterio: veredicto BLOCKED, nunca PASS por ausencia de síntoma.
- ACCEPTED DEVIATION: no aplicable si se confirma el fallo de `ask` (High). Un fallo confirmado solo admite mitigación mediante la alternativa de C03-04, que el humano decide aprobar o no en una tarea posterior.

### AUD-04 — Atribución en un árbol con cambios (Medium)

| ID | Qué verifica | Cómo | Responsable | Grado esperado |
|---|---|---|---|---|
| C04-01 | `docs/AGENT_WORKFLOW.md` incorpora la comparación de contenido | La sección "Comprobación Git antes y después de cada delegación" añade, para árboles con cambios, el cálculo de `git hash-object` antes y después sobre el conjunto relevante: rutas versionadas modificadas y sin rastrear no ignoradas (la salida de `git diff --name-only HEAD` más `git ls-files --others --exclude-standard`). Debe indicar: exclusiones (secretos y `.env*`, dependencias como `node_modules`, artefactos generados como `.next`, `dist`, `build`, `coverage`, `*.log`, y archivos privados ajenos al alcance), dónde se guardan los hashes (informe de fase o directorio temporal fuera del repositorio, nunca el contenido), la comparación (`diff` de ambas listas) y el criterio: cualquier ruta cambiada fuera de la lista permitida es High, y en delegaciones de solo lectura solo puede cambiar el informe autorizado. También: se aplica cuando el árbol tiene cambios (con árbol limpio basta la comprobación por nombres), y esta sección prevalece sobre la enumeración abreviada de CLAUDE.md:12 | Develop implementa; Testing revisa por lectura y diff | Directa |
| C04-02 | El filtro de ignorados cubre el ajuste local | El comando documentado detecta `.claude/settings.local.json` **solo por nombre**: ejecutado literalmente desde AGENT_WORKFLOW.md en el árbol actual, lista ese archivo (hoy el filtro vigente responde "sin ignorados sensibles"). El texto aclara que no se abre, que la revisión de su contenido es del humano y que se compara con la línea base conocida para detectar entradas nuevas, no que su presencia sea un fallo | Develop; Testing lo ejecuta | Directa (comando y exit code) |
| C04-03 | El procedimiento funciona de forma efectiva y con atribución | (a) Testing aplica el procedimiento documentado dos veces seguidas sin cambios: salidas idénticas y exit 0. (b) Demostración inocua fuera del repositorio: un archivo temporal cuyo contenido cambia en una línea cambia su hash con la lista de nombres idéntica. (c) Orchestrator lo aplica antes y después de la delegación de Develop de AUD-04 y AUD-05 y de la de Testing POST: el diff de hashes contiene solo las rutas permitidas y el informe autorizado | Testing (a, b); Orchestrator (c) | Directa |

Condición de resultado:
- RESOLVED: C04-01 a C04-03 cumplidos.
- OPEN: falta alguna de las partes de C04-01, el filtro sigue sin listar `settings.local.json`, el procedimiento hashea excluidos (lee secretos o ignorados) o registra contenido, o no se aplicó en las delegaciones de TASK-003.
- ACCEPTED DEVIATION: aplicable solo a la parte (c) si el humano lo acepta explícitamente (p. ej. porque una delegación ya se ejecutó antes de documentar el procedimiento); no al contenido de C04-01 ni C04-02.

Nota de alcance. Si el humano quiere que CLAUDE.md:12 incluya la comparación de contenido en su enumeración, requiere una edición de Orchestrator con autorización explícita (archivo prohibido para Develop y Testing). La cláusula de prevalencia de C04-01 evita la divergencia sin tocar CLAUDE.md; la alineación de CLAUDE.md es opcional (decisión humana).

### AUD-05 — Procedimiento de G1 compatible con Desktop (Medium)

| ID | Qué verifica | Cómo | Responsable | Grado esperado |
|---|---|---|---|---|
| C05-01 | G1 no exige comandos de CLI inexistentes en Desktop y no reduce criterios | `grep -nE '/permissions\|/status\|/mcp\|/tasks\|claude doctor\|claude --debug\|en la CLI' docs/ROADMAP.md docs/AGENT_WORKFLOW.md`: cada aparición está marcada como complementaria, solo terminal u opcional, o como no documentada en Desktop; ROADMAP.md:20 y :26 y AGENT_WORKFLOW.md:4, :30 y :80 se corrigen en consecuencia. Además, tabla de trazabilidad (en AGENT_WORKFLOW.md) de **cada comprobación original** a su equivalente de Desktop o a "no verificable en Desktop": modo de permisos (selector de modo), modelo y esfuerzo (selectores y panel Background tasks, grado según lo que muestre), conectores y contexto MCP (Connectors y tarjeta o `/context`), ask (prueba humana de AUD-03), carga real de agentes (delegaciones reales), versión (`claude --version`, no interactiva), `claude doctor` y `claude --debug` (terminal, complementarias). Las reglas efectivas y su origen (`/permissions`, `/status`) se declaran sin visor equivalente, mitigadas por hashes, pruebas inocuas y revisión humana de `settings.local.json`. Ningún ítem desaparece sin constar | Develop; Testing revisa por grep y lectura | Directa |
| C05-02 | Grados de evidencia y esfuerzo | AGENT_WORKFLOW.md define los tres grados con su equivalencia en Desktop: "verificado por CLI" (etiqueta heredada) se interpreta como verificado directamente (salida de herramienta o comando observada por quien registra, o confirmación humana de la interfaz transcrita); autoinformado; no verificable. `high` se mantiene como esfuerzo **configurado** de ambos subagentes (frontmatter intacto, hashes de línea base). Ningún documento afirma el esfuerzo efectivo; sigue "no verificable" salvo observación humana registrada. El override global `effortLevel` se menciona como factor conocido (RV-03), no se modifica. Verificación: grep de "efectivo" y "esfuerzo" en los documentos editados y hash de los agentes | Develop; Testing | Directa |
| C05-03 | Veredictos aplicados correctamente | AGENT_WORKFLOW.md (G1) remite a la definición de TESTING_GUIDELINES.md sin redefinirla: un High confirmado implica FAIL; BLOCKED solo cuando falta evidencia o no se puede ejecutar un criterio; si coinciden, el veredicto es FAIL con los checks pendientes listados. Sin nuevas escalas ni variantes. Verificación: grep de `BLOCKED`, `FAIL` y `High` en los documentos editados y comprobación de que no se copia con variaciones el párrafo de veredictos | Develop; Testing | Directa |
| C05-04 | Aprobación humana de G1 y puertas intactas | La tabla de fases de ROADMAP.md conserva sus filas (`git diff` sin líneas eliminadas en ellas), incluida "G1: Testing + Codex Sol alto + humano". AGENT_WORKFLOW.md:80 conserva "No iniciar Next.js hasta aprobación humana" y "Codex revisa configuración", y no declara G1 aprobado. Sin cambios de alcance, de fases ni de criterios | Develop; Testing | Directa |
| C05-05 | Disposición de RUNTIME rectificada | La misma adenda (C02-01) rectifica el veredicto de RUNTIME de BLOCKED a **FAIL**: RV-01 es un High confirmado observado (8 conectores conectados, herramientas expuestas) y la escala asigna FAIL siempre a un High. Los elementos no verificables (esfuerzo efectivo, diálogos) se enumeran como checks pendientes, no como veredicto. RV-02 se rectifica como **provisional**: Medium propuesto por Testing frente a High asignado por Orchestrator, a confirmar con el resultado de AUD-03; la adenda no lo cuenta como High confirmado y no inventa su resolución. Se conserva RUNTIME sin editar | Testing | Directa |

Condición de resultado:
- RESOLVED: C05-01 a C05-05 cumplidos y, en POST, el diff de documentos limitado a la lista permitida.
- OPEN: persiste una exigencia de CLI sin marcar, falta algún ítem de la trazabilidad, se afirma un esfuerzo efectivo, se redefinen veredictos o G1 pierde su aprobación humana, o RUNTIME queda en BLOCKED con RV-01 High.
- ACCEPTED DEVIATION: solo para un ítem declarado "no verificable en Desktop" (por ejemplo, la falta de un visor de reglas efectivas), si el humano lo acepta por escrito. No para las demás.

Decisión sobre `docs/TESTING_GUIDELINES.md` y `docs/reviews/TEMPLATE.md` (no se modifican). **No son estrictamente necesarios para AUD-05.** Las etiquetas "verificado por CLI" y "no verificable mientras no exista comprobación por CLI" aparecen en TESTING_GUIDELINES.md:58 y :63, TEMPLATE.md:11, `testing.md:33` y AGENT_WORKFLOW.md:34. Solo AGENT_WORKFLOW.md:34 las **define** (qué salida cuenta como cada grado); las demás usan la etiqueta y TESTING_GUIDELINES.md:63 ya remite a AGENT_WORKFLOW.md para la comprobación. Basta, por tanto, con la equivalencia de C05-02, y el esfuerzo seguirá siendo "no verificable" porque en Desktop no existe comprobación de su valor efectivo, lo que es coherente con la redacción de TESTING_GUIDELINES.md. Renombrar las etiquetas en esos tres archivos (alineación terminológica) es opcional y es una **decisión humana** que exigiría tarea y autorización específicas; no bloquea TASK-003 ni G1. Del mismo modo, `docs/SECURITY.md:42` repite la lista de comandos de CLI como "requiere intervención humana". Ya remite a AGENT_WORKFLOW.md para el procedimiento; editarlo (puntero en lugar de lista) elimina una contradicción literal, pero SECURITY.md está prohibido para Develop salvo lista cerrada. Recomiendo que Orchestrator lo incluya en la lista permitida para ese cambio mínimo; si no se incluye, queda como Informational y no impide RESOLVED.

### Criterios transversales

| ID | Qué verifica | Cómo | Responsable | Grado esperado |
|---|---|---|---|---|
| CX-01 | Alcance y trazabilidad Git de cada delegación | Antes y después de cada delegación: la comprobación de AGENT_WORKFLOW.md (SHA, rama, `status -uall`, diffs, ignorados sensibles) más el manifiesto `git hash-object` de la línea base. Esperado: HEAD y rama sin cambio, índice vacío, rutas cambiadas contenidas en las listas permitidas de la tarea. En POST, Testing compara `git diff --name-only HEAD` y los sin rastrear con las listas del handoff, confirma los hashes de los archivos de la línea base protegidos (historial de TASK-002 salvo la adenda, `CHALLENGE.md`, `TESTING_GUIDELINES.md`, `TEMPLATE.md`, `CLAUDE.md`, `AGENTS.md`, `AUDIT-001.md`) y ejecuta `git diff --check HEAD` (exit 0). Develop no escribe en `docs/reviews/**`. Los archivos editados conservan LF en los modificados | Orchestrator; Testing en POST | Directa |
| CX-02 | Sin ampliación de permisos ni acciones prohibidas | `.claude/settings.json`, `develop.md` y `testing.md` con los hashes de la línea base (salvo decisión humana registrada); sin `package.json`, `src/`, `tests/`, scaffold, dependencias, nuevos agentes ni skills; sin staging, commit, push, merge ni deploy (`git rev-parse HEAD` igual, índice vacío). `.claude/settings.local.json` no leído por ningún agente | Orchestrator; Testing | Directa |
| CX-03 | STATUS.md veraz | Tras TASK-003, Orchestrator actualiza `docs/STATUS.md` con los resultados reales por AUD (RESOLVED, OPEN o ACCEPTED DEVIATION), la disposición rectificada de RETEST y RUNTIME según la adenda, y los checks pendientes. Verificación por lectura y grep: no declara G1 aprobado, no declara PASS donde el veredicto es FAIL o BLOCKED, no afirma esfuerzo efectivo ni auditoría de Codex repetida | Orchestrator; Testing | Directa |

## Agregación en el veredicto general (POST de TASK-003)

El veredicto es uno solo (PASS, FAIL o BLOCKED) según la definición de docs/TESTING_GUIDELINES.md. Se obtiene así:

1. **FAIL** si ocurre cualquiera de estos hechos, ya verificados: algún hallazgo Critical/High confirmado (herramienta externa invocable no autorizada; `ask` que no actúa según confirmación humana; escritura fuera de la lista o en archivos protegidos; informe histórico alterado; permisos ampliados; staging o commit); incumplimiento de un criterio aprobado de C01 a C05 o CX con evidencia de que no se cumple; documentos que siguen exigiendo CLI o redefinen veredictos. Un hallazgo High implica FAIL aunque a la vez haya checks no ejecutados: FAIL prevalece sobre BLOCKED y los checks pendientes se listan.
2. **BLOCKED** si no hay hechos de (1) pero algún criterio aplicable no se pudo ejecutar o verificar: falta la confirmación humana de `ask`, el humano no registra C01-01 o C01-04, falta una delegación, o un agente no informa sus herramientas. BLOCKED no se convierte en PASS sin esa evidencia.
3. **PASS** solo si los cinco hallazgos están RESOLVED, o en ACCEPTED DEVIATION cuando proceda; todos los criterios aplicables se ejecutaron y superaron; no hay Critical/High; y el alcance se respetó (CX-01 y CX-02). Los hallazgos Medium/Low/Informational fuera de criterios (p. ej. RV-03, RV-05) se listan para aceptación humana explícita y registrada; no cambian el veredicto.

ACCEPTED DEVIATION exige texto humano explícito, citado y fechado en el registro, que nombre el hallazgo y su alcance. Solo puede cubrir incumplimientos Medium o inferiores. Un High o Critical no se convierte en PASS por aceptación humana: sigue siendo FAIL, y el humano puede decidir continuar a G1 bajo su propia responsabilidad con constancia. La excepción de B16 no convierte B16 en PASS ni cambia que el veredicto histórico de RETEST rectificado sea FAIL. Lo que sí hace es que el criterio de TASK-003 C02-02 (rectificar y documentar) se cumpla.

El veredicto de TASK-003 cubre TASK-003 únicamente: no aprueba G1, no sustituye la decisión humana ni la auditoría de Codex, y no convierte en PASS ningún veredicto histórico de TASK-002.

## Orden y entregas recomendados
1. Humano: C01-01 y sesión nueva. Orchestrator: C01-02 y baseline del manifiesto de hashes.
2. Delegación sin escrituras a Develop para C01-03, C03-02 (rechazo y aprobación puntual) con el humano observando. En la sesión principal, C03-01 antes.
3. Delegación de Develop con escritura (AUD-04 y AUD-05), con el manifiesto antes y después. La lista permitida mínima propuesta es `docs/AGENT_WORKFLOW.md` y `docs/ROADMAP.md`, y opcionalmente `docs/SECURITY.md` (cambio mínimo de :42). Prohibidos: `.claude/**`, CLAUDE.md, AGENTS.md, `docs/TESTING_GUIDELINES.md`, `docs/reviews/**`, `docs/CHALLENGE.md`.
4. Testing: adenda de TASK-002 (AUD-02, C05-05) y POST de TASK-003, con evidencia directa de C04 y CX.
5. Orchestrator: STATUS (CX-03) y registro de las confirmaciones humanas.

## Comandos y resultados (esta fase)
| Comando | exit | Resultado |
|---|---|---|
| `git rev-parse HEAD` | 0 | `86611a8fc62dcf1c8a34af18a817fac55368ae91` |
| `git branch --show-current` | 0 | `chore/project-foundation` |
| `git status --porcelain -uall` | 0 | 15 `M`, 12 `??` (27 rutas) |
| `git diff --cached --name-only` | 0 | sin salida (índice vacío) |
| `git check-ignore -v .claude/settings.local.json` | 0 | `.gitignore:21` |
| `git ls-files --others --ignored --exclude-standard --directory \| grep -E '(^\|/)(\.env[^/]*\|secrets/?)$' \|\| echo …` | 0 | "sin ignorados sensibles" (el filtro vigente no contempla `settings.local.json`; con `grep -c 'settings.local'` sobre la misma salida, 1 coincidencia) |
| `sha256sum` de informes y configuración; `git hash-object` de la configuración | 0 | tabla de línea base |
| `stat -c '%s %y' .claude/settings.local.json` | 0 | solo metadatos (4429 bytes, mtime 14:53:44); contenido no leído |
| `git diff --check HEAD` | 0 | sin errores |
| Manifiesto `git hash-object` (27 rutas) ejecutado dos veces y comparado con `diff` | 0 | determinista, `settings.local.json` excluido |
| `ls tests src package.json` | 2 | no existen |

Los exit codes provienen de las ejecuciones de esta sesión; el segundo bloque de Git (estado final) se confirma en el mensaje de entrega.

## Hallazgos
Esta fase no emite hallazgos de producto: define criterios. Observaciones para decisión humana o de Orchestrator:

| ID | Gravedad | Archivo/línea | Reproducción | Esperado / obtenido | Criterio | Estado |
|---|---|---|---|---|---|---|
| PRE3-01 | Informational | `docs/AGENT_WORKFLOW.md` (comprobación Git) | Ejecutar el filtro de ignorados vigente | El ajuste local de Claude debería contemplarse por nombre / el filtro devuelve "sin ignorados sensibles" aunque el archivo existe e ignorado | C04-02 | Es el defecto de AUD-04; se cierra con C04-02 |
| PRE3-02 | Informational | `docs/reviews/claude/README.md` (convención de nombres) | Comparar `TASK-002-ADDENDUM.md` con la convención `TASK-NNN-FASE.md` (FASE: PRE, POST, RETEST, AUDIT) | El nombre de la adenda no figura entre las fases; RUNTIME ya fue un precedente fijado por el humano | C02-01 | Orchestrator debe confirmar el nombre con el humano y, si procede, registrar la excepción de nomenclatura (Develop no puede editar `docs/reviews/**`) |
| PRE3-03 | Informational | Contexto de Testing | Autodescripción | Instrucciones MCP de siete servidores presentes sin herramientas invocables; algunas contienen directivas condicionales de uso (p. ej. crear documentos) que no aplican a esta tarea y no se siguieron | C01-03 | Registrado (RV-05); línea base para tras la desactivación |

## Validación estática, efectiva parcial y efectiva pendiente
Validación estática (hecha): lectura de AUDIT-001 y de la documentación; verificación de hashes, ignorados y manifiesto; estimación de líneas afectadas por grep.
Validación efectiva parcial en subagente (hecha): ejecución inocua del manifiesto de hashes, `git check-ignore` y `stat` de metadatos; autodescripción de herramientas.
Validación efectiva pendiente (humano, reinicio o delegaciones posteriores): C01-01, C01-02, C01-03 en las delegaciones reales, C01-04, C03-01 a C03-04, C04-03 y todos los POST; la adenda de AUD-02 y C05-05.

## Limitaciones
- No se leyeron `.claude/settings.local.json`, `~/.claude*` ni `.env*`; solo metadatos y nombres.
- No se ejecutó `git add -n` ni ningún otro comando sujeto a `ask`: es la prueba humana de AUD-03.
- No se enumeraron las herramientas diferidas (sin ToolSearch).
- Los sha256 de la línea base reflejan el árbol de trabajo (CRLF en los archivos sin rastrear); en POST se comparan con el mismo método.
- No se contactaron servicios remotos ni se verificó la documentación oficial de Desktop.
- Esfuerzo efectivo propio: no verificable.

## Veredicto
Fase PRE: no emite PASS, FAIL ni BLOCKED. Entrega criterios; los veredictos se emiten en POST y RETEST con las reglas de "Agregación".

Iteraciones y correcciones: 1 (PRE).
Aceptación humana (pendiente hasta que exista): los criterios requieren su revisión; en particular PRE3-02 y las decisiones de C01-04, C02-04 (G05 y E01 sin autorización equivalente), C03-04 y C04-01 (CLAUDE.md opcional).
