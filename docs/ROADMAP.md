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

## Estado actual (2026-11-26)

F0–F6 cerradas y F7 integrada en `main` mediante el PR #6. [STATUS.md](STATUS.md) recoge la evidencia por SHA y el estado de la regresión. F8 prepara el despliegue y la verificación de la URL pública de producción según [DEPLOYMENT.md](DEPLOYMENT.md). La aceptación final corresponde al responsable de la entrega.

## Registro histórico por fase

Decisiones y comprobaciones previstas al planificar cada fase. Consulta [STATUS.md](STATUS.md) para el cierre vigente y [BUSINESS_RULES.md](BUSINESS_RULES.md) para la semántica aprobada.

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
- Lighthouse quedó asignado a la validación de producción de F8 por decisión humana. [TASK-014](reviews/claude/TASK-014.md).
