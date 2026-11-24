# Roadmap y puertas de calidad

| Fase | Alcance | Gate |
|---|---|---|
| F0 | Entorno y repo | Herramientas comprobadas |
| F1 | Contrato, arquitectura, agentes y delegación real | G1: Testing + Codex Sol alto + humano |
| F2 | Scaffold, scripts, CI, layout | Build/CI inicial y Testing |
| F3 | Auth, RLS, seed, clientes/técnicos | G2: pruebas cruzadas + Codex Astra muy alto |
| F4 | Órdenes, estados y dashboard | G3: P0 completo + Codex Sol alto |
| F5 | Presupuestos transaccionales | Testing y concurrencia |
| F6 | Inventario y actividad | G4: Testing + Codex Astra muy alto si P1 |
| F7 | Pulido, accesibilidad y regresión | Testing y aceptación humana |
| F8 | Deploy público y entrega | G5: Astra muy alto, incógnito y aceptación humana |

Una fase a la vez. P1/P2 no comprometen P0. No avanzar con FAIL/BLOCKED. Ramas pequeñas y commits descriptivos, sin force push. Revisar diff y evidencia antes de integrar. Actualizar STATUS.md con resultados reales.

## Estado actual (2026-11-24)
F0 completada. F1: G1 cerrado por decisión humana explícita DH-G1 (2026-11-24, [TASK-003.md](reviews/claude/TASK-003.md)); no es un PASS de Testing ni una aprobación de Codex, y AUDIT-001 conserva su FAIL. F2 autorizada por el humano, condicionada al cierre documental de F1. F3 a F8 pendientes. El detalle y la evidencia están en [STATUS.md](STATUS.md). No se cambian fases, alcance ni puertas.

Las validaciones de la CLI (`/permissions`, `/status`, `/mcp`, `/context`, `/tasks` y reinicio) son complementarias, opcionales, solo de terminal o no documentadas en Desktop; ninguna es prerrequisito de G1 (DH-G1). Equivalentes en Desktop y límites en [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md).

## Registro de pendientes por fase
Todo lo siguiente está pendiente y no implementado. Los nombres de tareas futuras son propuestas; el ID definitivo lo asigna Orchestrator. Las decisiones de semántica de negocio (DH-01..DH-08 y DH-13) están en [BUSINESS_RULES.md](BUSINESS_RULES.md).

### F1: riesgo residual aceptado por el humano (DH-G1), no verificado
- Aceptado por el humano, no verificado ni resuelto: validaciones de la CLI y reinicio (`/permissions`, `/status`, `/mcp`, `/context`, `/tasks`, `claude doctor`; complementarias, solo de terminal o no documentadas en Desktop); carga de develop.md tras el reinicio con una invocación trivial; prueba de que las reglas `ask` muestran su diálogo (POST-03, cancelada); DH-12 no ratificada (POST-02).
- Auditoría de Codex sobre la configuración (G1): realizada, AUDIT-001 con veredicto FAIL conservado (no es una aprobación de Codex). AUD-01 y AUD-03 abiertos como riesgo residual aceptado; AUD-04 abierto con mitigación documental; AUD-02 rectificado en [TASK-002-ADDENDUM.md](reviews/claude/TASK-002-ADDENDUM.md); AUD-05 atendido con el procedimiento de Desktop.

### F2
- Harness y automatización de accesibilidad (propuesta: Playwright con axe-core, sujeta a aprobación de dependencias) y harness de pruebas (runner); detalle en docs/TESTING_GUIDELINES.md.
- Umbral de cobertura de código: decisión humana (DH-09); no existe número aprobado.
- Matriz de trazabilidad BR/criterio → casos positivos y negativos.
- Versiones estables compatibles y lockfile; scripts objetivo de testing.

### F3
- Roles y permisos exactos (ADR).
- RLS por operación y membresía, y pruebas con dos organizaciones.
- GRANT y exposición de PostgREST además de RLS.
- Preflight del entorno local: Docker, WSL y Supabase CLI no verificados; la instalación la decide el humano.
- Decisiones DH-04, DH-05 y DH-06 (archivado y restauración) antes de implementar CRM y TEAM.
- Ejecución de los casos TC-TEAM y TC-ARCH.

### F4
- Decisiones DH-01, DH-02, DH-03, DH-07, DH-08 (órdenes) y DH-13 antes de implementar estados.
- Ejecución de los casos TC-ORD, TC-CANC y TC-EVT del historial de órdenes (propuesta: eventos de órdenes).
- Ejecución de T10 por interfaz en las pantallas de F3 y F4.

### F5
- IVA y redondeo (BR06): decisión humana y ADR antes de implementar.
- Hardening de RPC SECURITY DEFINER (search_path, REVOKE de PUBLIC y anon, EXECUTE) para aceptar presupuesto.
- Concurrencia e idempotencia de la aceptación de presupuesto.

### F6
- Hardening de RPC SECURITY DEFINER y EXECUTE en consumo de stock.
- Concurrencia e idempotencia del consumo de stock con conexiones paralelas reales.
- ACTIVITY P1: decisión DH-08 y casos TC-EVT.

### F7
- Regresión final de accesibilidad y responsive (T10) según docs/TESTING_GUIDELINES.md.
