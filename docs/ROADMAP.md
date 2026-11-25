# Roadmap y puertas de calidad

| Fase | Alcance | Gate |
|---|---|---|
| F0 | Entorno y repo | Herramientas comprobadas |
| F1 | Contrato, arquitectura, agentes y delegación real | G1: Testing + Codex Sol alto + humano |
| F2 | Scaffold, scripts, CI, layout | Build/CI inicial y Testing |
| F3 | Auth, RLS, seed, clientes/técnicos | G2: pruebas cruzadas + Codex Astra muy alto |
| F4 | Órdenes, estados y dashboard | G3: P0 completo + Codex focalizado en órdenes/RLS/transacciones |
| F5 | Presupuestos transaccionales | Testing y concurrencia |
| F6 | Inventario y actividad | G4: Testing + Codex focalizado en concurrencia/idempotencia si P1 |
| F7 | Pulido, accesibilidad y regresión | Testing y aceptación humana |
| F8 | Deploy público y entrega | G5: revisión final de Codex, incógnito y aceptación humana |

Un módulo completo por fase. Priorizar P0 funcional y desplegable. P1/P2 no comprometen P0 ni la entrega; el humano decide reducir alcance opcional si amenaza la entrega. No aprobar un criterio o puerta con FAIL/BLOCKED. Ramas pequeñas y commits descriptivos, sin force push. Revisar diff y evidencia antes de integrar. Actualizar STATUS.md con resultados reales.

## Estado actual (2026-11-25)
F0–F3 cerradas. G1 por decisión humana DH-G1, no es PASS de Codex; AUDIT-001 conserva FAIL y riesgos aceptados. G2 cerrada tras AUDIT-002-RETEST-3 PASS, CI 45591123196 y Cloud verificado. Próximo módulo F4 (órdenes y dashboard P0). STATUS.md contiene la evidencia. Se conservan fases, criterios y puertas. Las comprobaciones CLI de F1 son complementarias, no prerrequisitos reabiertos.

## Registro de pendientes por fase
Registro histórico de decisiones y pendientes por fase: F1–F3 cerradas; no reabrir tareas resueltas. Comprobaciones pendientes F4–F8 vigentes. Los nombres de tareas futuras son propuestas; el ID definitivo lo asigna Orchestrator. Las decisiones de semántica de negocio (DH-01..DH-08 y DH-13) están en [BUSINESS_RULES.md](BUSINESS_RULES.md).

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
