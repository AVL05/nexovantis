# TASK-002 — Informe de Develop, iteración 2 (copia registrada por Orchestrator)

Esta es la respuesta final del subagente `develop` en la invocación real de la iteración 2 de TASK-002 (2026-11-24), que corrige hallazgos de `TASK-002-POST.md`. Orchestrator la registra tal como la recibió, con formato Markdown, sin añadir resultados y sin identificadores internos. Todo lo que contiene es **autoinformado por Develop**; la verificación corresponde a Testing (RETEST).

---

Apliqué las correcciones pedidas y no me autoapruebo; el veredicto es de Testing (RETEST). `.claude/settings.json` fue lo último que edité y el JSON valida. No he ejecutado ninguna regla PowerShell: Develop no tiene esa herramienta.

## Git
- **Inicial** (`git status --porcelain=v1 -uall`): 15 `M`, `.gitattributes`, los 2 README nuevos y los 5 informes de `docs/reviews/claude/` (`TASK-001`, `TASK-002-PRE`, `TASK-002-POST`, `TASK-002-DEVELOP-1`, `TASK-002`). `git diff --cached --name-only` vacío. Es el estado esperado.
- **Final**: mismo conjunto de rutas, sin ninguna ruta nueva. Staging vacío, HEAD `86611a8fc62dcf1c8a34af18a817fac55368ae91`, rama `chore/project-foundation`. No hubo `git add`, commit, checkout, push ni merge.
- **Diff final** (`git diff --stat`): 15 archivos, 913 inserciones, 29 eliminaciones. Las eliminaciones siguen siendo 29: esta iteración no quitó ninguna línea ni regla.
- **Hashes de control** (`sha256sum -c`, exit 0): siguen idénticos los 6 informes de `docs/reviews/claude/`, `docs/CHALLENGE.md`, `.env.example`, `README.md` y `.editorconfig`.

## Correcciones
Las líneas son las posteriores a la edición.

- **POST-01** (`docs/AGENT_WORKFLOW.md:28`): quité la afirmación puntual sin respaldo. Ahora es un paso de procedimiento (Orchestrator ejecuta la comprobación de las variables, revisa que no pase `effort` y lo registra) más la referencia "docs/reviews/claude/TASK-002.md (ORC-02 y ORC-03)".
- **POST-04** (`.claude/settings.json:155-197`, `docs/SECURITY.md:17`): añadí 43 reglas Bash de borrado recursivo.
  - Cubren `rm -r*` y `rm -R*` (`-rf`, `-rv`, `-rI`, `-rfv`…) y `rm -<f|v|i|I|d|P|x><r|R>*` (`-vr`, `-dr`, `-Ir`…).
  - Cubren también clusters de tres letras con f, v, i, I (`-fvr`, `-ivR`…) y la bandera tras otros argumentos (`rm * -r*`, `rm * -R*`, `rm * --recursive*`).
  - Dejé las reglas previas. SECURITY.md conserva la advertencia de que los patrones por prefijo son frágiles y no exhaustivos.
- **POST-05** (`.claude/settings.json:288-…` y `:322`, `docs/SECURITY.md:18, 38`): añadí 30 reglas PowerShell de borrado.
  - 28 reglas `PowerShell(<nombre> <bandera>)`, con `Remove-Item` y los alias `rm`, `ri`, `del`, `erase`, `rd`, `rmdir`, y las banderas `-r*`, `-R*`, `-fo*`, `-Fo*`. Incluyo ambas capitalizaciones porque no está verificado si el emparejamiento distingue mayúsculas. Los alias son defensa en profundidad, dado que según los hechos del Orchestrator se canonicalizan a `Remove-Item`.
  - 2 reglas `erase /s` (con y sin argumentos).
  - No usé comodín intermedio, porque su soporte en PowerShell no está documentado. Quedan solo bajo el `ask` genérico `PowerShell(Remove-Item *)`: `Remove-Item -Path x -Recurse`, `Remove-Item x -Recurse`, `-Path x -Force`, `-Recurse:$true` tras otro parámetro y llamadas .NET. Documentado como residuo en SECURITY.md:38.
- **POST-06**:
  - **Deny** (8 reglas Bash y 8 PowerShell): `supabase branches`, `supabase functions delete`, `supabase migration up --linked` y `supabase migration up --db-url`. Las dos primeras por facturación o destrucción remota; la tercera por la misma razón que `db push`; la cuarta por coherencia con `db reset --db-url`, ya denegado.
  - **Ask** (8 reglas, Bash y PowerShell): `gh issue` y `gh run`. Escriben en el remoto o relanzan, cancelan o borran ejecuciones de CI. Elegí ask amplio en vez de enumerar subcomandos de escritura.
  - **Ask extra** (4 reglas): `PowerShell(cmd)` y `PowerShell(cmd.exe)`, con y sin argumentos. No me lo pedías: sin ellas, `cmd /c rmdir /s` esquivaría las reglas de borrado de PowerShell.
- **POST-07** (`docs/SECURITY.md:21`): no estreché los `ask` de `git config` ni de `git stash`, y lo documenté. Un `allow` no puede exceptuar un `ask` (orden deny, ask, allow), y `git config <clave> <valor>` escribe sin bandera, así que no se distingue por prefijo de `git config <clave>`. Ningún comando legítimo queda bloqueado.
- **POST-08** (`docs/ARCHITECTURE.md:17`): quité `tests/support` de los pendientes registrados en ROADMAP y añadí que está definida como compartida en la tabla de propiedad de `tests/` de TESTING_GUIDELINES.md.
- **POST-10** (`docs/SECURITY.md:28`): reformulé la premisa de DH-12 como observación del Orchestrator (ORC-06), basada en la semántica documentada de `mcp__*` y en los nombres de herramientas de la app, "no verificada ejecutando ese deny".
- **POST-11** (`docs/TESTING_GUIDELINES.md:45`, `.claude/agents/develop.md:34`, `.claude/agents/testing.md:26`): si una ruta encaja en más de una fila, prevalece la más específica (ejemplo: `tests/unit/independent/**` frente a `tests/unit/**`). Ninguna fila de la tabla cambia.
- **POST-12**:
  - **(a)** `docs/BUSINESS_RULES.md:32`: "misma transacción" queda marcada como interpretación de "de forma consistente" de BR03, pendiente de confirmación humana, sin relajar la lectura estricta. Sin ID de DH nuevo; registrarla como DH-14 lo decide Orchestrator.
  - **(b)** `docs/TESTING_GUIDELINES.md:136`: TC-EVT-01..08 marcados como condicionados a DH-08.
  - **(e)** `docs/BUSINESS_RULES.md:49`: DH-13 consta como DH formal pendiente adoptada por el Orchestrator, con fase "antes de F4". ROADMAP ya la lista en F4 (línea 44) y en el registro de pendientes (línea 23), y STATUS también.
- **POST-02 y POST-03**: solo documenté la validación pendiente, sin cambiar reglas ni DH-12. Está en `docs/AGENT_WORKFLOW.md:22` (fila nueva de la tabla de comprobaciones), `docs/SECURITY.md:22 y 42`, `docs/STATUS.md:12` y `docs/ROADMAP.md:26`: ratificación humana de DH-12 y comprobación de que las reglas `ask` muestran su diálogo, también desde subagentes.
- **STATUS.md** (no pedido): corregí `docs/STATUS.md:8 y 18`, que seguían diciendo "pendiente de Testing POST" y "sin veredicto". Ahora reflejan que POST emitió BLOCKED sin FAIL ni Critical/High y que el RETEST está pendiente.

## Reglas en `.claude/settings.json`
- **Deny**: 232 → **321** (+89: 16 Supabase, 43 `rm`, 28 PowerShell `Remove-Item` y alias, 2 `erase /s`).
- **Ask**: 142 → **154** (+12: 8 de `gh issue` y `gh run`, 4 de `cmd` en PowerShell).
- **Eliminadas**: ninguna. El script solo inserta.
- Sin `allow`, `defaultMode` en `default`, `disableBypassPermissionsMode` en `disable`, `disableClaudeAiConnectors` en `true`. Sin duplicados ni reglas vacías, y sin intersección entre deny y ask.

## Comandos y exit codes
- `git status --porcelain=v1 -uall` (inicial y final), `git diff --cached --name-only`, `git rev-parse HEAD`, `git branch --show-current`, `git diff --stat`: todos exit 0.
- Comprobación de que `JSON.stringify(parse(...), null, 2)` reproduce el archivo original: exit 0.
- `node apply-rules.js`, primero sobre una copia y luego sobre `.claude/settings.json`: exit 0, con los recuentos 321/154.
- `node -e "JSON.parse(...)"` sobre `.claude/settings.json`: exit 0.
- `node match.js` sobre la copia y sobre `.claude/settings.json`: exit 0, **0 fallos**. Es una simulación propia del emparejamiento, con `*` como cualquier secuencia incluidos espacios; PowerShell se compara sin distinguir mayúsculas, un supuesto no verificado. No sustituye a `/permissions`.
  - Quedaron libres 43 comandos legítimos de Bash: `git status|diff|log|show|ls-files|check-ignore|check-attr|rev-parse`, `git branch --show-current`, `pnpm lint|typecheck|test|build|dev`, `node`, `ls`, `grep`, `cat`, `rm archivo`, `rm -f archivo`, `supabase start|status|migration new|db lint`.
  - En PowerShell, los 12 comandos legítimos probados quedan libres o en `ask`.
  - Denegó las 33 variantes peligrosas probadas en Bash y las 22 en PowerShell.
- `cat .env.example`: exit 0, 4 líneas. `git log -1`, `node --version` (v24.22.2) y `pnpm --version` (12.16.1): exit 0, sin denegación. Esto no confirma efectividad real en la CLI.
- `sha256sum -c`: exit 0. Grep de secretos sobre `git diff HEAD`: 0 coincidencias (exit 1 de grep).

## Residuos y no ejecutado
- **Sin regla, solo documentados** (`docs/SECURITY.md:36-39`):
  - Bash: clusters de cuatro o más banderas con la r al final (`rm -fvIr`), `find -delete`, `xargs rm`, `unlink`, envoltorios.
  - PowerShell: las formas con parámetro no inicial citadas en POST-05.
- **POST-02 y POST-03** siguen abiertas: reinicio, `/mcp`, `/context`, ratificación humana de DH-12 y diálogos de `ask`.
- **No ejecutado**: `/permissions`, `/status`, `/mcp`, `/context`, `/tasks`, `claude doctor`, `claude --debug` y cualquier regla PowerShell real. No existen `package.json` ni `tests/`.

## Riesgos
- Las reglas con comodín final sin espacio (`rm -r*`, `-r*`/`-fo*` en PowerShell) y la de comodín intermedio en Bash (`rm * -r*`) se apoyan en la semántica documentada para Bash. En PowerShell no está verificada, y la sensibilidad a mayúsculas tampoco. Si alguna no se aplica, los residuos quedan bajo el `ask` genérico.
- Falso positivo posible: `rm * -r*` bloquearía un `rm` con un argumento literal que empiece por `-r`. Hay que vigilarlo en `/permissions` y en el uso real.
- `gh issue`, `gh run` y `git stash list` provocarán confirmación: molestia, no bloqueo.
- Las reglas nuevas se aplican a las llamadas siguientes por la recarga en caliente; no afectaron a los comandos legítimos de Develop.

Scripts auxiliares fuera del repositorio, en el scratchpad de la sesión (`apply-rules.js`, `match.js`, `settings-copy.json`, `hash-before.txt`).
