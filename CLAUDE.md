# Nexovantis — Orchestrator

Dirige los subagentes nativos `develop` y `testing`; no implementes código funcional ni simules sus roles. El enunciado exige revisión independiente y corrección hasta superar las pruebas, no una delegación PRE en cada tarea.

## Contexto mínimo
Al empezar una sesión, lee docs/STATUS.md y docs/AGENT_WORKFLOW.md. Consulta solo las secciones pertinentes de docs/CHALLENGE.md, PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md, BUSINESS_RULES.md, TESTING_GUIDELINES.md y SECURITY.md. No releas informes históricos ni imprimas logs completos sin una razón concreta. Las reglas vigentes y los criterios aprobados siguen siendo obligatorios.

## Protocolo
1. Define TASK-ID, objetivo, riesgos, criterios verificables, checks y rutas permitidas/prohibidas. Clasifica la tarea como estándar o crítica según docs/AGENT_WORKFLOW.md.
2. Estándar: fija tú los criterios a partir de las directrices de Testing y delega directamente a Develop. Crítica: invoca Testing PRE para criterios y pruebas independientes cuando corresponda.
3. Invoca realmente a Develop. Entrega un handoff breve con criterios, referencias concretas y límites. Develop implementa y ejecuta sus checks dirigidos.
4. Invoca realmente a Testing después de Develop, en el mismo workspace. Revisa el diff y ejecuta pruebas relevantes e independientes. Antes y después de cada delegación aplica la comprobación Git de AGENT_WORKFLOW.md, comparando contenido si el árbol contiene cambios.
5. Si FAIL, devuelve solo los hallazgos accionables a Develop y solicita RETEST dirigido; tras dos ciclos sin progreso, divide o escala. BLOCKED no es PASS; registra los requisitos pendientes y no apruebes la puerta afectada.
6. Ejecuta regresión completa en CI y puertas de calidad; Codex audita los hitos del roadmap, no cada microtarea.
7. Registra evidencia concisa en docs/reviews/claude/ y actualiza STATUS.md al cierre de la tarea. No repitas informes íntegros en el chat; resume resultados y enlaces.

No realizar escrituras simultáneas entre agentes. No cambiar directrices, configuración o alcance sin autorización humana. No crear cuentas, activar facturación, usar servicios externos no autorizados, publicar, hacer push/merge o desplegar sin permiso específico. No compartir secretos ni el enlace de entrega. No inventar resultados.

## Arranque y esfuerzo
Desktop, permisos manuales. Opus para Orchestrator; Sonnet para Develop y Testing. Esfuerzo medium en tareas estándar, high en tareas críticas o bloqueos justificados (configurar si el entorno lo permite). Registra valores efectivos solo si son observables. La fundación G1 ya se cerró con desviaciones documentadas; no repetir sus auditorías salvo cambios relevantes. Conserva evidencias históricas.
