# TASK-009 — Integración y cierre de F3 (registro de Orchestrator)

- **Fecha:** 2026-11-24.
- **Rama y base:** `feat/supabase-auth`, HEAD `3617d58`. Sin commit ni push (pendiente de autorización humana).
- **Clasificación:** estándar por instrucción humana ("flujo optimizado Develop → Testing"). Criterios de H-1 fijados por Orchestrator a partir de la recomendación de Testing en [TASK-008C-POST](TASK-008C-POST.md) §Hallazgos. Esfuerzo solicitado: medium; modelos/esfuerzo efectivos no verificables.
- **Restricciones respetadas:** sin cambios en Supabase Cloud ni nueva ejecución del seed allí; sin dependencias nuevas; sin órdenes de servicio; sin auditorías administrativas repetidas. La revisión visual usó la sesión ya abierta del owner de Demo Norte en el navegador del panel, **solo lectura** (no se envió ningún formulario ni se archivó/restauró nada).

## Alcance
1. **H-1 (rechazado por el humano):** el seed solo archiva filas insertadas en esa misma ejecución; respeta registros restaurados o modificados.
2. **M1:** nombre accesible "Mostrar contraseña" / "Ocultar contraseña" (texto visible al inicio del nombre).
3. **M2:** teléfono sin cortes y email sin `break-all`; truncado solo cuando no cabe, con `title` y texto completo en el DOM.
4. Integración funcional de F3, permisos/aislamiento, regresión de navegación/accesibilidad/responsive, revisión visual y preparación de AUDIT-002.

## Fases
| Fase | Agente | Resultado |
|---|---|---|
| DEV | develop | Seed con `insert … returning` + archivado por ids recién insertados; M1 con `sr-only`; M2 en RecordList/RecordDetails. Seed 16/16 (3 casos nuevos H-1). |
| POST | testing | **PASS** ([TASK-009-POST](TASK-009-POST.md)). F-1 Low (`max-w-64` sin efecto en la celda), F-2 Informational. |
| DEV-2 | develop | F-1: truncado movido a un `span` de bloque. |
| RETEST | testing | **PASS** ([TASK-009-RETEST](TASK-009-RETEST.md)); F-1 cerrado. |
| Visual | orchestrator (Premium Frontend Director, solo revisión) | **V-1 Medium:** con datos reales, a 1280/1440 se truncaban los 20 emails a 256 px con la columna a 323–377 px; a 1024 los nombres ocupaban 2–3 líneas. |
| DEV-3 | develop | Columnas con anchos relativos; celda email `max-w-0` + `span block truncate`; teléfono/estado `w-px whitespace-nowrap`. |
| RETEST-2 | testing | **PASS** ([TASK-009-RETEST-2](TASK-009-RETEST-2.md)); V-1 cerrado. |

Comprobación Git (nombres + manifiesto `git hash-object`) antes y después de cada delegación: SHA `3617d58`, rama sin cambios, staging vacío, ignorados sensibles sin cambios (`.claude/settings.local.json`, `.env.local`). Diferencias limitadas en cada fase a su lista permitida más el informe de Testing.

## Archivos de la tarea
`supabase/seeds/demo-crm.sql`, `tests/integration/seed-demo.test.ts`, `docs/SEED.md`, `src/app/login/login-form.tsx`, `tests/unit/login-form.test.tsx`, `src/components/ui/records/RecordList.tsx`, `src/components/ui/records/RecordDetails.tsx`; informes TASK-009-POST/RETEST/RETEST-2 y este registro; `docs/STATUS.md`.

## Resultados locales (último ciclo, RETEST-2)
format:check, lint, typecheck y build: exit 0. Unit 260/260 (18 archivos). Integration 235/235 (7 archivos, incluidos 16 del seed; POST). E2E local 12/12. `test:supabase` y `test:e2e:supabase` no ejecutables en local (sin Docker/Supabase CLI): su evidencia vigente es la CI 45484066916 sobre `3617d58`, que **no** corresponde al árbol actual.

## Integración funcional de F3
Matriz criterio → evidencia en [TASK-009-POST](TASK-009-POST.md) (autenticación, clientes, técnicos, actividad, RLS/GRANT owner/member, aislamiento entre organizaciones, creación, edición, búsqueda, paginación, archivado y restauración, navegación, accesibilidad y responsive). No se detectaron huecos que justifiquen pruebas nuevas, salvo las tres regresiones del seed (H-1).

## Revisión visual (Premium Frontend Director, modo Refined, solo revisión)
Sesión real del owner de Demo Norte con datos demo de Cloud, dev server local.

| Gate | Estado | Evidencia |
|---|---|---|
| G3 Visual | PASS | 375, 768, 1024, 1280, 1440 px: panel, `/customers` (página 1 y 2, búsqueda con y sin resultados, filtro archivados), `/technicians`, detalle, alta y edición (sin enviar). 1920 px NOT RUN. |
| G4 Interacciones | PASS parcial | Navegación, paginación (`?pagina=2`), filtros y estados vacíos revisados; teclado no recorrido manualmente (cubierto por E2E existentes). |
| G5 Responsive | PASS | `scrollWidth = clientWidth` en todos los anchos; teléfono en 1 línea; tras DEV-3: 1440 → 4/20 emails truncados (los más largos), nombres en 1 línea; 1280 → 11/20, nombres ≤2; 1024 → truncado con `title`, nombres ≤2. Tarjetas móviles: email ajusta en guiones, sin desborde. |
| G6 Accesibilidad | PASS limitado | M1 verificado por prueba unitaria; sin errores de consola. Sin auditoría axe (dependencia no aprobada). No se declara conformidad WCAG. |
| G7 Ingeniería | PASS | Checks locales arriba. |
| G8 Rendimiento | NOT RUN | Sin medición. |
| G10 Regresión | PASS local / CI pendiente | Ver resultados locales. |
| G11 | N/A | No es un rediseño. |

Observaciones no bloqueantes (sin cambio, fuera de alcance): en móvil, "Archivar técnico/cliente" es un botón rojo a todo el ancho, muy prominente para una acción secundaria; `?page=2` se ignora en silencio (el parámetro es `pagina`).

## Hallazgos
| ID | Gravedad | Estado |
|---|---|---|
| H-1 | Low | **Cerrado** (DEV + POST). Cloud no se ha re-ejecutado: sus datos actuales no cambian. |
| TASK-008B-M1 | Mejora | **Cerrado.** |
| TASK-008B-M2 | Mejora | **Cerrado** (DEV, DEV-2, DEV-3). |
| F-1 | Low | Cerrado (RETEST). |
| V-1 | Medium | Cerrado (RETEST-2 sintético + medición de Orchestrator con datos reales). |
| F-2 | Informational | Abierto: M2 sin prueba versionada con sesión real. Requiere aceptación humana o una aserción de overflow en `tests/e2e-supabase/crm.spec.ts` en una tarea futura. |

## Decisiones humanas (2026-11-24, tras el informe)
- Commit autorizado de TASK-009 junto con TASK-008C y sus correcciones. Push no autorizado.
- F-2 aceptado como observación informativa.
- Comprobaciones visuales adicionales (1920 px, teclado manual), axe, rendimiento y pulido menor (botón de archivado en móvil) diferidos a F7.
- Comportamiento actual del parámetro `pagina` aceptado (`?page=` se ignora).
- G2 sigue abierto; F4 no se inicia.

## Preparación para G2 / AUDIT-002
**Estado:** TASK-009 en PASS local. G2 **no** está listo para cerrarse hasta: (1) commit autorizado, (2) CI verde (quality + supabase) sobre ese SHA, (3) AUDIT-002 de Codex (Astra muy alto) sobre ese SHA estable, (4) aprobación humana.

Alcance propuesto para AUDIT-002 (sobre el SHA final, diff `c4c3bdf..SHA`): migraciones y RLS/GRANT (ADR-001), triggers SECURITY DEFINER de archivado/restauración y `activity_events`, auth/sesión/proxy, módulos de clientes y técnicos, seed demo y `docs/SEED.md`.

Riesgos residuales para la auditoría (de [TASK-009-POST](TASK-009-POST.md) §5):
1. R1: validez residual del JWT ante PostgREST hasta su expiración (aceptado por el humano en TASK-007).
2. Comodín de búsqueda (`ilike`): escape cubierto en CI; revisar longitud y coste.
3. DH pendientes (DH-01..03, DH-07, DH-08, DH-13; DH-09 de cobertura).
4. PGlite vs Supabase: RLS/seed validados localmente con shim; confirmación real en CI y, para el seed, en la ejecución controlada de TASK-008C.
5. Seed administrativo: riesgo de ejecución accidental en producción; procedimiento en `docs/SEED.md`.
6. F-2 (M2 sin prueba versionada).
7. Regresión completa dependiente de CI sobre el SHA final.
