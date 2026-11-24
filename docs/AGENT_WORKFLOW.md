# Flujo multiagente

## Modelos objetivo
Orchestrator: Claude Opus 5.5 high; Extra en bloqueos complejos. Develop y Testing: Sonnet 5.5 high; escalar a Opus cuando proceda con permiso. Codex: GPT-6.2 Sol alto para hitos; Astra muy alto en seguridad, concurrencia y auditoría final. Los alias opus/sonnet se resuelven según disponibilidad: comprobar en los selectores de Claude Code Desktop (la terminal es un complemento opcional) y registrar valores efectivos solo cuando sean visibles. No añadir agentes inicialmente ni activar consumo de pago.

## Arranque
Desde la raíz, iniciar Claude Code Desktop, elegir modelo y esfuerzo en sus selectores (`/model` y `/effort` son comandos de la CLI: complementarios y opcionales) y aplicar la sección "Comprobación de agentes, modelos, esfuerzos y permisos". Comprobar las variables de esfuerzo de esa sección; el `effortLevel` global (RV-03) es un factor conocido y no se modifica. Revisar permisos; no usar --dangerously-skip-permissions. Los límites de archivos de los agentes son contractuales, no un sandbox; inspeccionar cada diff. Referencia: https://code.claude.com/docs/en/sub-agents

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

## Handoff
TASK-ID, alcance, dependencias, riesgos, criterios y comandos, más dos listas obligatorias:
- Archivos permitidos (lista cerrada): únicas rutas que el agente puede crear o modificar.
- Archivos prohibidos: rutas que no puede tocar. Siempre prohibidos para Develop: `.claude/**`, CLAUDE.md, AGENTS.md, docs/TESTING_GUIDELINES.md, docs/CHALLENGE.md, `tests/acceptance/**`, `tests/**/independent/**` e informes en `docs/reviews/**`. Prohibidos salvo que la lista cerrada de la tarea los incluya: docs/PRODUCT_REQUIREMENTS.md, docs/BUSINESS_RULES.md, docs/SECURITY.md, `.github/workflows/**`, `.gitignore`, `.gitattributes` y `.editorconfig`.

Una escritura fuera de la lista no se hace: el agente se detiene y la devuelve a Orchestrator. La propiedad de `tests/` por subdirectorio está en docs/TESTING_GUIDELINES.md.

Testing PRE define casos; Develop implementa; Testing POST inspecciona y ejecuta; FAIL vuelve a Develop con hallazgos; Testing RETEST revalida. Tras dos ciclos sin progreso, dividir o escalar. BLOCKED detiene aprobación. Un solo escritor activo y mismo workspace; no confundir conversaciones de roles con agentes nativos.

Codex revisa hitos en una sesión separada sobre SHA/diff estable, sin editar. Orchestrator registra sus hallazgos y vuelve al ciclo. El humano aprueba criterios, merge y deploy.

## Comprobación Git antes y después de cada delegación
Orchestrator ejecuta lo siguiente en la raíz antes de invocar a develop o a testing y de nuevo cuando terminan (también tras cada RETEST):

```
git rev-parse HEAD
git branch --show-current
git status --porcelain -uall
git diff --name-only
git diff --cached --name-only
git ls-files --others --ignored --exclude-standard --directory | grep -E '(^|/)(\.env[^/]*|secrets/?|\.claude/settings\.local\.json)$' || echo "sin ignorados sensibles"
```

Qué comparar: el SHA y la rama no cambian sin autorización; no hay archivos en staging salvo autorización; los archivos modificados y sin rastrear pertenecen a la lista permitida de la tarea (más los informes de Testing); la lista de ignorados sensibles no gana entradas nuevas respecto a la línea base. `.claude/settings.local.json` figura en el filtro por nombre: no se abre, su revisión es del humano, se compara con la línea base y su presencia no es un fallo. Solo se listan nombres de rutas: no se lee su contenido. Dónde registrar: en el informe de la fase (docs/reviews/claude/TASK-NNN-FASE.md) o en el mensaje de Orchestrator, con la salida literal y el exit code. Una diferencia fuera de la lista permitida es un hallazgo High: se detiene el ciclo, se informa al humano y no se revierte con comandos destructivos sin su autorización.

### Comparación de contenido (recomendada para árboles con cambios)
La comprobación por nombres no detecta una edición adicional sobre un archivo que ya estaba modificado o sin rastrear (AUD-04). Con el árbol limpio basta la comprobación por nombres. Con cambios, Orchestrator guarda un manifiesto de `git hash-object` antes de la delegación y otro después, sobre `git diff --name-only HEAD` más `git ls-files --others --exclude-standard`:

```
snap() {
  { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u \
    | grep -Ev '(^|/)(\.env[^/]*|secrets/|node_modules/|\.next/|dist/|build/|coverage/|\.claude/settings\.local\.json$)|\.log$|\.(pem|key|p12|pfx)$|(^|/)(credentials|service-account|id_rsa|id_ed25519)[^/]*$' \
    | while IFS= read -r f; do
        if [ -f "$f" ]; then printf '%s  %s\n' "$(git hash-object -- "$f")" "$f"; else printf 'ausente  %s\n' "$f"; fi
      done
}
SNAP="$(mktemp -d)"   # fuera del repositorio
snap > "$SNAP/antes.txt"
# ... delegación ...
snap > "$SNAP/despues.txt"
diff "$SNAP/antes.txt" "$SNAP/despues.txt"; echo "exit=$?"
```

- Exclusiones: `.env*`, secretos y claves, `node_modules`, `.next`, `dist`, `build`, `coverage`, `*.log` y archivos privados (`.claude/settings.local.json`). Las rutas borradas se registran como `ausente`.
- Los manifiestos se guardan fuera del repositorio y solo contienen nombres y hashes, nunca contenido.
- Una ruta cambiada, añadida o ausente en la comparación que no esté en la lista permitida de la tarea es un hallazgo High (mismo tratamiento que arriba). En tareas de solo lectura solo puede cambiar el informe autorizado.
- Esta sección prevalece sobre la enumeración abreviada de CLAUDE.md.

## Pruebas independientes
Develop no modifica, elimina, salta ni debilita pruebas independientes (`tests/acceptance/**` y casos de Testing en `independent/`). Si cree que una prueba es incorrecta, se detiene y lo pide a Orchestrator, que lo traslada a Testing; la aprobación queda registrada en el informe de Testing. En POST, Testing comprueba el diff contra esas rutas y busca `.skip`, `.only`, `xit`, `xtest`, `.todo` y aserciones relajadas. Detalle en docs/TESTING_GUIDELINES.md.

## Límites de las reglas de permisos
Las reglas deny y ask de `.claude/settings.json` no son una frontera absoluta. No detienen `grep -r .`, scripts que abren archivos, `/usr/bin/curl`, `sh -c '...'` ni `powershell -Command`; Bash puede modificar archivos aunque falten reglas Edit o Write; y los patrones de argumentos son frágiles ante banderas en otro orden. Por eso se mantienen la comprobación Git y la revisión de diff. Lista completa en docs/SECURITY.md.

Tampoco se activan hooks de frontmatter para aplicar límites por ruta: es una decisión pendiente del humano y no forma parte de TASK-002.

## Evidencia
Usar docs/reviews/TEMPLATE.md. Conservar solo extractos saneados de invocaciones reales, resultados y SHA. Nunca crear informes retrospectivos ficticios. Registrar modelos/esfuerzos no verificables como tales.

Ubicación: cuando la tarea autoriza escritura, Testing escribe `docs/reviews/claude/TASK-NNN-FASE.md`; en tareas AUDIT o de solo lectura, Testing devuelve el informe en su mensaje y Orchestrator lo registra. Las auditorías de Codex las registra Orchestrator en `docs/reviews/codex/`. Convención y saneado en los README de cada directorio.

## Higiene del repositorio
`.gitattributes` fija LF (coherente con `.editorconfig`). Los archivos ya rastreados pueden conservar CRLF en el árbol de trabajo; normalizar (`git add --renormalize`) o convertir en masa requiere autorización humana.

## Gate G1
Probar carga de ambos agentes e invocarlos realmente en tarea acotada no productiva. Testing prepara criterios y revisa; si detecta fallos reales, Develop corrige. Codex revisa configuración. La evidencia válida de T01 se define una sola vez en docs/TESTING_GUIDELINES.md. No iniciar Next.js hasta aprobación humana (esa aprobación consta en DH-G1, condicionada al cierre documental).

G1 se cerró por decisión humana explícita DH-G1 (2026-11-24, docs/reviews/claude/TASK-003.md). No es un PASS de Testing ni una aprobación de Codex: AUDIT-001 (docs/reviews/codex/AUDIT-001.md) conserva su veredicto FAIL, y AUD-01 y AUD-03 siguen abiertos como riesgo residual aceptado por el humano (docs/SECURITY.md). Las comprobaciones de la sección anterior no son prerrequisito de G1. Los veredictos históricos de TASK-002 se aplican según docs/reviews/claude/TASK-002-ADDENDUM.md. Para PASS, FAIL y BLOCKED, véase docs/TESTING_GUIDELINES.md.
