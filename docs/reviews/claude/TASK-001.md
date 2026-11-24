# TASK-001 — Validación del entorno multiagente (F1 / G1)

Registro saneado redactado por Orchestrator a partir de las respuestas reales de los subagentes. Es un resumen; no reproduce las transcripciones completas. No incluye identificadores internos de sesión ni secretos.

| Campo | Valor |
|---|---|
| TASK/GATE | TASK-001 / G1 (tarea de validación no productiva) |
| Fecha | 2026-11-24 |
| Fase | AUDIT de configuración, solo lectura |
| SHA | `86611a8fc62dcf1c8a34af18a817fac55368ae91` (rama `chore/project-foundation`) |
| Entorno | Windows 11, Claude Code 2.1.327 (escritorio, pestaña Code), sin dependencias instaladas |
| Restricción humana | Solo lectura: sin modificar archivos, instalar, hacer commit/push/deploy ni usar servicios de pago |

## Agentes, modelos y esfuerzos

| Rol | Solicitado | Efectivo | Fuente |
|---|---|---|---|
| Orchestrator | Opus 5.5 / high | Modelo `claude-opus-5-5`. Esfuerzo **no verificable** desde dentro | System prompt de la sesión |
| Testing | `sonnet` / `high` (frontmatter) | Modelo `claude-sonnet-5-5` (autoinformado). Esfuerzo **no verificable**; vio un indicador de razonamiento que no se corresponde claramente con `high` | Respuesta del subagente |
| Develop | `sonnet` / `high` (frontmatter) | Modelo `claude-sonnet-5-5` (autoinformado). Esfuerzo **no verificable**; mismo indicio que Testing | Respuesta del subagente |

La documentación oficial (https://code.claude.com/docs/en/sub-agents, consultada en solo lectura) confirma que `effort` (low/medium/high/xhigh/max) y `model: sonnet` son campos válidos. En esta versión, `/agents` muestra un aviso en lugar del asistente, como confirmó la salida de la CLI del usuario.

## Invocaciones reales

| Orden | Agente | Tipo | Duración aprox. | Herramientas usadas | `git status --porcelain` final |
|---|---|---|---|---|---|
| 1 | `testing` (nativo) | Revisión independiente de configuración y contrato | 123 s | 23 | vacío, exit 0 |
| 2 | `develop` (nativo) | Valoración técnica con los hallazgos de Testing, sin editar | 111 s | 23 | vacío, exit 0 |
| Aux. | `web-fetch` (incorporado) | Lectura de la documentación oficial de sub-agents | 27 s | 1 | n/a |

Orchestrator verificó de forma independiente que el árbol seguía limpio y en HEAD `86611a8` después de ambas invocaciones.

## Hallazgos de Testing

| ID | Gravedad (TASK-001) | Archivo/línea | Resumen |
|---|---|---|---|
| TST-01 | Alta | develop.md:6, testing.md:6,19 | Los límites de escritura solo están en el contrato; no hay paso obligatorio de verificación por diff |
| TST-13 | Alta | agentes, settings.json | Bash sin restricción; sin deny para push/merge/rm/deploy/reset remoto |
| TST-14 | Alta | settings.json:4-9 | Los deny cubren solo `Read` y tres rutas `.env` concretas |
| TST-02 | Media | develop.md:16, testing.md:14 | La propiedad de `tests/` es ambigua |
| TST-03 | Media | develop.md:18 | Develop puede editar settings, .gitignore, documentos de criterios y CI |
| TST-04 | Media | TESTING_GUIDELINES.md:6,22 | Accesibilidad/responsive sin herramienta ni umbral |
| TST-05 | Media | TESTING_GUIDELINES.md:26 | Sin escala de gravedad ni cobertura mínima |
| TST-07 | Media | PRODUCT_REQUIREMENTS.md:15, BUSINESS_RULES.md:10 | ACTIVITY/BR08 y el historial de eventos no tienen caso de prueba |
| TST-08 | Media | BUSINESS_RULES.md:4-5 | Faltan casos para TEAM, archivado y cancelación; la máquina de estados es ambigua |
| TST-10 | Media | CLAUDE.md:15, testing.md:19 | `docs/reviews/claude/` no existe; no se prevén tareas de solo lectura |
| TST-12 | Media | develop.md:5, testing.md:5 | `effort`/`model` efectivos no verificables desde dentro |
| TST-16 | Media | AGENT_WORKFLOW.md:18 | La evidencia de T01 no está definida |
| TST-06 | Baja | TESTING_GUIDELINES.md:9 | No se define qué cuenta como evidencia de T01 |
| TST-09 | Baja (Develop propone media-alta) | testing.md:6 | Los subagentes heredan instrucciones/herramientas MCP fuera de su `tools` |
| TST-11 | Baja | testing.md:14 | "Reproducir fallo previo" sin runner hasta F2 |
| TST-15 | Baja | .gitignore | Faltan patrones de credenciales genéricas, `.claude/agent-memory/` |
| TST-17 | Info | ARCHITECTURE.md:12, BUSINESS_RULES.md:8 | IVA/redondeo y roles sin decidir |
| TST-18 | Info | working tree | CRLF en el working tree; falta `.gitattributes` |

Veredicto literal de Testing: "PASS condicionado", con la recomendación de no pasar G1 todavía. Según testing.md:25, la parte no verificada (delegación a Develop, modelo/esfuerzo) queda como BLOCKED.

## Valoración de Develop

- La arquitectura es viable. Los riesgos están en el diseño de RLS (FK compuestas con columnas nullable y `MATCH SIMPLE`, recursión de políticas), en las RPC `SECURITY DEFINER` (`search_path`, REVOKE de PUBLIC/anon), en la idempotencia (UNIQUE por presupuesto + `FOR UPDATE`) y en la concurrencia de stock (CHECK + UPDATE condicional, pruebas con conexiones paralelas reales).
- Está de acuerdo con todos los hallazgos de Testing que pudo valorar. TST-06 y TST-11 solo los recibió por título. Propone elevar TST-09 a media-alta (MCP de Supabase y computer-use visibles en el contexto).
- Hallazgos propios:
  - D1: Docker y Supabase CLI no se verificaron en F0.
  - D2: no hay allowlist de comandos de solo lectura.
  - D3: Testing y Develop tienen las mismas herramientas.
  - D4: hay que revisar los GRANT y el EXECUTE de RPC en PostgREST además de RLS.
  - D5: la versión de Claude Code que figura en STATUS no estaba verificada. Orchestrator la verificó después: `claude --version` → 2.1.327.
  - D6: a la plantilla de revisión le falta el campo de archivos modificados.

## Problemas adicionales detectados por Orchestrator

- CLAUDE.md:20 y AGENT_WORKFLOW.md:7 piden `/agents`, que ya no abre el asistente en la versión instalada.

## Limitaciones

- No se ejecutaron `/status`, `/permissions`, `/mcp` ni `/agents` desde la conversación; son comandos interactivos del humano.
- No se comprobó el efecto real de las reglas deny sobre Bash, Grep ni subagentes, porque habría exigido intentar leer secretos.
- No hay código, scripts ni pruebas automatizadas (pre-F2).
- Sin auditoría Codex.

## Veredicto

**BLOCKED** (veredicto preliminar del Orchestrator). Las delegaciones reales se completaron, pero el esfuerzo efectivo y la disponibilidad real de herramientas no son verificables, y quedaron tres hallazgos altos sin resolver que requieren decisión humana. No equivale a PASS.

Iteraciones: 1 Testing + 1 Develop (solo lectura, sin correcciones).
Aceptación humana: el humano autorizó las correcciones como TASK-002; G1 sigue sin aprobar.
