# Flujo multiagente

## Modelos objetivo
Orchestrator, Develop y Testing: Sonnet medium por defecto. High solo por riesgo material o bloqueo justificado; Opus excepcional con autorización humana. Codex: Sol medio-alto para puertas, Astra alto para seguridad, concurrencia y revisión final; muy alto solo por complejidad demostrada. Configurar selectores Desktop y registrar valores efectivos solo si observables. No añadir agentes ni activar consumo de pago.

## Arranque
Desde la raíz, iniciar Claude Code Desktop, elegir modelo y esfuerzo en sus selectores (`/model` y `/effort` son comandos de la CLI: complementarios y opcionales) y aplicar la sección "Comprobación de agentes, modelos, esfuerzos y permisos". No modificar configuración global. Comprobar overrides de esfuerzo solo si hay una discrepancia material. Revisar permisos; no usar --dangerously-skip-permissions. Los límites de archivos de los agentes son contractuales, no un sandbox; inspeccionar cada diff. Referencia: https://code.claude.com/docs/en/sub-agents

## Comprobación de agentes, modelos, esfuerzos y permisos
Desktop con permisos manuales; no usar bypass. Revisa el selector al iniciar sesión y registra el modelo/esfuerzo efectivo solo si es observable. No repitas la auditoría de F1 ni compruebes MCP/CLI en cada tarea. Las limitaciones y evidencias históricas están en [AGENT_RUNTIME_HISTORY.md](AGENT_RUNTIME_HISTORY.md) y los informes de F1. No cambia DH-G1 ni se da por resuelto ningún riesgo residual.

## Handoff
TASK-ID, alcance, dependencias, riesgos, criterios y comandos, más dos listas obligatorias:
- Archivos permitidos (lista cerrada): únicas rutas que el agente puede crear o modificar.
- Archivos prohibidos: rutas que no puede tocar. Siempre prohibidos para Develop: `.claude/**`, CLAUDE.md, AGENTS.md, docs/TESTING_GUIDELINES.md, docs/CHALLENGE.md, `tests/acceptance/**`, `tests/**/independent/**` e informes en `docs/reviews/**`. Prohibidos salvo que la lista cerrada de la tarea los incluya: docs/PRODUCT_REQUIREMENTS.md, docs/BUSINESS_RULES.md, docs/SECURITY.md, `.github/workflows/**`, `.gitignore`, `.gitattributes` y `.editorconfig`.

Una escritura fuera de la lista no se hace: el agente se detiene y la devuelve a Orchestrator. La propiedad de `tests/` por subdirectorio está en docs/TESTING_GUIDELINES.md.

## Flujo orientado a entrega (desde F4)
- Una tarea por módulo completo. Orchestrator fija criterios y riesgos; Develop implementa; Testing POST independiente revisa diff y ejecuta casos aplicables. No reducir reglas de negocio, RLS, transacciones, aislamiento ni criterios de aceptación.
- PRE excepcional: criterios nuevos insuficientemente definidos, riesgo difícil de verificar después o migración destructiva. Para riesgos conocidos, incluidos Auth/RLS, invariantes y concurrencia, criterios explícitos y POST dirigido pueden bastar; justificar en una línea. No omitir casos negativos ni pruebas reales de concurrencia exigibles.
- FAIL vuelve a Develop con hallazgos accionables y Testing RETEST verifica cambios y regresiones relevantes. BLOCKED impide aprobar criterio/puerta; solo trabajo independiente autorizado puede continuar. Tras dos ciclos sin progreso, dividir o escalar. Medium/Low/Informational fuera de criterios se registran y agrupan para F7 con aceptación humana.
- Reutilizar suites, fixtures y componentes. Checks dirigidos; regresión completa en CI sobre SHA exacto. Suites completas locales solo por necesidad material. No saltar checks obligatorios ni sustituir integración real con mocks.
- Handoff corto y referencias precisas. Reutilizar sesión de tarea; nueva por módulo o saturación. No imprimir logs completos. Un escritor activo, mismo workspace. No delegar tareas administrativas. Premium Frontend Director solo para trabajo visual relevante.
- Los tres agentes nativos son obligatorios para desarrollo funcional. Codex revisa puertas y riesgos relevantes sobre SHA/diff estable, con alcance focalizado. No reauditar fases cerradas sin cambio material. El humano aprueba criterios, riesgos, merge y deploy.

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

Qué comparar: el SHA y la rama no cambian sin autorización; no hay archivos en staging salvo autorización; los archivos modificados y sin rastrear pertenecen a la lista permitida de la tarea (más los informes de Testing); la lista de ignorados sensibles no gana entradas nuevas respecto a la línea base. `.claude/settings.local.json` figura en el filtro por nombre: no se abre, su revisión es del humano, se compara con la línea base y su presencia no es un fallo. Solo se listan nombres de rutas: no se lee su contenido. Dónde registrar: en el informe o mensaje de Orchestrator, con SHA, rama, exit codes y resumen de diferencias; adjuntar salida literal relevante solo ante anomalías. Reutilizar el snapshot posterior como línea base de la siguiente delegación si no hubo cambios intermedios. Una diferencia fuera de la lista permitida es un hallazgo High: se detiene el ciclo, se informa al humano y no se revierte con comandos destructivos sin su autorización.

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
Usar docs/reviews/TEMPLATE.md de forma proporcional. Un registro por módulo conserva la respuesta independiente de Testing y las invocaciones/resultados reales, con autor y fase identificados. No duplicar contenido; informe separado solo cuando lo exija el alcance o una auditoría. Conservar solo extractos saneados de invocaciones reales, resultados y SHA. Nunca crear informes retrospectivos ficticios. Registrar modelos/esfuerzos no verificables como tales.

Ubicación: registro único `docs/reviews/claude/TASK-NNN.md` con evidencia independiente de Testing; cuando se requiere informe separado y hay autorización, Testing escribe `TASK-NNN-FASE.md`. En tareas AUDIT o de solo lectura devuelve el informe en su mensaje y Orchestrator lo registra. Las auditorías de Codex las registra Orchestrator en `docs/reviews/codex/`. Convención y saneado en los README de cada directorio.

## Higiene del repositorio
`.gitattributes` fija LF (coherente con `.editorconfig`). Los archivos ya rastreados pueden conservar CRLF en el árbol de trabajo; normalizar (`git add --renormalize`) o convertir en masa requiere autorización humana.

## Gate G1
Probar carga de ambos agentes e invocarlos realmente en tarea acotada no productiva. Testing prepara criterios y revisa; si detecta fallos reales, Develop corrige. Codex revisa configuración. La evidencia válida de T01 se define una sola vez en docs/TESTING_GUIDELINES.md. No iniciar Next.js hasta aprobación humana (esa aprobación consta en DH-G1, condicionada al cierre documental).

G1 se cerró por decisión humana explícita DH-G1 (2026-11-24, docs/reviews/claude/TASK-003.md). No es un PASS de Testing ni una aprobación de Codex: AUDIT-001 (docs/reviews/codex/AUDIT-001.md) conserva su veredicto FAIL, y AUD-01 y AUD-03 siguen abiertos como riesgo residual aceptado por el humano (docs/SECURITY.md). Las comprobaciones de la sección anterior no son prerrequisito de G1. Los veredictos históricos de TASK-002 se aplican según docs/reviews/claude/TASK-002-ADDENDUM.md. Para PASS, FAIL y BLOCKED, véase docs/TESTING_GUIDELINES.md.
