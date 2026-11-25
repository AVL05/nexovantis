# Directrices de Testing (contrato obligatorio)

Aplican a Develop, Testing, Orchestrator y Codex. No reducir criterios ni saltar pruebas para aprobar.

## Estrategia de ejecución proporcional
Testing POST es obligatorio después de cada implementación funcional; PRE es selectivo según [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md). En tareas estándar Orchestrator fija criterios derivados de este contrato; Testing los verifica de forma independiente y añade casos de alto valor cuando falten. PRE se mantiene en tareas críticas (Auth/RLS, roles, migraciones con impacto, transacciones, concurrencia e invariantes nuevas). RETEST se ejecuta si hay cambios correctivos, sobre los casos afectados y regresiones relevantes. No es obligatorio crear tests nuevos si los existentes cubren el criterio con evidencia válida. Ejecutar checks dirigidos durante el desarrollo y regresión completa en CI/puertas; todos los criterios aplicables deben quedar verificados antes de PASS. PGlite verifica PostgreSQL con un shim de Auth, no Supabase Auth/PostgREST reales. No declarar superadas pruebas pendientes ni reemplazar evidencia de integración con mocks.

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

## Veredictos
PASS solo si todos los criterios aplicables se ejecutaron y se superaron, sin hallazgos Critical/High ni incumplimientos de criterios aprobados. FAIL ante cualquier incumplimiento de un criterio aprobado o ante cualquier hallazgo Critical/High, con independencia de la etiqueta de gravedad. BLOCKED si falta evidencia o no se puede ejecutar o verificar un criterio o requisito aplicable; BLOCKED nunca se convierte en PASS sin evidencia. Los hallazgos Medium/Low/Informational fuera de criterios se listan y requieren aceptación humana explícita y registrada; es un registro, no una variante de veredicto. Los únicos veredictos son PASS, FAIL y BLOCKED.

Registrar comando, exit code, entorno, fecha, SHA/diff y resultado real; indicar omisiones. La aceptación final es humana.

## Escala de gravedad
Única escala normativa. Las etiquetas se escriben en inglés y sin variantes.

| Gravedad | Definición medible | Efecto en el veredicto |
|---|---|---|
| Critical | Secreto expuesto o rastreable por Git; lectura o escritura cruzada entre organizaciones; pérdida o corrupción de datos; acción irreversible no autorizada (push, merge, deploy, escritura en producción) | FAIL siempre |
| High | Criterio P0 incumplido sin alternativa; regla de seguridad inefectiva (deny, RLS, validación de servidor); reducción o debilitamiento de criterios o pruebas aprobados; escritura fuera de la lista permitida o en archivos protegidos; check obligatorio en rojo | FAIL siempre |
| Medium | Incumplimiento parcial u omisión documental de un criterio con alternativa; bloqueo de un comando o flujo legítimo; defecto funcional con alternativa y sin impacto en datos ni seguridad | FAIL si incumple un criterio aprobado; si no, se lista para aceptación humana |
| Low | Defecto menor o de claridad sin impacto funcional, de seguridad ni de criterios | Se lista para aceptación humana |
| Informational | Observación, riesgo futuro o mejora sin incumplimiento | Se registra; no afecta al veredicto |

Incumplir un criterio aprobado es FAIL con independencia de la etiqueta. Cada hallazgo debe poder reproducirse con un comando o pasos concretos.

## Propiedad de tests/ y pruebas independientes
Tabla única; develop.md y testing.md la repiten sin variaciones. El handoff puede restringirla por tarea, nunca ampliarla a `tests/acceptance/**` ni a `independent/`. Si una ruta encaja en más de una fila, prevalece la regla más específica: `tests/unit/independent/**` es de Testing aunque esté dentro de `tests/unit/**`, que es de Develop.

| Ruta | Propietario | Regla |
|---|---|---|
| `tests/acceptance/**` | Testing | Develop no crea, modifica, elimina, salta ni debilita |
| `tests/**/independent/**` | Testing | Casos independientes de Testing dentro de unit, integration o e2e; mismas restricciones para Develop |
| `tests/unit/**` | Develop | Testing revisa y añade sus casos en `tests/unit/independent/**` |
| `tests/integration/**`, `tests/e2e/**` | Los asigna el handoff; por defecto Develop | Los casos de Testing van en `independent/` |
| `tests/support/**` (fixtures, utilidades) | Compartido | Cada cambio se declara en el handoff y lo revisa Testing |

Procedimiento si Develop considera incorrecta una prueba independiente: se detiene, no la toca y envía a Orchestrator el ID de la prueba, el motivo y la evidencia. Orchestrator lo traslada a Testing; Testing decide y registra la aprobación en su informe de `docs/reviews/claude/`; solo Testing modifica la prueba. En POST, Testing comprueba `git diff --name-only HEAD` contra las rutas protegidas y busca en el diff `.skip`, `.only`, `xit`, `xtest`, `.todo`, `fixme`, aserciones eliminadas o relajadas y umbrales rebajados.

## Evidencia válida de T01 (definición única)
Válida: invocación real de cada subagente nativo con la herramienta Agent; TASK-ID; fecha; nombre del subagente; extracto saneado de la respuesta; resultados de herramientas reportados por el arnés; estado Git antes y después y SHA; modelo y esfuerzo con su grado (verificado por CLI, autoinformado o no verificable); para Develop, al menos una delegación con escritura real atribuible por diff (candidata: TASK-002, sujeta a su veredicto POST).

No válida: roles simulados en la conversación principal; tests propios de Develop presentados como revisión independiente; informes retrospectivos; transcripciones sin sanear; afirmaciones sin SHA.

## Validación estática y efectiva
Los informes y STATUS.md distinguen tres niveles: validación estática (lectura, grep, JSON, simulación), validación efectiva parcial dentro de un subagente (casos inocuos) y validación efectiva pendiente (requiere humano o reinicio). El esfuerzo efectivo de un agente se declara "no verificable" mientras no exista comprobación por CLI (véase la comprobación en docs/AGENT_WORKFLOW.md). Un veredicto sobre validación estática no afirma efectividad confirmada en la CLI.

## Trazabilidad mínima
Toda regla BR y todo criterio aprobado se mapea a al menos un caso positivo y uno negativo ejecutable. La matriz BR/criterio → casos se crea en F2 y se revisa en cada puerta. Umbral numérico de cobertura de código: sin aprobar; es una decisión humana pendiente (DH-09, F2). Propuesta, no aprobada: medir la cobertura de `src/features` y de las funciones de dominio y reportarla en CI, y que el humano fije el umbral al aprobar el scaffold.

## Reproducción del fallo previo
Antes de F2 no existe runner: "reproducir el fallo previo" significa una comprobación estática o manual registrada en el informe (comando, salida, exit code). Desde F2 se reproduce con el runner de pruebas (propuesta de tarea: harness de pruebas en F2). No se simula un fallo que no existe.

## Accesibilidad y responsive (T10)
Objetivo WCAG 2.2 AA, sin certificación. Criterios medibles:

| Criterio | Umbral | Cómo se verifica |
|---|---|---|
| Contraste de texto | 4.5:1; 3:1 para texto grande, componentes de interfaz e indicador de foco | Automático (parcial) y revisión manual en estados hover, foco y deshabilitado |
| Teclado | Todo operable sin ratón, sin trampas; orden de foco lógico | Recorrido automatizado de Tab más revisión manual del orden |
| Foco | Visible y no oculto por otros elementos | Manual; automático parcial |
| Nombres accesibles | Todos los controles tienen etiqueta o nombre accesible | Automático |
| Errores | Identificados en texto y asociados al campo | Automático parcial y manual |
| Mensajes de estado | Anunciados a tecnologías de apoyo (carga, éxito, error) | Manual |
| Tamaño de objetivo | Al menos 24×24 px CSS | Automático (medición de cajas) |
| Reflow y zoom | Sin scroll horizontal a 320 px CSS de ancho; usable con zoom de texto al 200% | Automático (desborde) y manual (zoom) |
| Viewports | 320, 390, 768 y 1280 px (propuesta) | Automático |
| Documento | `lang="es"` y título de página por ruta | Automático |
| Autenticación | Sin pruebas cognitivas; admite gestor de contraseñas y pegado | Manual |

## Plan de automatización de accesibilidad (F2, propuesta no aprobada)
Herramienta propuesta: Playwright con axe-core, sujeta a la aprobación de dependencias en F2 (no se añade nada ahora; no existe package.json). Umbral propuesto: 0 violaciones serious o critical; las moderate y minor se reportan con su gravedad. Además: comprobación de desbordes por viewport, recorrido por teclado e integración en `pnpm test:e2e` o en un script nuevo declarado y aprobado. Las herramientas automáticas cubren solo parte de los criterios: no sustituyen la revisión manual de la tabla anterior. Ejecución por UI en F3/F4 y regresión final en F7.

## Casos complementarios (TASK-002)
Los IDs son propios y no sustituyen a T01..T12. "Excluido" significa que el caso no es ejecutable hasta que el humano decida el punto DH indicado (véase docs/BUSINESS_RULES.md). Cada caso positivo (P) tiene su contrapartida negativa (N).

### TEAM (ejecución en F3)
| ID | Caso | Tipo |
|---|---|---|
| TC-TEAM-01 | Crear técnico válido: persiste y aparece tras recargar | P |
| TC-TEAM-02 | Crear técnico con datos inválidos: rechazado en servidor, sin registro | N |
| TC-TEAM-03 | Consultar listado y detalle de técnicos de la propia organización | P |
| TC-TEAM-04 | Consultar un técnico de otra organización (UI y API de datos): no visible | N |
| TC-TEAM-05 | Editar técnico: el cambio persiste; edición inválida o de otra organización rechazada | P/N |
| TC-TEAM-06 | Buscar técnicos: coincidencias correctas, estado vacío sin coincidencias, sin resultados de otra organización | P/N |
| TC-TEAM-07 | Archivar técnico: conserva su historial y deja de aparecer en la selección de asignación | P |
| TC-TEAM-08 | Asignar solo técnicos activos de la organización (UI y API/RLS): un técnico archivado o de otra organización es rechazado | N |
| TC-TEAM-09 | Un técnico archivado no se asigna a nuevas órdenes y sus órdenes pasadas siguen visibles | P/N |
| TC-TEAM-10 | Archivar técnico con órdenes abiertas asignadas | Excluido: DH-04 |
| TC-TEAM-11 | Restaurar técnico archivado | Excluido: DH-06 |

### Archivado y borrado de clientes y técnicos (F3)
| ID | Caso | Tipo |
|---|---|---|
| TC-ARCH-01 | Archivar cliente: conserva historial y órdenes; visible en historial | P |
| TC-ARCH-02 | Cliente archivado excluido de la selección para nuevas órdenes (UI y API/RLS) | N |
| TC-ARCH-03 | Intento de borrar un cliente o técnico con registros vinculados: rechazado, o la operación no existe | N |
| TC-ARCH-04 | Archivar cliente con órdenes abiertas | Excluido: DH-05 |
| TC-ARCH-05 | Restaurar cliente archivado | Excluido: DH-06 |

### Transiciones y cancelación de órdenes (F4)
| ID | Caso | Tipo |
|---|---|---|
| TC-ORD-01 | Cada transición permitida de la matriz de BR03 (pendiente → asignada → en curso → completada) se aplica y persiste tras recargar | P |
| TC-ORD-02 | Asignada y en curso exigen técnico válido (activo y de la misma organización); sin él se rechaza | N |
| TC-ORD-03 | Completada y cancelada rechazan cualquier transición posterior | N |
| TC-ORD-04 | Retrocesos de estado | Excluido: DH-01 |
| TC-ORD-05 | Saltos de estado | Excluido: DH-03 |
| TC-ORD-06 | Reasignar técnico en asignada o en curso | Excluido: DH-01 |
| TC-ORD-07 | Editar campos descriptivos de una orden terminal | Excluido: DH-07 |
| TC-CANC-01 | Cancelar una orden asignada o en curso: pasa a cancelada | P |
| TC-CANC-02 | Cancelar una orden completada o ya cancelada: rechazado | N |
| TC-CANC-03 | Cancelación y evento se guardan en una sola transacción; si falla el evento, el estado no cambia | P/N |
| TC-CANC-04 | La orden cancelada sale de "pendientes" y el dashboard la cuenta de forma coherente tras recargar y filtrar (BR04) | P |
| TC-CANC-05 | Cancelar una orden de otra organización: rechazado (BR01) | N |
| TC-CANC-06 | Cancelar desde pendiente; exigencia de motivo | Excluido: DH-02 |

### Eventos y trazabilidad (BR08, ACTIVITY)
Historial de órdenes en F4 (propuesta de tarea: eventos de órdenes); ACTIVITY P1 en F6. Los eventos mínimos son una propuesta pendiente de aprobación humana (DH-08). TC-EVT-01 a TC-EVT-08 están condicionados a la decisión DH-08: sus campos y eventos concretos son una propuesta y solo son ejecutables, con el contenido que decida el humano, tras resolverla. Lo ya aprobado es BR08 (identidad, fecha y entidad) y la consistencia de BR03.

| ID | Caso | Tipo |
|---|---|---|
| TC-EVT-01 | Cada evento guarda identidad del actor, fecha y hora, tipo de entidad, id de entidad, organización, acción y, cuando procede, valores anterior y nuevo | P |
| TC-EVT-02 | Evento mínimo propuesto: creación de orden, cambio de estado, asignación, cancelación y archivado generan su evento | P |
| TC-EVT-03 | Evento con campos obligatorios ausentes: rechazado | N |
| TC-EVT-04 | Los eventos son inmutables: UPDATE y DELETE por usuarios rechazados | N |
| TC-EVT-05 | Cambio de negocio y evento son atómicos: un fallo del evento revierte el cambio, y viceversa | P/N |
| TC-EVT-06 | Aislamiento por organización: un usuario no lee eventos de otra organización (RLS) | N |
| TC-EVT-07 | Los eventos no contienen secretos ni datos innecesarios | N |
| TC-EVT-08 | P1: aceptación y rechazo de presupuesto y movimiento de stock generan evento | P |
| TC-EVT-09 | Actor de eventos del sistema o de seed | Excluido: DH-08 |
