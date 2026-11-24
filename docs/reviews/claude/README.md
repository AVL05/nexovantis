# Evidencias de revisión de Claude (Orchestrator, Develop y Testing)

## Propósito
Registro saneado de ejecuciones reales de los agentes nativos de Claude Code: criterios PRE, informes POST y RETEST, y registros de auditoría de configuración. Solo se aceptan evidencias de ejecuciones reales; nunca informes retrospectivos ni ficticios.

## Convención de nombres
- `TASK-NNN-FASE.md`, con FASE en PRE, POST, RETEST o AUDIT (por ejemplo `TASK-002-PRE.md`, `TASK-002-POST.md`, `TASK-002-RETEST.md`).
- `TASK-001.md` es un registro histórico anterior a esta convención y no se renombra.

## Plantilla
Usar [docs/reviews/TEMPLATE.md](../TEMPLATE.md).

## Quién escribe
- Cuando la tarea autoriza escritura, Testing escribe `TASK-NNN-FASE.md` en este directorio. Es lo único que Testing escribe aquí.
- En tareas AUDIT o de solo lectura, Testing devuelve el informe en su mensaje y Orchestrator lo registra.
- Develop no escribe en este directorio: entrega su informe en la conversación.
- Orchestrator registra los resultados de otros agentes y la evidencia de verificación humana.

## Saneado
No incluir secretos, tokens, claves, identificadores de sesión, credenciales de evaluación ni el enlace privado de entrega. Conservar solo extractos de respuestas, comandos con su exit code, SHA y resultados reales.
