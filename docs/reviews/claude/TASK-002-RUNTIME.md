TASK-ID / GATE: TASK-002 / prerrequisito de G1
Fase (PRE / POST / RETEST / AUDIT): AUDIT de ejecución tras reinicio (solo lectura). Nombre `RUNTIME` fijado por el humano.
Fecha: 2026-11-24

Registro de Orchestrator. Recoge la verificación de ejecución pedida tras reiniciar la sesión para cargar la configuración de TASK-002, incluida la delegación real a Testing (fase AUDIT, solo lectura, informe devuelto en su mensaje). Entorno: Claude Code Desktop (pestaña Code), Windows 11.

## Agente, modelo y esfuerzo
| Agente | Modelo solicitado / efectivo / fuente | Esfuerzo solicitado / efectivo / fuente |
|---|---|---|
| Orchestrator | Opus 5.5 / Opus 5.5 / declarado por el entorno de la sesión (autoinformado) | high / no verificable |
| Testing | `sonnet` (frontmatter) / Sonnet 5.5 / autoinformado | `high` (frontmatter) / "bajo" según autoinforme / no verificable |
| Develop | `sonnet` / no invocado (sin alcance de implementación) | `high` / no invocado |

`~/.claude/settings.json` (solo se inspeccionaron nombres de claves y los valores de `model` y `effortLevel`): `"model": "sonnet"`, `"effortLevel": "medium"`. Variables `CLAUDE_CODE_EFFORT_LEVEL` y `CLAUDE_CODE_SUBAGENT_EFFORT`: ausentes. Las invocaciones de Orchestrator no pasaron parámetro `effort`.

## Git
Rama: `chore/project-foundation`
SHA base: `86611a8fc62dcf1c8a34af18a817fac55368ae91`
SHA o diff final: sin commit; `git diff HEAD --shortstat`: 15 archivos, 913 inserciones, 29 eliminaciones.
Estado Git antes: 15 `M` y 10 `??` (25 rutas), staging vacío, sin ignorados sensibles.
Estado Git después de Testing: idéntico; hashes de contenido (`git hash-object`) de las 25 rutas idénticos antes y después.

## Archivos modificados
Durante la verificación: ninguno. Este registro y la actualización de docs/STATUS.md se añadieron después, con autorización humana.

## Entorno
Windows 11 Pro; Claude Code 2.1.331 (`claude --version`, exit 0). La versión documentada en TASK-001 era 2.1.327.

## Comandos y resultados
| Comando / herramienta | exit | Resultado | Grado |
|---|---|---|---|
| Comprobación Git de docs/AGENT_WORKFLOW.md (antes y después) | 0 | HEAD y rama sin cambios; staging vacío; "sin ignorados sensibles" | verificado |
| `git hash-object` de las 25 rutas, antes/después, `diff` | 0 | idénticos | verificado |
| `sha256sum` de `settings.json`, `develop.md`, `testing.md` | 0 | `d065240c…`, `0455046c…`, `1d3ddc16…`: coinciden con TASK-002-RETEST | verificado |
| `git diff HEAD \| sha256sum` | 0 | `e3ed9674…` ≠ `42352b7a…` registrado en RETEST; shortstat igual | verificado (causa probable: STATUS.md y TASK-002.md editados a las 13:46, tras RETEST a las 13:45) |
| `printenv \| grep -E '^CLAUDE_CODE_(EFFORT_LEVEL\|SUBAGENT_EFFORT)='` | 1 | sin variables | verificado |
| `session_connectors_status` (herramienta de la app) | — | 8 conectores claude.ai `connected` (Context7, Google Docs, Claude Docs, Google Drive, Google Sheets, Supabase, Render, Notion) y `scheduled-tasks` `connected`; servidores de plugins en `needs_auth` o `failed` | verificado |
| Testing: autodescripción de herramientas | — | Read, Glob, Grep, Edit, Write, Bash; sin `mcp__*` ni PowerShell. Recibe en contexto instrucciones de servidores MCP, sin esquemas de herramientas | autoinformado |
| Testing: `git add -n .gitattributes; echo "exit=$?"` (sujeto a ask `Bash(git add *)`) | 0 | se ejecutó sin diálogo de confirmación: `add '.gitattributes'` | verificado |
| Testing: `git diff --cached --name-only` | 0 | vacío | verificado |
| Testing: Read de `.claude/settings.local.json` (sujeto a deny) | — | denegado ("denied by your permission settings"); sin contenido | verificado |
| Testing: `git rev-parse HEAD`; `git status --porcelain -uall \| wc -l` | 0 | `86611a8…`; 25 | verificado |

## Hallazgos
| ID | Gravedad | Archivo/línea | Reproducción | Esperado | Obtenido | Criterio | Estado |
|---|---|---|---|---|---|---|---|
| RV-01 | High | .claude/settings.json:3 | `session_connectors_status` tras reinicio | Conectores claude.ai desactivados en el proyecto (decisión aprobada: MCP externos restringidos por defecto) | 8 conectores claude.ai conectados en la sesión de Desktop, incluidos Supabase (36 herramientas), Render (50) y Notion (78) | `disableClaudeAiConnectors` / restricción de MCP | Abierto; véase "Restricción de conectores en Desktop" |
| RV-02 | High (Testing lo propuso Medium; Orchestrator lo eleva por ser un control configurado que no se aplica) | .claude/settings.json:331-332 | `git add -n .gitattributes` desde el subagente Testing | Diálogo de confirmación por la regla ask | Ejecución directa desde el punto de vista del subagente, exit 0 | Reglas ask (POST-03) | Abierto; el humano debe confirmar si vio y aprobó un diálogo (véase la sección de intervención humana) |
| RV-03 | Medium | `~/.claude/settings.json` (global) | Inspección de la clave `effortLevel` | Sin override global de esfuerzo (docs/AGENT_WORKFLOW.md, "Arranque") | `effortLevel: "medium"`; Testing autoinforma esfuerzo bajo con `effort: high` en frontmatter | Esfuerzo objetivo | Abierto; no se modifica la configuración global |
| RV-04 | Low | — | `claude --version`; hash de `git diff HEAD` | Versión 2.1.327 y hash de RETEST | 2.1.331; hash del diff completo distinto con shortstat y hashes de configuración iguales | Trazabilidad | Abierto; requiere confirmación humana |
| RV-05 | Informational | — | Autodescripción de Testing | Sin contexto MCP en subagentes | Instrucciones de servidores MCP inyectadas, sin herramientas | — | Registrado |

## Restricción de conectores en Desktop
Causa documentada de RV-01: en las sesiones locales y SSH de Desktop, la app entrega los conectores claude.ai dentro del proceso y ningún ajuste MCP de Claude Code les llega; `disableClaudeAiConnectors` solo actúa sobre los conectores que Claude Code obtiene por sí mismo (terminal, IDE, Agent SDK). Fuente: https://code.claude.com/docs/en/mcp.md, sección "How connectors reach Claude Code". Los archivos de settings sí son compartidos con Desktop (https://code.claude.com/docs/en/settings.md).

Evidencia observada en esta sesión: las reglas deny `mcp__scheduled-tasks__*` y `mcp__computer-use__*` de `.claude/settings.json` sí retiran esas herramientas en Desktop (el servidor `scheduled-tasks` figura `connected`, pero ninguna herramienta `mcp__scheduled-tasks__*` está disponible). En Desktop, los conectores claude.ai exponen herramientas con el ID del conector, por ejemplo `mcp__6fa48359-cc0c-430a-b65c-40ce8b9faf80__execute_sql` (Supabase). La documentación describe otra forma (`mcp__claude_ai_<server>__<tool>`), que corresponde a los conectores que obtiene la CLI.

| Opción | Ámbito | Valoración |
|---|---|---|
| `disableClaudeAiConnectors` (ya configurado) | Proyecto | No surte efecto en Desktop local (documentado y observado) |
| Interruptor de la app (menú `+` del compositor > Connectors) | Sesión, y pasa a ser el valor por defecto de las sesiones nuevas | Sin cambios de archivos, pero no está limitado al proyecto: puede afectar a otros proyectos. No cumple la condición |
| Desconectar en claude.ai (Customize > Connectors) | Cuenta | Afecta a todos los proyectos y clientes. No cumple la condición |
| Reglas deny por ID de conector (`mcp__<id>__*`) en `.claude/settings.local.json` | Solo este proyecto y este usuario, sin commit | Única vía observada que es de proyecto y no global. Amplía reglas deny, así que requiere decisión humana (prohibido en esta tarea). Frágil: depende de IDs que pueden cambiar al reconectar, y no está documentado para conectores en proceso. Las instrucciones del servidor seguirían en el contexto |
| La misma regla en `.claude/settings.json` | Proyecto, compartido | Prohibido en esta tarea (no modificar settings.json ni ampliar deny) |

Conclusión: desde Desktop no existe un mecanismo documentado que limite los conectores claude.ai a un solo proyecto. La opción viable sin tocar la configuración global es la deny por ID en `.claude/settings.local.json`, que queda como propuesta para decisión humana (enlazada con DH-12). No se ha aplicado.

## Comprobaciones que requieren intervención humana desde la interfaz
En Desktop, `/status`, `/permissions` y `/mcp` no están documentados (https://code.claude.com/docs/en/desktop.md, commands.md). Equivalentes en la interfaz:

| Comprobación | Dónde, en Desktop | Qué confirmar |
|---|---|---|
| Modo de permisos | Selector de modo bajo el cuadro de mensaje (`Ctrl+Shift+M`) | Que es `default` (no `auto`, `acceptEdits` ni `bypassPermissions`) |
| RV-02: ¿apareció un diálogo durante la delegación de esta AUDIT? | Memoria del humano | Un subagente no distingue entre "ejecutado sin preguntar" y "aprobado por el humano en la sesión principal": los subagentes en segundo plano muestran sus solicitudes en la sesión principal (sub-agents.md). Si el humano aprobó un diálogo, RV-02 se cierra como falso positivo |
| Prueba de la regla ask | Pedir a Orchestrator que ejecute `git add -n .gitattributes` en la sesión principal y en una delegación | Que aparece el diálogo en los dos casos. La documentación dice que las reglas ask se heredan y prevalecen en cualquier modo (permission-modes.md) |
| Reglas efectivas | Revisar `.claude/settings.local.json` en un editor (Orchestrator no lo lee por política) | Que no contiene reglas ni modo que alteren ask o deny |
| Modelo y esfuerzo de la sesión | Selector de modelo, apartado Effort | Opus 5.5 y high para Orchestrator |
| Override global de esfuerzo (RV-03) | `~/.claude/settings.json` (`effortLevel: "medium"`) | Decidir si se acepta; Orchestrator no lo cambia |
| Esfuerzo de subagentes | Panel Background tasks mientras corre una delegación | Si muestra el modelo y el esfuerzo. Documentado para `/tasks` en CLI (desde 2.1.242), no para Desktop |
| Contexto MCP | `/context` o la tarjeta Context del panel de detalles | Qué servidores aportan instrucciones o herramientas |
| Conectores | Menú `+` del compositor > Connectors y Customize > Connectors | Estado real de cada conector |
| `claude doctor` | Terminal del humano | Entradas rechazadas; diagnóstico de la CLI, no de la sesión de Desktop |

## Validación estática, efectiva parcial y efectiva pendiente
Validación estática: hashes de configuración y lista de rutas coinciden con TASK-002-RETEST.
Validación efectiva parcial en subagente: deny de Read funciona; ask de Bash no muestra diálogo (RV-02); el subagente no expone herramientas MCP.
Validación efectiva pendiente (humano): véase la sección anterior.

## Limitaciones
Limitaciones que no pueden resolverse desde Desktop (decisión humana de seguir en Desktop):
- L1. `disableClaudeAiConnectors` y los ajustes MCP no alcanzan a los conectores claude.ai en sesiones locales de Desktop.
- L2. No hay un interruptor de conectores limitado a un proyecto. El de la app cambia el valor por defecto de las sesiones nuevas y el de claude.ai es de cuenta.
- L3. Una deny por ID de conector, si se aprueba, depende de IDs no documentados, y no elimina las instrucciones MCP del contexto (RV-05).
- L4. `/status`, `/permissions` y `/mcp` no están documentados en Desktop. Las reglas efectivas y su origen no se pueden listar desde la interfaz.
- L5. No existe un comando documentado que muestre el esfuerzo efectivo de un subagente. El valor que publica `/tasks` es el configurado, y en Desktop no está documentado.
- L6. Orchestrator y los subagentes no pueden observar los diálogos de permiso. La prueba de ask depende del testimonio del humano.
- L7. Las reglas deny y ask no son un sandbox (docs/SECURITY.md). Se mantienen la comprobación Git y la revisión de diff.

Checks no ejecutados: Develop no se invocó (sin alcance de implementación); no se leyeron `.claude/settings.local.json`, `~/.claude.json` ni los valores de otras claves globales; no se activaron ni desactivaron conectores.

## Veredicto
BLOCKED. Fallan en ejecución RV-01 y RV-02, y el modelo y el esfuerzo efectivos de los subagentes no son verificables desde la sesión. Veredicto de Testing en su AUDIT: BLOCKED.

Iteraciones y correcciones: ninguna. Por decisión humana no se amplían reglas deny o ask, no se modifican agentes ni settings.json y no se hacen nuevas rondas de endurecimiento.
Aceptación humana: pendiente. G1 no está aprobado y la auditoría independiente de Codex sigue pendiente.
