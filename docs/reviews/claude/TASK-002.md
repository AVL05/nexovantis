# TASK-002 — Foundation hardening & multi-agent governance

Registro saneado del Orchestrator. Versión final tras el ciclo Testing PRE → Develop → Testing POST → Develop → Testing RETEST. Los ID ORC-xx no se han renumerado y siguen siendo válidos como referencia.

| Campo | Valor |
|---|---|
| Fecha | 2026-11-24 |
| SHA base | `86611a8fc62dcf1c8a34af18a817fac55368ae91` (sin commits nuevos) |
| Entorno | Windows 11, Claude Code 2.1.327 (escritorio), rama `chore/project-foundation` |

## Evidencia del Orchestrator (observaciones directas en la sesión principal)

| ID | Comando u observación | Resultado real |
|---|---|---|
| ORC-01 | `claude --version` | `2.1.327 (Claude Code)` |
| ORC-02 | PowerShell: `[bool]$env:CLAUDE_CODE_EFFORT_LEVEL`, `[bool]$env:CLAUDE_CODE_SUBAGENT_EFFORT` | `False` y `False`. Ninguna de las dos variables está definida en la sesión principal |
| ORC-03 | Parámetro `effort` en las invocaciones de Agent | No se pasó en ninguna invocación de TASK-001 ni de TASK-002 |
| ORC-04 | `Test-Path .mcp.json` | `False` |
| ORC-05 | Notificación de la sesión tras la recarga en caliente de `.claude/settings.json` | Las herramientas diferidas de `computer-use`, `claude-in-chrome` y `scheduled-tasks` dejaron de estar disponibles. Las herramientas de conectores claude.ai (servidores con nombre UUID) no figuran como retiradas, lo que sugiere que `disableClaudeAiConnectors` requiere reinicio. Grado: observación en sesión |
| ORC-06 | Nombres de herramientas de la sesión principal | La app de escritorio expone herramientas internas con prefijo `mcp__`: `mcp__ccd_turn__*`, `mcp__ccd_session__*`, `mcp__Claude_Browser__*`, `mcp__terminal__*` y otras. Según la documentación oficial, `"mcp__*" matches every MCP tool across all servers`. Un deny global `mcp__*` las bloquearía. Es una deducción a partir de los nombres observados y de la semántica documentada; no se ejecutó ese deny para comprobarlo |
| ORC-07 | Prompts de permiso de las reglas `ask` durante las invocaciones de subagentes | El Orchestrator **no puede observar** los diálogos de permiso que se muestran al humano. No es verificable desde aquí; requiere confirmación humana |
| ORC-08 | `git status --porcelain=v1 -uall` tras Develop (iteración 1) | 15 archivos `M` y 5 `??`; staging vacío; HEAD `86611a8`; `git diff --stat`: 15 files changed, 799 insertions(+), 29 deletions(-) |
| ORC-09 | Parseo de `.claude/settings.json` con `node` tras Develop (iteración 1) | deny 232, ask 142, `defaultMode` default, `disableBypassPermissionsMode` disable, `disableClaudeAiConnectors` true |
| ORC-10 | Tras Develop (iteración 2): `git status --porcelain=v1 -uall`, `git diff --cached --name-only`, `git diff --stat`, parseo con `node` | Los mismos 15 `M`; 9 `??` (incluidos los informes); staging vacío; HEAD `86611a8`; 15 files changed, 913 insertions(+), 29 deletions(-); deny 321, ask 154 |
| ORC-11 | Herramienta PowerShell de la sesión principal: `Remove-Item -Recurse nonexistent-dir-for-deny-test-xyz` (objetivo inexistente) | Denegado por permisos antes de ejecutarse |
| ORC-12 | PowerShell: `rm -r nonexistent-dir-for-deny-test-xyz` (alias, objetivo inexistente) | Denegado por permisos antes de ejecutarse |
| ORC-13 | PowerShell: `git push nonexistent-remote-for-deny-test` | Denegado por permisos antes de ejecutarse |
| ORC-14 | PowerShell: `(Get-Content .env.example \| Measure-Object -Line).Lines`, sin imprimir el contenido | `4`. `.env.example` sigue legible |

## Decisiones del Orchestrator

- DH-00: las validaciones efectivas de tipo E son prerrequisito de G1, no del cierre de TASK-002.
- DH-01 a DH-09: pendientes de decisión humana, con la lectura estricta por defecto.
- DH-13: el Orchestrator la registra como pendiente formal de decisión humana. Se trata de la ambigüedad "alta de orden con técnico" frente al flujo demo, que asigna después. La detectó Develop.
- DH-10: `git add` y `git commit` en ask; push y operaciones remotas en deny.
- DH-11: sin hooks en TASK-002.
- DH-12: restricción de MCP por servidor, en lugar de un deny global `mcp__*`. Justificación: ORC-06.

## Delegaciones reales

| # | Agente | Fase | Duración aprox. | Herramientas | Resultado | Evidencia |
|---|---|---|---|---|---|---|
| 1 | `testing` | PRE | 21 min | 41 | 67 AC, clasificación de hallazgos, alcance cerrado, DH-00..DH-12 | [TASK-002-PRE.md](TASK-002-PRE.md) |
| 2 | `develop` | Implementación (iteración 1) | 13 min | 63 | 15 archivos modificados y 3 creados | [TASK-002-DEVELOP-1.md](TASK-002-DEVELOP-1.md) |
| 3 | `testing` | POST | 12 min | 67 | **BLOCKED**: 62 PASS, 4 BLOCKED, 0 FAIL, 1 E | [TASK-002-POST.md](TASK-002-POST.md) |
| 4 | `develop` | Corrección (iteración 2) | 19 min | 47 | POST-01, 04-08, 10-12 corregidos o documentados | [TASK-002-DEVELOP-2.md](TASK-002-DEVELOP-2.md) |
| 5 | `testing` | RETEST | 16 min | 74 | **PASS**: 66 PASS, 0 FAIL, 0 BLOCKED, 1 N.A. (B15, tipo E) | [TASK-002-RETEST.md](TASK-002-RETEST.md) |
| Aux. | `web-fetch` (×2 consultas) | Documentación oficial | — | — | Permisos, settings, MCP y sub-agents | Hechos resumidos en los handoffs |

Iteraciones Develop/Testing: 2 de Develop y 3 de Testing (PRE, POST y RETEST). Hubo progreso en cada iteración, sin necesidad de escalado. Modelo autoinformado de todos los subagentes: `claude-sonnet-5-5`. El esfuerzo efectivo no es verificable desde dentro (ORC-02 y ORC-03).

## Archivos

`git diff --numstat` (respecto a `86611a8`):

| Archivo | + | − |
|---|---|---|
| .claude/agents/develop.md | 23 | 0 |
| .claude/agents/testing.md | 23 | 8 |
| .claude/settings.json | 477 | 1 |
| .gitignore | 15 | 0 |
| AGENTS.md | 6 | 1 |
| CLAUDE.md | 4 | 4 |
| docs/AGENT_WORKFLOW.md | 65 | 3 |
| docs/ARCHITECTURE.md | 2 | 0 |
| docs/BUSINESS_RULES.md | 39 | 0 |
| docs/PRODUCT_REQUIREMENTS.md | 5 | 0 |
| docs/ROADMAP.md | 44 | 0 |
| docs/SECURITY.md | 37 | 0 |
| docs/STATUS.md | 14 | 3 |
| docs/TESTING_GUIDELINES.md | 123 | 1 |
| docs/reviews/TEMPLATE.md | 36 | 8 |

Archivos nuevos de Develop: `.gitattributes`, `docs/reviews/claude/README.md` y `docs/reviews/codex/README.md`.

Informes nuevos:
- Del Orchestrator: TASK-001, TASK-002, TASK-002-DEVELOP-1 y TASK-002-DEVELOP-2.
- De Testing: TASK-002-PRE, TASK-002-POST y TASK-002-RETEST.

Archivos intactos (verificados por Testing con hash o con `git diff`): `docs/CHALLENGE.md`, `.env.example`, `README.md`, `.editorconfig` y `docs/DEPLOYMENT.md`.

**Cambio posterior al RETEST (sin revisar por Testing):** el Orchestrator actualizó `docs/STATUS.md` (líneas 8 y 18) para reflejar el veredicto RETEST, tal como Testing señaló en RETEST-05 y en el apartado de STATUS. Es un cambio factual, solo documental.

## Configuración de seguridad resultante (`.claude/settings.json`)

- `$schema` de schemastore.
- `defaultMode: "default"` (manual).
- `disableBypassPermissionsMode: "disable"`.
- `disableClaudeAiConnectors: true`.
- Sin `allow`.
- **deny (321):**
  - Read y Edit de `.env` y sus variantes concretas, sin `.env.example`.
  - Claves y credenciales: `*.pem`, `*.key`, `*.p12`, `*.pfx`, `credentials*`, `service-account*`, `id_rsa*`, `~/.ssh`, `~/.aws`, `~/.config/gh`, etc.
  - Bash y PowerShell: Git remoto/destructivo, `gh` de escritura crítica, despliegue (Vercel, Netlify, publish), Supabase remoto (`db push`, `link`, `branches`, `functions deploy/delete`, `migration up --linked`, …) y borrado recursivo.
  - MCP: `computer-use`, `claude-in-chrome` y `scheduled-tasks`.
- **ask (154):**
  - Git local que modifica el repositorio (add, commit, checkout, stash, config, …).
  - Gestores de paquetes.
  - `psql` y `pg_dump`.
  - `gh api`, `issue`, `run`, `workflow` y `auth`.
  - `curl`, `wget`, `Invoke-WebRequest` y saltos de shell.
- Agentes: `disallowedTools: mcp__*`; `tools` sin cambios.
- SECURITY.md documenta que estas reglas **no son una frontera de seguridad absoluta** y enumera los residuos conocidos.

## Matriz de resolución de hallazgos de TASK-001

Verificada por Testing en RETEST (Anexo B de [TASK-002-RETEST.md](TASK-002-RETEST.md)).

| ID | Resolución | Estado |
|---|---|---|
| TST-01 | Protocolo Git antes/después y alcance cerrado (AGENT_WORKFLOW, CLAUDE.md, develop.md) | Resuelto. Residuo aceptado: sin aislamiento técnico por ruta (DH-11) |
| TST-13 | Deny/ask para Bash y PowerShell (settings.json; SECURITY.md) | Resuelto. Residuos documentados |
| TST-14 | Deny de Read/Edit para secretos (settings.json) | Resuelto. Residuos documentados |
| TST-02 | Tabla de propiedad de `tests/`, donde prevalece la regla más específica | Resuelto |
| TST-03 | Prohibiciones de edición ampliadas en develop.md | Resuelto |
| TST-04 | T10 medible en TESTING_GUIDELINES | Resuelto (b). Automatización: F2 `F2-A11Y-HARNESS` |
| TST-05 | Escala Critical/High/Medium/Low/Informational | Resuelto (b). Umbral de cobertura: F2 (DH-09) |
| TST-06, TST-16 | Evidencia válida de T01 definida | Resuelto |
| TST-07 | Casos de eventos/ACTIVITY | Resuelto (b). F4 `F4-ORDER-EVENTS`, F6 `F6-ACTIVITY`; DH-08 pendiente |
| TST-08 | Matriz de transiciones y casos de TEAM, archivado y cancelación | Resuelto (b). DH-01..DH-08 y DH-13 pendientes; F3 `F3-TEAM-CRM`, F4 `F4-ORDER-STATES` |
| TST-09 | `disableClaudeAiConnectors`, deny por servidor, `disallowedTools` | Resuelto en configuración. Efectividad pendiente (POST-02) |
| TST-10 | READMEs de `claude/` y `codex/`, ubicación de evidencias | Resuelto |
| TST-11 | Aclaración de reproducción del fallo previo | Resuelto. Runner: F2 `F2-TEST-HARNESS` |
| TST-12 | Procedimiento de verificación de modelo y esfuerzo | Resuelto (b). Efectividad pendiente (`/tasks`) |
| TST-15 | `.gitignore` ampliado | Resuelto |
| TST-17 | Pendientes registrados en ROADMAP | F3 `F3-ADR-ROLES`, F5 `F5-ADR-IVA` |
| TST-18 | `.gitattributes` | Resuelto. Renormalización pendiente de autorización |
| D1 | Preflight de Docker/WSL/Supabase CLI | F3 `F3-PRE-ENV` |
| D2 | Sin allowlist, justificado | Resuelto |
| D3 | Herramientas iguales: límite contractual + diff | Aceptado (d). DH-11 |
| D4 | GRANT/RLS/RPC | F3 `F3-RLS-GRANTS`, F5 `F5-RPC-HARDENING`, F6 |
| D5 | Versión de Claude Code verificada (ORC-01) | Resuelto |
| D6 | Plantilla con archivos modificados, SHA y diff | Resuelto |
| `/agents` | Sustituido por `/tasks`, `claude --debug`, `/permissions`, `/status`, `/mcp`, `/context` y `claude doctor` | Resuelto |

## Hallazgos abiertos tras RETEST

| ID | Gravedad | Estado | Responsable |
|---|---|---|---|
| POST-02 | Medium | Los conectores claude.ai siguen en contexto hasta el reinicio. Falta ratificar DH-12 | Humano (reinicio + `/mcp`, `/context`) |
| POST-03 | Medium (provisional; High si `ask` no actúa en subagentes) | Cuatro comandos `ask` se ejecutaron desde subagentes sin que Testing viera ningún diálogo; el Orchestrator no puede observarlo (ORC-07) | Humano (confirmar si hubo diálogos; `/permissions`) |
| POST-13 | Informational | Sin consecuencia | — |
| RETEST-01..05 | Low/Informational | Ninguno incumple un criterio. RETEST-05: los deny de `rm -r` y `git clean` impedirán limpiezas legítimas en F2 | Aceptación humana |

## Limitaciones

- No ejecutado: `/permissions`, `/status`, `/mcp`, `/context`, `/tasks`, `claude doctor` ni `claude --debug`. Son comandos interactivos del humano, o necesitan reiniciar.
- La validación efectiva de las reglas es parcial. Testing la hizo en el subagente (Bash) y el Orchestrator en la sesión principal (PowerShell, ORC-11..14). Todas las pruebas usaron objetivos inexistentes o archivos ficticios.
- `disableClaudeAiConnectors` y `disallowedTools: mcp__*` no están confirmados en ejecución tras reiniciar.
- No se ha normalizado CRLF en el árbol de trabajo. No hay auditoría de Codex.

## Veredicto

- Testing (RETEST): **PASS**, con alcance estático + efectivo parcial; no cubre la CLI tras reinicio.
- Orchestrator: TASK-002 queda lista para revisión humana. **G1 no está aprobado.** Antes de G1 faltan la validación humana de POST-02/POST-03 y de las comprobaciones de tipo E (DH-00), la auditoría de Codex y la aprobación humana.
- Sin commits, staging, push ni despliegues.
