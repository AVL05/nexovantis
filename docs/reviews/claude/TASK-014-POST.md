# TASK-014 — Testing POST

- Fecha: 2026-11-25 (cierre 2026-11-26). Agente: Testing. Modelo solicitado Sonnet medium (según registro); autoinformado por el entorno `claude-sonnet-5-5`; esfuerzo efectivo no verificable. Sin PRE.
- SHA base/HEAD `d748ae5908621bbe50c30fac52ae7ccaeb5f6cde`, rama `feat/final-polish`, cambios sin commit. Windows 11, Chromium de Playwright 1.65.1.
- Veredicto: **FAIL** (C1, C4, C9, C10 incumplidos en parte; C7 y la lista permitida de C12 BLOCKED). Sin hallazgos Critical ni High.

## Comandos
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm format:check` (repetido tras añadir el spec) | 0 | verde |
| `pnpm lint` | 0 | verde |
| `pnpm typecheck` (repetido tras añadir el spec) | 0 | verde |
| `pnpm build` | 0 | verde |
| `vitest run` dirigido (14 ficheros) | 0 | 168/168 |
| `vitest run` guardas independientes (4 ficheros, uno repetido) | 0 | 120/120 |
| `prettier --check` y `eslint` del spec nuevo | 0 | verde |
| `playwright test -c playwright.supabase.config.ts --list search` | 0 | 7 pruebas listadas, no ejecutadas |

## Entorno de interfaz
App real (`next build` + `next start`) con Server Actions reales contra un backend ficticio local propio (Auth y subconjunto de PostgREST, en el scratchpad). No es evidencia de PostgREST, RLS ni persistencia. Las variables `NEXT_PUBLIC_*` se sobrescribieron con valores ficticios; Next anuncia que carga `.env.local` por sí mismo (no se leyó ni mostró); la compilación no contiene URLs `*.supabase.co` de proyecto.

## Métricas
- Desborde: datos normales y perfil con textos sin espacios solo en conceptos/notas: 0 de 224 mediciones (14 rutas, 8 anchos 320-1920). Datos extremos (nombres/títulos/correos sin espacios de 78-180): 38 de 160 en la pasada de 20 rutas y 38 de 112 en la de 14; máximo 882 px. Correos sin espacios de 30-64 caracteres en cliente: 0.
- C5: 72 mediciones de región (24 por perfil): 0 scroll interno, 0 recortes, 0 salidas. Conceptos 288-787 px; movimientos en tarjetas hasta 448 px y tabla desde 704 px (960 px a 1280).
- Árbol de accesibilidad Chromium de conceptos a 375: 1 table, 2 rowgroup, 4 row, 7 columnheader, 21 cell; nombre de la celda de descripción exacto.
- Objetivos: 2309 medidos; 0 no inline menores de 24x24; 0 botones menores de 40 px de alto bajo 768. Archivar: 132-138 x 40 px a 320/375/768/1280; contraste calculado 6.6:1.
- Teclado: 12 recorridos de Tab; sin controles ocultos enfocados. En fechas a 1280 el estilo computado no mostró anillo en alguna parada interna; la primera parada sí (`solid 2px`). Segmentos internos no revisados visualmente.
- axe 4.14.1 (datos normales y estados): 87 análisis; critical 0, serious 4 (una regla, panel a 375/768/1280/1920), moderate 53 (`region` 51, `landmark-unique` 2), minor 0. Pasada previa (datos extremos, incluye `/` y `/login`): 60 análisis, serious 3, moderate 37. `color-contrast` con nodos incompletos.
- Texto 200 %: zoom de página (640/960) y fuente por defecto 32 px: 0 desborde. Solo texto (raíz 32 px): panel +334 px a 1280, +174 a 1440.
- Lighthouse: NOT RUN (no disponible sin instalar).

## Criterios
| ID | Resultado | Nota |
|---|---|---|
| C1 | FAIL (parcial) | H-04 |
| C2 | PASS | 14 `data-testid`, enlaces presentes, cifras iguales a las servidas, "Nueva orden" a 193 px (375) y 144 px (1280); ver H-07 |
| C3 | PASS | Etiquetas y enlaces de inventario, filtro de organización, límite 10, sin presupuestos; RLS sin cambios, no ejecutada |
| C4 | FAIL (parcial) | H-01. Resto superado a 320/375/767/768/1280: Enter/Espacio, ARIA, contador, GET con panel cerrado, limpiar, rango inválido visible |
| C5 | PASS | Lector de pantalla real NOT RUN |
| C6 | PASS | Nombre, confirmación y restauración de foco |
| C7 | BLOCKED | Sin PostgREST local; pendiente CI |
| C8 | PASS | Fallo y "ya cancelada": diálogo abierto, un `role=alert` dentro con foco, motivo conservado; Escape simple y doble durante envío: error con foco en la página; reapertura sin error; éxito: foco en "Orden cerrada" y aviso |
| C9 | FAIL (parcial) | H-02, H-03 |
| C10 | FAIL (parcial, solo datos extremos) | H-05 |
| C11 | PASS | Ejecutado y declarado arriba; "sin serious/critical" de Develop no se confirma (H-02) |
| C12 | BLOCKED (solo lista de rutas) | Checks verdes y sin pruebas debilitadas; TASK-014.md no registra rutas permitidas |

## Hallazgos
"Preexistente" se deduce de la lectura del diff; la base no se ejecutó (la exportación al scratchpad fue denegada y no se reintentó por otra vía).

- **H-01 Medium, C4, preexistente.** `src/app/{orders,quotes,activity}/loading.tsx`: con JavaScript desactivado la respuesta deja el contenido en `<div hidden id="S:1">` y solo se ve el esqueleto. Reproducir: sesión iniciada, desactivar JS, abrir `/orders` a 375 o 1280. Los filtros no son utilizables. Revelando el contenedor a mano, el CSS del panel sí muestra todos los campos: la causa es el streaming.
- **H-02 Medium, C9, preexistente y extendido a inventario.** `DashboardPanels.tsx:194`: axe `link-in-text-block` serious; enlace de "Actividad reciente" a 2.88:1 del texto contiguo y sin subrayado. Reproducir: panel con un evento de nombre corto en la misma línea.
- **H-03 Medium, C9, preexistente.** El foco acaba en `<body>` tras "Asignar", "Iniciar orden" (`OrderActions.tsx:148,164`), "Quitar concepto", y tras fallo de aceptar/rechazar (el diálogo se cierra). `docs/design.md:92`, añadido en esta tarea, afirma que el foco pasa al aviso o contenido al retirarse los botones: no se cumple en "Iniciar orden" ni "Quitar concepto". Completar, cancelar y decidir con éxito sí gestionan el foco.
- **H-04 Medium, C1, preexistente (declarado).** `QuoteItems.tsx:260-265`: "Quitar" es `danger` y elimina sin diálogo (1 RPC con un clic), contra `docs/design.md:88`.
- **H-05 Medium, C10, preexistente.** Con tokens sin espacios largos (válidos hasta 200 caracteres) hay scroll horizontal de página en listados bajo 1024 y fichas bajo 768, p. ej. `/customers` +706 a 768, `/orders` +90 a 768, ficha de orden +630 a 375. Origen: enlaces de tarjeta (`OrderList.tsx:105` y análogos) y `dd` de fichas. Las dos tablas de C5 no se ven afectadas.
- **H-06 Medium, fuera de criterios, preexistente (declarado).** `MovementForm.tsx:68-70`: ante fallo de base se vacían cantidad y nota. "Añadir concepto" conserva sus valores. Requiere aceptación humana.
- **H-07 Low, introducido.** `dashboard/page.tsx:126,133` (`xl:flex-row`, `xl:shrink-0`): desborde con ampliación solo de texto al 200 % (T10); apilando la cabecera, 0.
- **H-08 Low, declarado.** Antes de hidratar (chunks bloqueados) el botón "Filtros" no responde; búsqueda y "Filtrar" visibles.
- **H-09 Low, preexistente (declarado).** `src/app/page.tsx:12`: la portada muestra "Estado: fundación técnica.".
- **H-10 Low, preexistente.** Cancelar una orden ya cancelada no refresca la página (`actions.ts`, `run`): tras cerrar el diálogo quedan estado y botones obsoletos.
- **H-11 Low, documental.** TASK-014.md no define rutas permitidas/prohibidas.
- **H-12 Informational.** axe `region` y `landmark-unique` (preexistentes); `*` actúa como comodín en búsquedas (comportamiento de PostgREST, no ejecutado, ya presente antes); importes enormes se parten a mitad de cifra a 1280; durante el envío de la cancelación el foco está en `<body>`; el motivo se conserva al reabrir (el error se limpia); `docs/design.md` modificado por Develop y con una línea en blanco final (`git diff --check HEAD`, exit 2, línea 121).

## C7: verificación estática
- Petición real de postgrest-js 2.119.2 (test de Develop, ejecutado): embed vacío en HEAD y GET, filtro de organización raíz y embebido, `or` con tres condiciones (más `number.eq`), término escapado y entrecomillado, sin embed con `q` vacío, paginación 20.
- Migraciones: una sola FK de `work_orders` y de `quotes` hacia `customers` (compuesta con organización) y ninguna tabla puente observada: sin ambigüedad aparente. El embed queda bajo `customers_select_member`.
- `search.spec.ts`: 105 clientes coincidentes + 1 título = 106, que el tope anterior no podía devolver; usa guarda local y mundo propio. Su negativo de organización B es débil (B sin datos) y no prueba un término sin coincidencias con datos.
- Añadido `tests/e2e-supabase/independent/search-isolation.spec.ts` para esos dos casos. No ejecutado.
- Pendiente en CI sobre el SHA objetivo: ambos specs, E2E existentes (por lectura son coherentes con el DOM a 1280x720), unitarios completos, integración. La cifra 934/934 de Develop no se re-ejecutó.

## C12
`work-orders-static.test.ts`: en cada servicio pasa de 8 lecturas raíz acotadas a 7 raíz + 1 embebida; mismo umbral y aserción explícita nueva. No se considera debilitamiento. Sin `skip/only/todo/fixme` en el diff ni en los tests nuevos. Sin cambios en `tests/acceptance`, `independent` previos, `.github`, `.claude`, `supabase`, `package.json`, lockfile ni `CLAUDE.md`.

## Archivos y Git
Escritos por Testing: este informe y `tests/e2e-supabase/independent/search-isolation.spec.ts`. No se modificó `src/` ni TASK-014.md; sin add/commit/stash/checkout. `.next` (ignorado) queda compilado con URL ficticia: ejecutar `pnpm build` antes de `pnpm start`. `typecheck` regenera tipos ignorados. Procesos 3391/3392 detenidos. Temporales en el subdirectorio `testing-post` del scratchpad.

## RETEST

- 2026-11-26. HEAD `d748ae5`, árbol sin commit tras las correcciones. Mismo agente, modelo autoinformado y entorno; esfuerzo efectivo no verificable.
- Veredicto: **FAIL** (C4; C1 y C9 en parte; C7 BLOCKED). Sin hallazgos Critical ni High.

### Comandos
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm format:check`, `lint`, `typecheck` | 0 | verde |
| `git diff --check HEAD` | 0 | corregida la línea final |
| `vitest run` dirigido (37 ficheros, incluye `tests/unit/independent`) | 0 | 762/762 |
| `pnpm build` con backend ficticio | 0 | usado para medir |
| `pnpm build` final sin valores ficticios | 0 | 0 ficheros con URL ficticia; Next carga `.env.local` por sí mismo (no leído) |

### Métricas (app real, backend ficticio, Chromium)
- Desborde: 0 de 160 (20 rutas, 8 anchos, datos extremos; antes 38), 0 de 336 (perfiles normal, tablas, extremo) y 0 de 416 en la búsqueda de partidos (normal y realista).
- C5: 72 mediciones de región, 0 scroll interno, recortes o salidas.
- Texto 200 % (solo texto y fuente del navegador, 9 rutas, 1280/1440/1920) y zoom de página (640/960): 0 desbordes.
- axe 4.14.1: 106 análisis (datos normales, diálogos y errores): critical 0, serious 0, moderate 59 (`region` 57, `landmark-unique` 2). Pasada extrema: 60 análisis, serious 0, moderate 37.
- Objetivos: 2309 medidos, ninguno no inline menor de 24 px, ningún botón menor de 40 px de alto bajo 768.
- Doble envío: Enter x10 y doble clic en orden, movimiento, concepto, asignar y cliente: 1 petición en los 10 casos.

### Formularios (Server Actions reales)
Orden, presupuesto y artículo (alta y edición), concepto (añadir y editar), movimiento y asignación: conservan texto y selectores tras fallo (IVA 0 %, cliente, prioridad, técnico, unidad, tipo, orden) y reenvían lo elegido; pending deshabilita el botón; éxito redirige con aviso, cierra o limpia como antes; claves nuevas en altas consecutivas; validación HTML sin petición; `fieldErrors` asociados; envío antes de hidratar correcto en alta de orden. Sin selectores sin cubrir: los restantes con `<select>` son filtros GET nativos.

Sin JavaScript el contenido sigue oculto por H-01. Revelándolo a mano, alta de orden, edición de presupuesto y alta de artículo envían por POST (fallo y éxito); ver H-15 para las acciones de orden.

### Estado de hallazgos anteriores
| ID | Estado |
|---|---|
| H-02 | Resuelto: enlaces subrayados, 0 serious |
| H-03 | Resuelto en los casos reportados; foco comprobado en asignar, reasignar, iniciar, completar, cancelar, aceptar/rechazar (fallo repetido y éxito), movimiento, añadir y quitar concepto |
| H-04 | Resuelto: diálogo, Escape sin petición, 1 petición, error dentro con foco, Escape durante envío, último concepto, foco en "Conceptos" |
| H-05 | Resuelto el desborde; introduce H-14 |
| H-06 | Resuelto |
| H-07 | Resuelto |
| Selectores tras fallo | Resuelto |
| H-01, H-08, H-09, H-10, H-12 | No tocados |
| H-11 | Listas recibidas por delegación, pendiente de registro por Orchestrator |

### Hallazgos abiertos o nuevos
- **H-01 Medium, C4, preexistente.** Evidencia con `git cat-file`/`git show d748ae5:`: `src/app/{orders,quotes,activity}/loading.tsx` ya existían (commits `5c30155`, `0699277`, `1a6c4db`) y no tienen diferencias, igual que sus `page.tsx`/`layout.tsx`. Real sin JS: formulario dentro de `div#S:1` oculto. Revelado: 7/7, 3/3 y 4/4 campos visibles y botón de plegado oculto, así que el panel sí cumple el fallback. `/dashboard`, sin `loading.tsx`, se ve sin JS. Corrección: retirar esos `loading.tsx` (cubren también subrutas) o sustituirlos por un `Suspense` situado bajo los filtros, con las opciones de los filtros resueltas fuera de él; no verificado porque no modifico `src/`. El criterio no se cambia.
- **H-13 Medium, C9, preexistente, no cubierto en el POST.** Tras un fallo al guardar orden, presupuesto, artículo o cliente, y en "Editar concepto", el foco acaba en `<body>`. En páginas el siguiente Tab va a "Cancelar"; en el diálogo un Tab sigue en `<body>`. El error se anuncia. `design.md:92` declara que no se gestiona. Reproducir: forzar fallo y pulsar Enter sobre el botón de guardar.
- **H-14 Medium, C1, introducido por H-05.** `/quotes` a 1024: la cabecera "Cliente" se parte ("Client / e"; "Cl / iente" con datos extremos). Sin la regla `main { overflow-wrap: anywhere }` no ocurre. `QuoteList.tsx:63` carece de `whitespace-nowrap`, que la regla nueva de `design.md` exige para lo que no deba partirse. Único partido nuevo detectado. Impacto cosmético, corrección de una línea.
- **H-15 Low, introducido.** Asignar, reasignar, iniciar y completar pasan de `useActionState(accion)` (base, `OrderActions.tsx:44-45`) a envoltorios de cliente: su `<form>` ya no es POST progresivo. `design.md` afirma que se conserva `action` para funcionar sin JavaScript; no es así en asignar, ni en conceptos y movimientos (estos ya envueltos antes). Sin efecto visible mientras exista H-01.
- **H-16 Low, preexistente (cabeceras sin cambios respecto a la base), fuera de criterios.** Scroll interno de la tabla de actividad a 1024 (702/777); inventario con referencia de 40 caracteres sin espacios a 1024 (702/810) y 1100 (778/810). Sin scroll de página; C5 no incluye estas tablas.
- **H-17 Low, fuera de criterios.** El diálogo de archivar se cierra al fallar; error con `role=alert` y foco de vuelta al disparador. "Editar concepto" muestra el error anterior al reabrir.

### Criterios
| ID | RETEST |
|---|---|
| C1 | FAIL (parcial, H-14) |
| C2, C3, C5, C6, C8, C10, C11 | PASS |
| C4 | FAIL (H-01) |
| C7 | BLOCKED: consulta sin cambios desde el POST; specs no ejecutados, pendiente CI |
| C9 | FAIL (parcial, H-13) |
| C12 | PASS contra las listas comunicadas en la delegación: sin archivos fuera de ellas; registro pendiente (H-11) |

### Pruebas y Git
`quotes.spec.ts` solo añade 6 líneas (confirmación, total sin cambios antes de confirmar, diálogo cerrado y foco): no debilita. No ejecutado. `tests/unit/final-polish.test.tsx` conserva las aserciones revisadas; sin `skip/only/todo/fixme`. Sin cambios en independientes previas; `search-isolation.spec.ts` conserva su hash. Sin cambios en `actions.ts`, auth, proxy, `supabase`, dependencias ni CI. Testing solo amplió este informe; sin add/commit/stash/checkout. Pendiente en CI: suites completas, integración y E2E.

## RETEST-2

- 2026-11-26. HEAD `d748ae5`, árbol sin commit. Mismo agente, modelo autoinformado y entorno; esfuerzo efectivo no verificable.
- Veredicto: **FAIL** (C4; C9 en parte; C7 BLOCKED). Sin hallazgos Critical ni High.
- Integridad: antes de empezar, este informe y `search-isolation.spec.ts` tenían el mismo hash que al cerrar el RETEST. Sin cambios en pruebas independientes ni acceptance.

### Comandos
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm format:check`, `lint`, `typecheck` | 0 | verde |
| `git diff --check HEAD` | 0 | limpio |
| `vitest run` dirigido (39 ficheros, incluye `tests/unit/independent`) | 0 | 780/780 |
| `pnpm build` con backend ficticio, y final sin valores ficticios | 0 / 0 | final: 0 ficheros con URL o clave ficticia; Next carga `.env.local` (no leído) |

### Verificación (app real, backend ficticio, Chromium)
- H-13: orden, presupuesto y artículo (alta y edición), cliente, técnico y "Editar concepto": tres fallos seguidos y error por campo dejan el foco en el mensaje; valores conservados; sin robo si el usuario pasa a otro campo; ráfaga de Enter: 1 petición.
- Acciones de orden: fallo repetido y éxito; se anuncia el último éxito; foco en "Acciones", "Orden cerrada" o el mensaje; sin robo; ráfaga y doble clic: 1 petición. Ver H-18.
- H-15: sin JavaScript (contenedor revelado, H-01) asignar, reasignar, iniciar y completar envían por POST, con fallo, éxito y aviso. Asignar antes de hidratar: 1 petición. La clasificación POST/JS de formularios coincide con `design.md`.
- Regresiones: movimiento, añadir, editar y quitar concepto, decisiones y archivado, sin cambios respecto al RETEST.
- Partidos: 208 mediciones con perfil realista (rutas y diálogos), sin partidos nuevos (solo el correo largo de la cabecera del panel). Matriz de tablas: 448 mediciones (8 rutas, 8 anchos de 992 a 1920, 7 perfiles), 0 cabeceras, botones o insignias partidos y 0 desborde de página.
- C5: 96 mediciones de región (24 por perfil: normal, real, contactos largos y límites de dominio), 0 scroll interno, recortes o salidas; sin scroll de movimientos a 992/1000.
- Desborde extremo: 0 de 160. Texto 200 % y zoom de página: 0. Objetivos: 2309, ninguno no inline menor de 24 px.
- axe: 106 análisis, critical 0, serious 0, moderate 59; pasada extrema 60 análisis, serious 0, moderate 37.

### Estado
H-13, H-14 y H-15 resueltos. H-01, H-08, H-09, H-10 y H-12 sin tocar. H-11 pendiente de registro.

### Hallazgos nuevos o ampliados
- **H-19 Medium, C9, preexistente (login sin cambios en el diff), no cubierto antes.** Con credenciales rechazadas, dos intentos seguidos: el foco queda en `<body>` y un Tab no llega a ningún control; el error sí tiene `role=alert`. `login-form.tsx` no gestiona el foco. Reproducir: `/login`, contraseña errónea, Enter en "Iniciar sesión". La delegación original excluía auth: confirmar si la ruta `src/app/login/**` está permitida.
- **H-18 Medium, introducido en TASK-014 (presente desde la primera versión de C8), fuera del texto literal de los criterios.** `OrderActions.tsx` (`error = cancelError ?? ...`): si la cancelación falla tras cerrar el diálogo durante el envío, ese mensaje sigue visible tras un éxito posterior y sustituye al error de una acción posterior; el foco va al mensaje antiguo. En la base, un error de asignar o avanzar tenía prioridad. Reproducir: orden asignada, confirmar cancelación que falle y pulsar Escape; "Reasignar" con éxito; "Iniciar orden" con fallo: sigue "La orden ya estaba cancelada.". Se recomienda corregir; si no, aceptación humana.
- **H-16 ampliado, Low, fuera de criterios.** Listado de presupuestos con scroll interno a 1024: 702/712 con totales de 999.999.999,99; 702/731 con ~10 mil millones; con el máximo del dominio 702/781 (hasta 1060-1100). Sin scroll con 1.512.500,00. Son datos válidos, pero C5 solo abarca conceptos y movimientos: no lo incumple; C10 tampoco (sin scroll de página). Lo introduce `main th { overflow-wrap: normal }` salvo en el máximo, donde ya habría 702/743. Actividad e inventario se mantienen como en el RETEST.
- **H-17 ampliado, Low.** Al reabrir "Editar concepto" tras un fallo, el error anterior sigue y ahora recibe el foco inicial.
- **H-20 Informational.** `design.md` dice que los accesos del panel comparten línea desde 1280 px; ocurre ya a 1100. El resto de las afirmaciones comprobadas es correcto.
- **H-21 Informational, introducido por H-04.** "Quitar concepto" requiere JavaScript (sin él: 0 peticiones). En la base era un `form` directo, pero `quotes/loading.tsx` ya ocultaba el contenido sin JS; solo cambia el intervalo previo a la hidratación. Coherente con la confirmación exigida; ningún criterio lo requiere.

### Criterios
| ID | RETEST-2 |
|---|---|
| C1, C2, C3, C5, C6, C8, C10, C11 | PASS |
| C4 | FAIL (H-01, pendiente de decisión humana) |
| C7 | BLOCKED: pendiente CI sobre el SHA objetivo |
| C9 | FAIL (parcial, H-19) |
| C12 | PASS contra las listas comunicadas; registro pendiente (H-11) |

Si el humano aceptara H-01: la aceptación no convierte C4 en PASS (requeriría corregirlo o que el humano modifique el criterio). Aun resuelto C4, seguiría FAIL por C9 (H-19) y C7 BLOCKED; quedarían para aceptación registrada H-08, H-09, H-10, H-16, H-17 y H-18. Corregidos C4 y C9, el veredicto sería BLOCKED hasta CI verde.

### Git
Testing solo amplió este informe (temporales en `testing-post/retest2` del scratchpad). Sin cambios en `src/`, sin add/commit/stash/checkout; puertos 3391/3392 libres. `quotes.spec.ts` mantiene sus 6 líneas; `form-focus-on-error` y `form-progressive-ssr` sin `skip/only/todo/fixme`.

## RETEST-3

- 2026-11-26. HEAD `d748ae5`, árbol sin commit. Mismo agente, modelo autoinformado y entorno; esfuerzo efectivo no verificable.
- Veredicto: **FAIL** (solo C4, H-01); C7 BLOCKED. Sin hallazgos Critical ni High.
- Integridad al empezar: informe `373a4bea…` y `search-isolation.spec.ts` `e5fab42b…` sin cambios.
- `login-form.tsx`: el diff solo importa `useFocusOnError` y envuelve la alerta. Sin cambios en auth, acciones, proxy, redirección ni `login/page.tsx`.

### Comandos
| Comando | Exit | Resultado |
|---|---|---|
| `pnpm format:check`, `lint`, `typecheck` | 0 | verde |
| `git diff --check HEAD` (antes y después del build final) | 0 | limpio |
| `vitest run` dirigido (47 ficheros, incluye todo `tests/unit/independent`) | 0 | 910/910 |
| `playwright test tests/e2e` (incluye `independent/login-layout` y `home`), servidor propio con valores ficticios | 0 | 12/12 |
| `pnpm build` con backend ficticio, y final sin valores ficticios | 0 / 0 | final: 0 ficheros con URL o clave ficticia; Next carga `.env.local` (no leído) |

### Verificación (app real, backend ficticio, Chromium)
- H-19: a 375 y 1280, tres rechazos con el botón: foco en el mensaje y Tab a "Iniciar sesión"; Enter desde un campo: el foco permanece en él; correo conservado; acceso correcto (1 POST con Enter repetido) respeta `next`; `next` externo acaba en `/dashboard`; rechazo y acceso sin JavaScript correctos.
- H-18: cancelaciones fallidas con diálogo cerrado seguidas de éxito y de fallo de otras acciones: solo se muestra la última. C8: fallo abierto y repetido con foco y motivo, "ya estaba cancelada", Volver, reapertura limpia, Escape simple y doble durante envío, éxito con ráfaga (1 petición) y foco en "Orden cerrada".
- H-17: reapertura sin mensaje, `aria-invalid` ni foco antiguos; cerrado durante envío, mensaje bajo "Editar" sin robar foco y sin desborde a 320/375/1280; ráfaga: 1 petición.
- H-20: panel apilado hasta 1024 y en la misma línea desde 1100, como describe ahora `design.md`.
- Regresiones: nueve formularios (fallo triple, error por campo, sin robo, ráfaga), acciones de orden, conceptos, movimiento, decisiones, archivado, POST progresivo y envío antes de hidratar: sin cambios.

### Métricas finales
- Desborde de página: 0 de 160 (extremo, 20 rutas) y 0 de 560 (14 rutas; normal, realista, contactos largos, límites de dominio y extremo).
- C5: 120 mediciones de región, 0 scroll interno, recortes o salidas.
- Zoom de página y texto 200 %: 0 desbordes.
- axe 4.14.1: 106 análisis, critical 0, serious 0, moderate 59 (`region` 57, `landmark-unique` 2); extremo 60, serious 0, moderate 37; estados nuevos 8, serious 0 (`region` 2). 5 nodos de contraste "incompletos" revisados por cálculo: ratios 6.05 a 17.28.
- Objetivos: 2309 medidos, ninguno no inline menor de 24 px, ningún botón menor de 40 px de alto bajo 768.
- NOT RUN: Lighthouse, lector de pantalla real, otros navegadores. Suites completas, integración, E2E con Supabase y `search*.spec.ts`: pendientes de CI.

### Criterios
| ID | Veredicto |
|---|---|
| C1, C2, C3, C5, C6, C8, C9, C10, C11 | PASS (C9: objetivo AA, sin certificación) |
| C4 | FAIL (H-01) |
| C7 | BLOCKED: pendiente CI sobre el SHA objetivo |
| C12 | PASS contra las listas comunicadas, con la autorización de `login-form.tsx`; registro pendiente (H-11) |

### Hallazgos abiertos (lista final)
| ID | Gravedad | Resumen | Origen |
|---|---|---|---|
| H-01 | Medium, C4 | Sin JavaScript, órdenes, presupuestos y actividad no muestran el contenido (`loading.tsx`). Pendiente de decisión humana | Preexistente |
| H-08 | Low | Antes de hidratar, "Filtros" no responde | TASK-014 |
| H-09 | Low | Portada con "Estado: fundación técnica."; `tests/e2e/home-smoke.spec.ts` lo comprueba y habría que actualizarlo si se cambia | Preexistente |
| H-10 | Low | "Ya estaba cancelada" no refresca el estado de la página | Preexistente |
| H-11 | Low, documental | Rutas permitidas y prohibidas sin registrar en TASK-014.md | Registro |
| H-16 | Low | Scroll interno a 1024: actividad; inventario con referencias o cifras largas; presupuestos con totales de cientos de millones o más. Fuera de C5/C10 | Mixto |
| H-12 | Informational | `region` y `landmark-unique`; `*` como comodín (no ejecutado); cifras enormes partidas; foco en `<body>` durante el envío de la cancelación y tras redirecciones; motivo conservado al reabrir | Mixto |
| H-21 | Informational | "Quitar concepto" requiere JavaScript | TASK-014 |

Resueltos: H-02 a H-07, H-13 a H-15 y H-17 a H-20. Si el humano aceptara H-01, la aceptación no convierte C4 en PASS: requiere corrección o que el humano modifique el criterio. Resuelto C4 por cualquiera de esas vías, el veredicto sería **BLOCKED** hasta CI verde (C7). H-08, H-09, H-10 y H-16 requieren aceptación humana registrada.

### Git
Testing solo amplió este informe; temporales en `testing-post/retest3` del scratchpad; `test-results/` (ignorado) actualizado por Playwright. 37 archivos versionados modificados y 15 sin versionar; fuera de las listas de Develop solo mi informe, `search-isolation.spec.ts` (independiente, de Testing) y `TASK-014.md` (de Orchestrator, hash `ee4ebad4…` sin cambios). Sin add/commit/stash/checkout; puertos 3100/3391/3392 libres.

## RETEST-4

- 2026-11-26. HEAD `545e79d`, rama `feat/final-polish`, cambios sin commit. Alcance: solo la portada `/` (HD-3). Modelo autoinformado `claude-sonnet-5-5`; esfuerzo efectivo no verificable. Sin Cloud ni lectura de `.env*`.
- Portada: **PASS** (H-09 resuelto). TASK-014 global: **BLOCKED** (C7 pendiente de CI). Sin hallazgos nuevos.

| Comando (solo dirigidos) | Exit | Resultado |
|---|---|---|
| `vitest run tests/unit/app-shell.test.tsx tests/unit/independent/home-page.test.tsx` | 0 | 4/4 |
| `playwright test tests/e2e/home-smoke.spec.ts tests/e2e/independent/home.spec.ts` (build y servidor propios, valores ficticios) | 0 | 9/9 |
| `prettier --check` y `eslint --max-warnings=0` sobre los tres archivos | 0 / 0 | verde |
| `pnpm typecheck` | 0 | verde |
| `git diff --check HEAD` | 0 | limpio (antes de ampliar este informe) |
| Script propio de medición en Chromium (`next start`) | 0 | ver abajo |

- Texto: sin texto provisional en el cuerpo visible ni en `title`/`description` servidos (heredados de `layout.tsx`, sin cambios).
- Afirmaciones contrastadas con el código, por lectura (sin ejecutar contra base): alta, edición y archivado de clientes y técnicos; prioridad, fecha, técnico y estado de órdenes; conceptos, IVA y creación de la orden al aceptar (trigger `quotes_accept_create_order`); entradas, salidas, consumos y stock bajo; indicadores del panel y actividad. Ninguna inventada ni exagerada.
- Diseño: único cambio, un párrafo sustituido por una lista con tokens existentes. Un `h1`, 0 enlaces, botones u otros controles, 5 elementos; capturas a 375 y 1440 revisadas.
- 320, 375, 768, 1024, 1440 y 1920: 0 desborde, 0 elementos fuera o recortados, 0 peticiones externas del navegador. Texto al 200 % a 320 y 1024: 0 desborde.
- axe 4.14.1 (reglas por defecto), 6 anchos: 0 violaciones (moderadas incluidas), 0 incompletas. No acredita conformidad WCAG; las 59 moderadas de RETEST-3 en otras rutas no se re-ejecutaron.
- Contraste sobre el fondo real `rgb(246,247,249)`: lista y marcadores (14 px) y descripción 6.94:1; `h1` 16.31:1.
- Pruebas: no debilitadas. Las dos modificadas sustituyen la aserción del texto provisional por descripción, cinco elementos ordenados y ausencia de texto provisional; conservan 0 enlaces/botones en E2E. Fijan solo el inicio de cada elemento (Informational). Sin `skip/only/todo/fixme`; sin cambios en independientes ni acceptance.

### C4 con el texto modificado (HD-1)
**PASS**, por evidencia ya registrada y **no re-ejecutada**: el POST superó en navegador a 320/375/767/768/1280 teclado, ARIA, contador, GET con panel cerrado, limpiar y rango inválido visible; el único incumplimiento hasta RETEST-3 era H-01 (sin JavaScript), requisito retirado. H-01 sigue abierto como limitación conocida y H-08 aceptado (HD-2). El FAIL anterior se conserva: se emitió con el criterio original.

### Veredicto global
| Criterios | Estado |
|---|---|
| C1, C2, C3, C5, C6, C8, C9, C10, C11 | PASS (evidencia de RETEST-3; en `/`, comprobado ahora) |
| C4 | PASS (HD-1) |
| C12 | PASS: tres rutas permitidas y checks dirigidos; `format:check`, `lint` global y suites no repetidos (HD-6) |
| C7 | **BLOCKED**: falta CI sobre el SHA objetivo |

**TASK-014: BLOCKED**, no es PASS. La CI debe ejecutarse sobre el commit que incluya estos cambios, con la regresión completa.

### Git
Rutas modificadas antes de este informe: las tres permitidas y `TASK-014.md` (Orchestrator, hash sin cambios durante la verificación). Nada en staging. Testing solo añadió esta sección; temporales en el subdirectorio `testing-home` del scratchpad. Puertos 3100/3393 libres. `.next` (ignorado) queda compilado con valores ficticios: ejecutar `pnpm build` antes de `pnpm start`.
