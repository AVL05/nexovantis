# Directrices de Testing (contrato obligatorio)

Aplican a Develop, Testing, Orchestrator y Codex. No reducir criterios ni saltar pruebas para aprobar.

## Calidad
TypeScript estricto, lint sin errores, build reproducible; dependencias justificadas. Validación server-side y autorización; RLS, constraints y pruebas negativas. UI accesible con teclado, foco visible, labels, contraste, estados carga/error/vacío/éxito y diseño responsive; objetivo WCAG 2.2 AA, no certificación. No datos simulados presentados como persistencia.

## Scripts objetivo desde F2
pnpm lint; pnpm typecheck; pnpm test:unit; pnpm test:integration; pnpm test:e2e; pnpm build. CI por SHA. Antes del scaffold, estos scripts no existen; solo validar el contrato y delegación. No usar mocks como evidencia de integración real. Entorno de prueba separado; no mutar producción.

| ID | Caso | Resultado |
|---|---|---|
| T01 | Delegación real a ambos subagentes | Evidencia de invocación y respuesta |
| T02 | Login/logout/anónimo | Sesión correcta y panel protegido |
| T03 | Cliente válido/inválido/búsqueda | Persistencia y validación |
| T04 | Asignación de orden | Referencias válidas; persiste al recargar |
| T05 | Estados/dashboard | Transiciones inválidas rechazadas |
| T06 | Dos organizaciones | Lectura/escritura cruzadas rechazadas |
| T07 P1 | Aceptación repetida/concurrente | Una orden y rollback correcto |
| T08 P1 | Consumo inválido/concurrente | No negativos ni duplicados |
| T09 P1 | Cálculos e IVA | Redondeo e importes exactos |
| T10 | Accesibilidad/responsive | Teclado, foco, labels, contraste, móvil sin desbordes |
| T11 | Build/regresión | Checks aplicables superados |
| T12 | Producción incógnito | URL pública estable, login propio y flujo demo |

PASS solo si criterios aplicables ejecutados y superados, sin defectos altos/críticos ni incumplimientos. FAIL ante cualquier incumplimiento; BLOCKED si falta evidencia. Menores fuera de criterios requieren aceptación humana. Registrar comando, exit code, entorno, fecha, SHA/diff y resultado real; indicar omisiones. La aceptación final es humana.
