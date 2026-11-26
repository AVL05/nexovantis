# TASK-014 — F7 Pulido final (registro)

- Fecha: 2026-11-25. Rama `feat/final-polish`, base `d748ae5` (main = origin/main). Flujo orientado a entrega (Sonnet medium; esfuerzo efectivo no observable). Sin PRE: pulido sin riesgo excepcional; el único cambio de consulta (C7) tiene criterios explícitos y se verifica en POST y CI.
- Skill obligatoria: Premium Frontend Director (`.claude/skills/premium-frontend-director/`), perfil Core, ambición Refined (G11 no exige transformación). Identidad "Plano técnico" de [docs/design.md](../../design.md).
- Alcance excluido: funcionalidades nuevas, migraciones, cambios arquitectónicos, rediseño general, dependencias, escrituras en Cloud, reapertura de G1–G4, suites completas locales.

## Criterios
| ID | Criterio |
|---|---|
| C1 | Coherencia de tipografía, espaciado, tarjetas, formularios, tablas, botones, badges y estados vacíos según design.md; solo correcciones concretas. |
| C2 | Dashboard con jerarquía clara (acción primaria, indicadores, listas, módulos) sin perder datos, enlaces ni `data-testid`; ninguna cifra inventada. |
| C3 | "Actividad reciente" incluye eventos de inventario (alta, entrada, salida, consumo, archivado, restauración) con etiqueta y enlace correctos; órdenes, clientes y técnicos sin regresión; presupuestos siguen fuera. |
| C4 | Filtros de órdenes, presupuestos y actividad compactos por debajo de 768 px: plegables con teclado (`aria-expanded`/`aria-controls`), número de filtros activos, valores conservados al enviar por GET, siempre visibles desde 768 px; un error de rango no queda oculto. (Modificado por decisión humana HD-1: se retira «usables sin JavaScript».) |
| C5 | Tablas de conceptos de presupuesto (L-2) e historial de movimientos (L-3) sin scroll interno horizontal a 375, 768, 1024, 1280, 1440 y 1920 px, sin perder información ni acciones. |
| C6 | Botón de archivar/restaurar adecuado en móvil: no domina la pantalla, objetivo ≥ 40 px, conserva nombre accesible y confirmación. |
| C7 | Búsqueda por nombre de cliente en órdenes y presupuestos sin el tope silencioso de 100, si existe solución mínima y segura sin migración, conservando organización/RLS, escapado, recuento y paginación; si no, se avisa al usuario y se registra. |
| C8 | Si la cancelación de una orden falla, el diálogo sigue abierto, muestra el error anunciado, conserva el motivo y el foco queda dentro; si tiene éxito se cierra y el foco no se pierde. |
| C9 | Teclado completo, foco visible, gestión y restauración del foco, etiquetas y errores asociados, contraste WCAG 2.2 AA (objetivo, sin certificación). |
| C10 | Responsive a 375, 768, 1024, 1440 y 1920 px sin scroll horizontal de página. |
| C11 | axe sobre lo auditable con las herramientas ya presentes; Lighthouse solo si está disponible sin instalar; lo no ejecutado se declara NOT RUN. |
| C12 | format:check, lint, typecheck, build y pruebas dirigidas en verde; sin tests debilitados; solo archivos permitidos. |

## Decisiones humanas (2026-11-26, comunicadas en la sesión tras RETEST-3)
- **HD-1:** se retira de C4 el requisito de funcionamiento con JavaScript desactivado (lo había redactado Orchestrator). **H-01** queda como limitación conocida; los estados de carga (`loading.tsx`) no se modifican. Los veredictos anteriores se conservan: se emitieron con el criterio original.
- **HD-2:** se aceptan los demás hallazgos menores y las limitaciones documentadas en este registro (H-08, H-10, H-12, H-16, H-21, diálogos de archivar y aceptar/rechazar que se cierran al fallar, y comprobaciones no ejecutadas).
- **HD-3:** única corrección adicional: portada pública sin texto provisional (cierra H-09), sin rediseño ni funcionalidades nuevas.
- **HD-4:** documentar las incidencias moderadas de axe sin afirmar conformidad WCAG completa.
- **HD-5:** Lighthouse se traslada a la validación de producción en F8.
- **HD-6:** sin nueva auditoría completa, sin repetir suites locales y sin escrituras en Cloud; autorizado el commit de cierre. C7 y la regresión completa quedan condicionadas a CI.

## Rutas del handoff (transcritas del encargo a Develop; H-11)
- Permitidas: `src/app/**`, `src/components/**`, `src/features/**/ui/**`, `src/features/**/pages.tsx`, `src/features/activity/{service,constants}.ts`, `src/features/{work-orders,quotes}/service.ts`, `src/lib/records/pages.tsx`, `tests/{unit,integration,e2e,e2e-supabase}/**` salvo `independent/`, `docs/design.md`.
- Prohibidas: `.claude/**`, CLAUDE.md, AGENTS.md, `docs/reviews/**`, resto de `docs/`, `**/independent/**`, `tests/acceptance/**`, `supabase/**`, `package.json`, lockfile, `.github/**`, `actions.ts`, auth y proxy.
- Ampliación posterior de Orchestrator (H-19): `src/app/login/login-form.tsx` solo para foco/UI, sin tocar autenticación, acciones, proxy ni redirección (verificado por Testing).

## Delegación
2026-11-25/26. Testing informa en [TASK-014-POST](TASK-014-POST.md). La intervención de pulido fue una (DEV1); el resto son correcciones del ciclo FAIL → RETEST.

| Fase | Agente | Resultado |
|---|---|---|
| DEV1 | develop | Pulido C1–C10, `docs/design.md`, pruebas propias. C7 sin migración: recurso embebido de PostgREST dentro del `or`. Ejecutó la suite unitaria completa varias veces pese a pedirse checks dirigidos (934/934, no re-ejecutada por Testing). |
| POST | testing | **FAIL**: H-01..H-12 (sin Critical/High); C7 BLOCKED. |
| DEV2 | develop | H-02..H-07. Además, a petición de Orchestrator, foco en "Registrar movimiento" y "Añadir concepto". Detectó que los `<select>` volvían a su valor inicial tras un envío fallido (IVA 21 % en vez de 0 %, cliente anterior al editar presupuesto); corregido en todos los formularios afectados con autorización de Orchestrator. |
| RETEST | testing | **FAIL**: H-13..H-17. |
| DEV3 | develop | H-13, H-14, H-15. |
| RETEST-2 | testing | **FAIL**: H-18..H-21. |
| DEV4 | develop | H-17..H-20. |
| RETEST-3 | testing | **FAIL solo por C4 (H-01)**; C7 BLOCKED hasta CI. Sin Critical/High. |
| DEV5 | develop | Portada pública (HD-3): se sustituye «Estado: fundación técnica.» por la lista de funcionalidades existentes; pruebas propias actualizadas (`app-shell.test.tsx`, `home-smoke.spec.ts`). |
| RETEST-4 | testing | Solo portada y adjudicación de C4: portada **PASS**; C4 **PASS** con el texto de HD-1 (evidencia ya registrada, no re-ejecutada); C7 BLOCKED; global **BLOCKED** (no es PASS). |

Modelo autoinformado por Testing `claude-sonnet-5-5`; esfuerzo efectivo no verificable. Durante DEV2 se denegó un comando de Develop con borrado recursivo en el scratchpad (se repitió sin el borrado); en el POST se denegó a Testing exportar la base al scratchpad.

## Veredicto vigente (RETEST-4)
**TASK-014: BLOCKED** (no es PASS) únicamente por C7, condicionado a CI.

| Criterios | Estado |
|---|---|
| C1, C2, C3, C5, C6, C8, C9, C10, C11 | PASS por RETEST-3 (C9: objetivo AA, sin certificación ni lector de pantalla real) |
| C4 | PASS con el criterio modificado por HD-1 (antes FAIL por H-01, veredicto conservado) |
| C12 | PASS |
| C7 | **BLOCKED**: falta CI sobre el SHA objetivo (`search.spec.ts`, `independent/search-isolation.spec.ts`) |
| Portada (HD-3) | PASS |

**H-01, limitación conocida (HD-1):** sin JavaScript, órdenes, presupuestos y actividad quedan en el esqueleto de `loading.tsx` (preexistente en `d748ae5`); el panel de filtros en sí cumple el fallback. No se modifican los estados de carga.

## Accesibilidad: incidencias moderadas de axe (HD-4)
axe-core 4.14.1, RETEST-3, 106 análisis con datos normales (diálogos y errores incluidos): 0 critical, 0 serious, **59 moderate**:

| Regla | Nodos/casos | Qué señala | Estado |
|---|---|---|---|
| `region` | 57 | Contenido fuera de un landmark (marca del lateral, preexistente según el informe) | Aceptado (HD-2), sin corregir |
| `landmark-unique` | 2 | Detalle de inventario: sección y tabla con el mismo nombre accesible | Aceptado (HD-2), sin corregir |

Con datos extremos (60 análisis): 0 serious, 37 moderate. Portada `/` tras HD-3 (6 anchos): 0 violaciones. Los 5 nodos de contraste «incompletos» se revisaron por cálculo (6,05–17,28). **No se declara conformidad WCAG:** axe cubre solo parte de los criterios, se midió en Chromium con la aplicación compilada contra un backend ficticio y no hubo prueba con lector de pantalla, otros navegadores ni usuarios.

## Comandos del árbol final (Testing, RETEST-3)
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm format:check`, `lint`, `typecheck` | 0 | verde |
| `git diff --check HEAD` | 0 | limpio |
| `vitest run` dirigido (47 ficheros) | 0 | 910/910 |
| `playwright test tests/e2e` | 0 | 12/12 |
| `pnpm build` (backend ficticio y final normal) | 0 | verde |

Portada (RETEST-4): vitest dirigido 4/4, `playwright test` de la portada 9/9, prettier/eslint de los tres archivos, `pnpm typecheck` y `git diff --check HEAD`, todos exit 0. Sin desbordes a 320, 375, 768, 1024, 1440 y 1920 px; contraste del texto 6,94:1. Sin repetir suites ni `format:check`/`lint` globales (HD-6).

## Métricas
App real en Chromium contra un backend ficticio propio de Testing (no prueba PostgREST, RLS ni persistencia).

| Medida | POST | Final |
|---|---|---|
| Desborde de página con datos extremos (20 rutas, 8 anchos) | 38/160 (máx. 882 px) | 0/160 |
| Desborde con cinco perfiles de datos (14 rutas) | — | 0/560 |
| Tablas de conceptos e historial con scroll interno (C5) | 0/72 | 0/120 |
| axe 4.14.1, datos normales | 87 análisis: 4 serious, 53 moderate | 106 análisis: 0 critical, 0 serious, 59 moderate |
| Objetivos táctiles medidos (2309) | ninguno no inline < 24 px | igual; ningún botón < 40 px bajo 768 |
| Texto al 200 % y zoom de página | +334 px en el panel (solo texto) | 0 desbordes |

Antes del pulido (revisiones visuales de TASK-012/013): conceptos 854/687 px y movimientos 745/687 px a 1024.

## Puertas Premium Frontend Director
G1, G2, G4, G5, G9 PASS; G3 PASS con datos ficticios (no la app contra Cloud; Orchestrator revisó cuatro capturas del árbol final: panel a 1280 y 375, borrador a 1280, artículo a 375); G6 PASS limitado (sin lector de pantalla); G7 PASS dirigido; G10 parcial (E2E con Supabase pendiente de CI); G8 NOT RUN (Lighthouse trasladado a la validación de producción en F8, HD-5); G11 NOT RUN (pulido Refined, sin capturas antes/después emparejadas).

## Limitaciones conocidas y aceptadas (HD-1, HD-2)
| ID | Gravedad | Resumen |
|---|---|---|
| H-01 | Medium | Contenido oculto sin JavaScript en tres módulos (HD-1) |
| H-08 | Low | Antes de hidratar, «Filtros» no responde |
| H-10 | Low | «Ya estaba cancelada» no refresca la página |
| H-16 | Low | Scroll interno a 1024 en actividad, inventario (referencias/cifras largas) y presupuestos (totales de cientos de millones) |
| H-12 | Informational | axe `region`/`landmark-unique`; `*` como comodín; cifras enormes partidas; foco en `body` durante el envío de la cancelación y tras redirecciones |
| H-21 | Informational | «Quitar concepto» requiere JavaScript |

También aceptado: los diálogos de archivar y de aceptar/rechazar se cierran si fallan (anuncian el error). H-09 queda cerrado por la nueva portada. H-11 queda resuelto con las rutas de este registro. Recomendación no ejecutada: los datos guardados no se consultaron; conviene revisar si algún registro se guardó con un `<select>` revertido antes de la corrección.

## Pendiente
- Push (humano) y CI sobre el SHA de cierre: regresión completa (`test:unit`, `test:integration`, `test:supabase`, `test:e2e`, `test:e2e:supabase`); condiciona C7 y el cierre de F7.
- F8: Lighthouse en la validación de producción (HD-5).
- No ejecutados: lector de pantalla, otros navegadores y revisión visual contra Cloud. Sin escrituras en Cloud.

## Comprobación Git
Commits: `545e79d` (implementación hasta RETEST-3) y el commit de cierre que contiene este registro (portada y decisiones; autorizado por HD-6). DEV5 y RETEST-4: HEAD `545e79d` sin cambios durante las delegaciones, sin staging, solo las tres rutas permitidas de la portada más los informes.

Hasta RETEST-3, antes y después de cada delegación: HEAD `d748ae5` y rama `feat/final-polish` sin cambios, sin staging, ignorados sensibles iguales a la línea base (`.env.local`, `.claude/settings.local.json`), sin cambios en rutas protegidas salvo el spec e informe propios de Testing, sin `skip`/`only`. Excepción de procedimiento: no se tomó manifiesto entre el RETEST y DEV3; Testing confirmó en RETEST-2 que su informe y su spec conservaban el hash.
