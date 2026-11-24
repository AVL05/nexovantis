# Flujo multiagente

## Modelos objetivo
Orchestrator: Claude Opus 5.5 high; Extra en bloqueos complejos. Develop y Testing: Sonnet 5.5 high; escalar a Opus cuando proceda con permiso. Codex: GPT-6.2 Sol alto para hitos; Astra muy alto en seguridad, concurrencia y auditoría final. Los alias opus/sonnet se resuelven según disponibilidad: verificar en CLI y registrar valores efectivos cuando visibles. No añadir agentes inicialmente ni activar consumo de pago.

## Arranque
Desde la raíz, iniciar Claude Code, seleccionar /model y /effort, verificar /status y /agents. Comprobar que no exista override global de esfuerzo. Revisar permisos; no usar --dangerously-skip-permissions. Los límites de archivos de los agentes son contractuales, no un sandbox; inspeccionar cada diff. Referencia: https://code.claude.com/docs/en/sub-agents

## Handoff
TASK-ID, alcance, archivos permitidos, dependencias, riesgos, criterios y comandos. Testing PRE define casos; Develop implementa; Testing POST inspecciona y ejecuta; FAIL vuelve a Develop con hallazgos; Testing RETEST revalida. Tras dos ciclos sin progreso, dividir o escalar. BLOCKED detiene aprobación. Un solo escritor activo y mismo workspace; no confundir conversaciones de roles con agentes nativos.

Codex revisa hitos en una sesión separada sobre SHA/diff estable, sin editar. Orchestrator registra sus hallazgos y vuelve al ciclo. El humano aprueba criterios, merge y deploy.

## Evidencia
Usar docs/reviews/TEMPLATE.md. Conservar solo extractos saneados de invocaciones reales, resultados y SHA. Nunca crear informes retrospectivos ficticios. Registrar modelos/esfuerzos no verificables como tales.

## Gate G1
Probar carga de ambos agentes e invocarlos realmente en tarea acotada no productiva. Testing prepara criterios y revisa; si detecta fallos reales, Develop corrige. Codex revisa configuración. No iniciar Next.js hasta aprobación humana.
