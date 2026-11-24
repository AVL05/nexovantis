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
