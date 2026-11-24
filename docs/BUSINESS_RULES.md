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
