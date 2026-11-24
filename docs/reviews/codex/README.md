# Evidencias de auditoría de Codex

## Propósito
Registro saneado de las auditorías externas de Codex sobre hitos (puertas G1 a G5). Codex es auditor independiente: no edita código, pruebas, documentación, configuración ni Git, y no escribe en este directorio.

## Convención de nombres
- `G<n>-<fecha>.md` para una auditoría de puerta, por ejemplo `G1-2026-12-01.md`.
- `TASK-NNN-AUDIT.md` para una auditoría asociada a una tarea.
- `AUDIT-NNN.md` cuando el humano fija ese nombre (AUDIT-001).

## Plantilla
Usar [docs/reviews/TEMPLATE.md](../TEMPLATE.md), con fase AUDIT.

## Quién registra
Orchestrator registra en este directorio el informe saneado que Codex entrega en la conversación, sobre un SHA o diff estable, y devuelve los hallazgos confirmados al ciclo Develop, Testing. Las gravedades siguen la escala de docs/TESTING_GUIDELINES.md.

## Saneado
No incluir secretos, tokens, claves, identificadores de sesión, credenciales de evaluación ni el enlace privado de entrega. Solo se aceptan evidencias de auditorías realmente ejecutadas; nunca retrospectivas ni ficticias.

## Estado
| Auditoría | Fecha de registro | Alcance | Veredicto | Seguimiento |
|---|---|---|---|---|
| [AUDIT-001](AUDIT-001.md) | 2026-11-24 | Fundación (F0-F1) sobre HEAD `86611a8` con árbol de trabajo modificado | FAIL; NO-GO para F2 hasta cerrar G1 | Hallazgos AUD-01 a AUD-05 tratados en TASK-003 ([informe](../claude/TASK-003.md)) |

El registro conserva literalmente el informe de Codex; la cabecera de Orchestrator indica su hash y el alcance de su evidencia.
