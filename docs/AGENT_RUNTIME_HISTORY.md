# Registro histórico de configuración de Claude Code

Extracto de AGENT_WORKFLOW.md previo a la simplificación del flujo (2026-11-24). Referencia histórica de F1; no es una lista de comprobaciones obligatorias para cada tarea. El procedimiento operativo vigente está en [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). Los informes históricos y DH-G1 se conservan.

## Comprobación de agentes, modelos, esfuerzos y permisos
En Claude Code 2.1.327 el asistente interactivo de agentes (el comando `agents` precedido de barra) solo muestra un aviso y ya no sirve para verificar. La verificación vigente es la siguiente. "Humano" significa sesión interactiva o terminal del usuario; Orchestrator solo puede ejecutar comandos no interactivos.

La sesión elegida es Claude Code Desktop. Las filas siguientes son las comprobaciones originales de la CLI y se conservan como complementarias y opcionales: varias no están documentadas en Desktop y ninguna es prerrequisito de G1 (DH-G1; véase "Gate G1"). La tabla de trazabilidad posterior da el equivalente en Desktop de cada una.

| Comprobación | Quién | Qué verifica |
|---|---|---|
| `claude --version` | Humano u Orchestrator (no interactivo) | Versión instalada (2.1.327 verificada) |
| `/status` | Humano (solo terminal; complementaria, no documentada en Desktop) | Modelo y "Setting sources" (debe incluir `.claude/settings.json`) |
| `/permissions` | Humano (solo terminal; complementaria, no documentada en Desktop) | Reglas deny, ask y allow vigentes y su origen (proyecto) |
| `/mcp` | Humano (solo terminal; complementaria, no documentada en Desktop) | Servidores y conectores activos; sus interruptores se guardan en `~/.claude.json` (global, ningún agente lo toca) |
| `/context` | Humano (opcional; en Desktop, tarjeta Context) | Si el contexto incluye definiciones o instrucciones MCP |
| `claude doctor` | Humano, en terminal (solo terminal; complementaria) | Problemas de configuración y entradas rechazadas |
| `/tasks` (desde 2.1.242) | Humano (solo terminal; complementaria, no documentada en Desktop) | Fila del subagente con su modelo y esfuerzo |
| `claude --debug` (desde 2.1.296) | Humano, en terminal (solo terminal; complementaria) | Campos no reconocidos de los agentes ("does not recognize or apply") |
| Prueba de una regla `ask` (p. ej. `git add -n <archivo>`), en la sesión principal y en una delegación | Humano (cancelada por DH-G1; sin ejecutar) | Que aparece el diálogo de confirmación. Orchestrator no puede observar esos diálogos y Testing no observó ninguno desde su subagente (registros: docs/reviews/claude/TASK-002.md, ORC-07, y TASK-002-POST.md, POST-03) |

Trazabilidad: cada comprobación original y su equivalente en Desktop (fuente: docs/reviews/claude/TASK-002-RUNTIME.md, sin documentación nueva).

| Comprobación original | Equivalente en Desktop | Estado |
|---|---|---|
| `claude --version` | `claude --version` (no interactivo) | Verificable directamente (2.1.331 en RUNTIME) |
| `/status` (modelo y Setting sources) | Modelo: selector de modelo. Setting sources: sin visor equivalente | Modelo: observación humana. Setting sources: no verificable en Desktop |
| `/permissions` (reglas y origen) | Modo de permisos: selector de modo (`Ctrl+Shift+M`). Reglas efectivas: sin visor equivalente | Modo: observación humana. Reglas: no verificable en Desktop; mitigado con hashes de configuración, pruebas inocuas observadas y revisión humana de `.claude/settings.local.json` |
| `/mcp` (conectores) | Menú `+` del compositor > Connectors y Customize > Connectors | Observación humana; `/mcp` no está documentado en Desktop |
| `/context` | Tarjeta Context del panel de detalles (o `/context`, opcional) | Observación humana |
| `claude doctor` | Terminal del humano; complementario | Diagnóstico de la CLI, no de la sesión de Desktop; no verificable en Desktop |
| `/tasks` (modelo y esfuerzo del subagente) | Selectores de modelo y esfuerzo, y panel Background tasks | Valor configurado; el esfuerzo efectivo sigue no verificable en Desktop |
| `claude --debug` | Terminal del humano; complementario | No verificable en Desktop |
| Prueba de `ask` | Prueba humana en la sesión principal y en una delegación | Cancelada por DH-G1; sin ejecutar, no verificable |
| Carga de los agentes | Delegaciones reales a Testing y a Develop | Verificable por los informes de las delegaciones |

Variables de entorno que alteran el esfuerzo: `CLAUDE_CODE_EFFORT_LEVEL` y `CLAUDE_CODE_SUBAGENT_EFFORT`. Comprobación sin imprimir otras variables:
- Git Bash: `printenv | grep -E '^CLAUDE_CODE_(EFFORT_LEVEL|SUBAGENT_EFFORT)='`
- PowerShell: `Get-ChildItem Env: | Where-Object Name -in 'CLAUDE_CODE_EFFORT_LEVEL','CLAUDE_CODE_SUBAGENT_EFFORT'`

Precedencia del esfuerzo de un subagente: `CLAUDE_CODE_EFFORT_LEVEL`, luego el parámetro `effort` de la invocación, luego el campo `effort` del frontmatter, luego el esfuerzo del agente padre (solo si no hay campo) y por último `CLAUDE_CODE_SUBAGENT_EFFORT`. Procedimiento: Orchestrator ejecuta la comprobación de las variables anteriores en su sesión, revisa que sus invocaciones no pasen parámetro `effort` y registra el resultado en el informe de la tarea. Registro de TASK-002: docs/reviews/claude/TASK-002.md (ORC-02 y ORC-03).

Recarga: los permisos de `.claude/settings.json` y las ediciones de `.claude/agents/*.md` se aplican sin reiniciar (los agentes, en la siguiente delegación). `disableClaudeAiConnectors` no está documentado como recarga en caliente: su validación efectiva exigiría reinicio y comprobación con Connectors y la tarjeta Context en Desktop (`/mcp` y `/context` son complementarios y solo de terminal). En sesiones locales de Desktop no alcanza a los conectores claude.ai (RUNTIME, L1) y su comprobación quedó cancelada por DH-G1.

No existe un comando documentado que liste las herramientas efectivas de un subagente. La autodescripción del propio subagente se registra como evidencia de grado "autoinformado".

Grados de evidencia: verificado directamente (salida de herramienta o comando observada por quien registra, o confirmación humana de la interfaz transcrita), autoinformado (declarado por el agente) y no verificable. La etiqueta heredada "verificado por CLI" de los informes históricos se lee como "verificado directamente". `high` es el esfuerzo configurado; el efectivo es "no verificable" salvo observación humana registrada (DH-G1 canceló esa observación). El `effortLevel` global (RV-03) es un factor conocido y no se modifica.

Ninguna de estas comprobaciones es prerrequisito de G1: DH-G1 canceló o declaró complementarias las que no tienen equivalente en Desktop. Los informes distinguen validación estática de validación efectiva no ejecutada.

