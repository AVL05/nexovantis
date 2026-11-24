# TASK-009 RETEST-2

- Fase: RETEST dirigido. Rama feat/supabase-auth, HEAD 3617d58, árbol con cambios sin commit. Modelo: Sonnet 5.5 (autoinformado).
- Escritura: solo este informe. Sin commit/push/dependencias/Cloud. No ejecuté nada contra Cloud.

## Diff de RecordList.tsx
- Cabeceras de la tabla: nombre `w-[34%] min-w-48`, email `w-[40%]`, teléfono y estado `w-px whitespace-nowrap`.
- Celda de email: `Td max-w-0` con `span block truncate` y `title={email}`. Ya no usa `max-w-64`.
- Teléfono y estado: `whitespace-nowrap` en las celdas.
- Tarjetas móviles: sin cambios respecto al RETEST.
- El diff no toca nada más. El resto del estado Git es el mismo que en el RETEST.

## Checks
| Check | Resultado |
|---|---|
| pnpm format:check | exit 0 |
| pnpm lint | exit 0 |
| pnpm typecheck | exit 0 |
| pnpm test:unit | exit 0, 18 archivos y 260 tests pasados |
| pnpm build | exit 0 |
| pnpm test:e2e | exit 0, 12 pasados |

## Playwright sintético
Chromium con el CSS compilado real de `.next`. Markup equivalente a la tabla con 12 filas y emails y nombres de longitud variada. Hay una barra lateral de 256 px y un padding de 32 px, que aproximan el shell. No es la ruta autenticada.

| Ancho | Scroll de página | Scroll de la tabla | Emails truncados (de 12) | Corte sin overflow | Teléfono | Nombres | Cabeceras alineadas |
|---|---|---|---|---|---|---|---|
| 1024 | 0 | 0 | 6 | 0 | 1 línea | máx. 2 líneas | sí (diferencia 0 px) |
| 1280 | 0 | 0 | 6 | 0 | 1 línea | 1 línea | sí |
| 1440 | 0 | 0 | 2 | 0 | 1 línea | 1 línea | sí |
| 768 | 0 | no aplica | no aplica | no aplica | 1 línea | no aplica | no aplica |
| 375 | 0 | no aplica | no aplica | no aplica | 1 línea | no aplica | no aplica |

- Truncado: solo se corta el texto cuando `scrollWidth > clientWidth` en el span. Los emails que caben se ven completos.
- A 1024 la columna de email mide 256 px y los nombres largos pasan a 2 líneas. Es el máximo aceptable, como dijo Orchestrator.
- El `title` coincide con `textContent` y el texto completo está en el DOM.
- Las tarjetas a 375 y 768 no tienen desbordes y el teléfono ocupa 1 línea (20 px).

## Hallazgos
- V-1 (Medium): **cerrado**. El corte ya no se aplica de forma innecesaria. A 1280 y 1440 la columna se ensancha y se corta solo cuando hace falta. A 1024 no hay scroll horizontal.
- F-2 (Informational): **sigue abierto**. No hay prueba versionada de M2, que necesita sesión real y datos demo. Hace falta aceptación humana registrada o una tarea futura con aserción de overflow en e2e. No afecta al veredicto.
- Pendiente: mi comprobación es sintética. La medición con sesión real la aporta Orchestrator (1440, 1280 y 1024 sin overflow), y no la reproduje yo.

## Veredicto: PASS
No hay hallazgos Critical/High.
