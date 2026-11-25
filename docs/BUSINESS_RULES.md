# Reglas de negocio

- BR01: solo miembros autorizados acceden a datos de su organización. Una referencia a cliente/técnico/orden de otra organización es inválida, también desde la API de datos.
- BR02: cliente y técnico archivados conservan historial; no se asignan a nuevas órdenes. No borrar registros vinculados sin política explícita.
- BR03: estados de orden pendiente → asignada → en curso → completada. Cancelación controlada antes de completar; completada/cancelada son terminales. Asignada/en curso requieren técnico válido. Cambios y eventos se guardan de forma consistente.
- BR04: dashboard deriva indicadores del estado persistido; filtros y recarga mantienen coherencia.
- BR05 (P1): presupuesto editable solo en borrador; aceptación/rechazo terminales. Una aceptación genera exactamente una orden; reintentos no duplican. Operación atómica con restricción única.
- BR06 (P1): importes no negativos, cantidades válidas y redondeo definido; no floats para dinero. Definir y probar política de IVA/redondeo antes de implementar.
- BR07 (P1): cantidades de movimiento positivas, saldo nunca negativo. Consumo y movimiento se registran en la misma transacción; reintentos y concurrencia no duplican ni sobregiran existencias.
- BR08: registro de eventos con identidad, fecha y entidad, sin secretos ni datos innecesarios.

Cualquier cambio de semántica requiere decisión humana documentada y revisión de pruebas.

## Matriz de transiciones de orden (precisión de BR03, sin cambio de semántica)
Derivada solo del texto de BR03, BR01 y BR02. Los puntos ambiguos no se deciden aquí: constan como pendientes de decisión humana (DH-xx) con su lectura estricta por defecto.

| Transición | Estado | Base |
|---|---|---|
| pendiente → asignada | Permitida; requiere técnico válido | BR03 |
| asignada → en curso | Permitida; requiere técnico válido | BR03 |
| en curso → completada | Permitida | BR03 |
| pendiente, asignada o en curso → cancelada | Permitida ("cancelación controlada antes de completar"); desde pendiente y exigencia de motivo: DH-02 | BR03 |
| completada → cualquier estado; cancelada → cualquier estado | Prohibida (estados terminales) | BR03 |
| completada → cancelada | Prohibida (la cancelación es antes de completar) | BR03 |
| Retroceso (p. ej. en curso → asignada, asignada → pendiente) | Prohibida por la lectura estricta por defecto; pendiente de decisión: DH-01 | Lectura estricta |
| Salto (p. ej. pendiente → en curso, pendiente → completada) | Prohibida por la lectura estricta por defecto (secuencia lineal); pendiente de decisión: DH-03 | Lectura estricta |

Restricciones:
- Técnico válido: existe, está activo y pertenece a la misma organización que la orden (BR01, BR02 y TEAM en docs/PRODUCT_REQUIREMENTS.md).
- Cliente válido: existe, está activo y pertenece a la misma organización al crear la orden (BR01, BR02).
- Estados terminales: ninguna transición posterior.
- Cada cambio de estado y su evento se guardan en la misma transacción (BR03, BR08). "Misma transacción" es una interpretación de "de forma consistente" (BR03), pendiente de confirmación humana; hasta entonces se mantiene como lectura estricta y no se relaja.

## Decisiones pendientes de decisión humana
Estado: pendiente de decisión humana. Hasta que se resuelvan, Develop no implementa una semántica propia y los casos afectados no son ejecutables (véase "Casos complementarios" en docs/TESTING_GUIDELINES.md). La columna de propuesta es una propuesta técnica de Develop, no aprobada.

| ID | Pregunta | Lectura estricta por defecto | Propuesta de Develop (no aprobada) | Fase de resolución |
|---|---|---|---|---|
| DH-01 | Reasignar técnico en asignada o en curso; retroceso asignada → pendiente | No definido en BR03; solo transiciones hacia delante | Reasignar solo en asignada, con evento; sin retrocesos de estado | Antes de F4 |
| DH-02 | Cancelar desde pendiente; ¿la cancelación exige motivo? | Cancelación permitida desde cualquier estado no terminal; motivo sin definir | Cancelar desde cualquier estado no terminal; motivo de texto corto opcional guardado en el evento | Antes de F4 |
| DH-03 | Saltar estados (p. ej. pendiente → en curso) | No permitido (secuencia lineal) | Mantener sin saltos | Antes de F4 |
| DH-04 | Archivar técnico con órdenes abiertas asignadas | No definido | Rechazar el archivado hasta reasignar o cerrar esas órdenes | Antes de F3 |
| DH-05 | Archivar cliente con órdenes abiertas | No definido | Rechazar el archivado hasta cerrar o cancelar esas órdenes | Antes de F3 |
| DH-06 | Restaurar (desarchivar) cliente o técnico | No definido | Permitir la restauración con evento de actividad | Antes de F3 |
| DH-07 | Editar campos descriptivos de una orden terminal | No definido (BR03 solo fija el estado como terminal) | Orden terminal de solo lectura | Antes de F4 |
| DH-08 | Conjunto mínimo de eventos ACTIVITY y actor en eventos del sistema o seed | No definido | Eventos mínimos: creación y cambio de estado de orden, asignación, cancelación y archivado; en P1, aceptación o rechazo de presupuesto y movimiento de stock. Actor del sistema identificado explícitamente, nunca nulo | Orden: antes de F4; ACTIVITY P1: antes de F6 |
| DH-13 | Estado inicial y asignación cuando la alta de la orden incluye técnico (PRODUCT_REQUIREMENTS indica "alta con ... técnico"; el flujo demo asigna después) | No definido; la orden nace en pendiente y la asignación es la transición pendiente → asignada | Técnico opcional en el alta; si se indica, la orden nace asignada y genera el evento de asignación | Antes de F4 |

**Aprobadas (2026-11-24, ratificación humana comunicada en TASK-008A):** DH-04, DH-05 y DH-06 quedan aprobadas tal como figuran en la columna de propuesta: se rechaza archivar un técnico con órdenes abiertas asignadas hasta reasignarlas o cerrarlas (DH-04); se rechaza archivar un cliente con órdenes abiertas hasta cerrarlas o cancelarlas (DH-05); se permite restaurar un cliente o técnico archivado con evento de actividad (DH-06). Su implementación corresponde a las fases funcionales pertinentes (TASK-008 y F4); DH-06 requiere adaptar el trigger de congelación de archivados en una tarea crítica con PRE. Las demás filas siguen pendientes.

**Aprobadas (2026-11-25, aprobación humana conjunta al iniciar F4, TASK-011):** DH-01, DH-02, DH-03, DH-07, DH-08 y DH-13 quedan aprobadas tal como figuran en la columna de propuesta:
- DH-01: reasignar técnico solo en estado asignada, con evento; sin retrocesos de estado.
- DH-02: cancelar desde cualquier estado no terminal (pendiente, asignada, en curso); motivo de texto corto opcional guardado en el evento. Una segunda cancelación de una orden ya cancelada no cambia nada ni duplica eventos y comunica que ya estaba cancelada; cancelar una completada se rechaza.
- DH-03: sin saltos de estado (pendiente → asignada → en curso → completada).
- DH-07: orden terminal (completada o cancelada) de solo lectura.
- DH-08: eventos mínimos de orden: creación, cambio de estado, asignación o reasignación, cancelación y archivado; actor siempre identificado, nunca nulo. Los eventos de ACTIVITY P1 siguen pendientes para F6.
- DH-13: técnico opcional en el alta; si se indica, la orden nace asignada y genera el evento de asignación además del de creación.
Implementadas en TASK-011 ([registro](reviews/claude/TASK-011.md)).

**Ratificadas definitivamente (2026-11-24, TASK-010; registro: docs/reviews/claude/TASK-010.md):** roles `owner` y `member` según la matriz de docs/adr/ADR-001-roles-rls.md; una única organización por usuario en el MVP; organizaciones y membresías aprovisionadas fuera de la aplicación, con registro público desactivado; ambos roles pueden gestionar clientes y técnicos de su organización; **los clientes y técnicos archivados son de solo lectura hasta su restauración**: se restaura primero y después se edita, sin combinar restauración y edición en una misma operación, también frente a llamadas directas a PostgREST. Esta regla sustituye a los criterios anteriores que permitían editar registros archivados. DH-04, DH-05 y la ampliación de DH-08 siguen vinculadas a sus fases.

DH-13 lo detectó Develop en TASK-002; no figuraba en la lista de criterios de la fase PRE. El Orchestrator la adoptó como decisión humana formal pendiente (registro: docs/reviews/claude/TASK-002.md); su fase de resolución es antes de F4 (docs/ROADMAP.md).

Precisión de BR08 sin cambio de semántica: "identidad, fecha y entidad" se concreta como identidad del actor, fecha y hora, y tipo e id de la entidad; el evento se guarda de forma consistente con el cambio de negocio (BR03). Los campos adicionales (organización, acción, valores anterior y nuevo) y la inmutabilidad para los usuarios son criterios de prueba propuestos, no aprobados, y forman parte de DH-08 (TC-EVT en docs/TESTING_GUIDELINES.md).
