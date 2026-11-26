# Nexovantis: sistema de diseño

Perfil Premium Frontend Director: Core. Ambición: Refined. Implementación: `src/app/globals.css` (tokens), `src/components/ui/` y `src/components/shell/`.

## 1. Dirección creativa

**Tesis visual:** una herramienta de taller bien ordenada: superficies claras y neutras, un lateral oscuro que ancla la navegación y un único color de acción que solo aparece donde se puede actuar.

Audiencia: dueños y administrativos de pequeñas empresas de servicio técnico, que trabajan a ratos entre visitas, en escritorio y móvil. Objetivo: confianza y velocidad de lectura, no espectáculo.

|            | A. Plano técnico (elegida)                                          | B. Papel de taller                                                                          | C. Consola nocturna                                                                    |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Concepto   | Lienzo gris frío, lateral azul tinta, acento verde azulado          | Fondo crema cálido, tipografía con serifa en titulares, acento terracota                    | Tema oscuro denso, acento neón, estética de terminal                                   |
| Paleta     | Tinta #0F1A2A, lienzo #F6F7F9, acento #0B6E6E                       | Crema #F7F1E5, marrón #2B2118, terracota #B4472B                                            | Negro #0B0E13, gris #1A2029, lima #B6F23A                                              |
| Tipografía | Pila del sistema (sans)                                             | Serifa de sistema + sans                                                                    | Monoespaciada para datos                                                               |
| Carácter   | Preciso, sereno, profesional                                        | Artesanal, cercano                                                                          | Técnico, intenso                                                                       |
| Riesgos    | Puede parecer sobrio; se compensa con el lateral y un acento propio | Serifas del sistema inconsistentes entre plataformas; menos "SaaS"; densidad de tablas peor | Fatiga en jornadas largas, contraste del neón difícil de mantener, doble coste de tema |

**Elección: A.** Prioriza lectura prolongada de tablas y formularios, es verificable en contraste con pocos tokens, no depende de fuentes externas y distingue visualmente el marco (oscuro) del trabajo (claro). Solo tema claro en esta fase (`color-scheme: light`); el tema oscuro queda fuera de alcance.

**Rasgo distintivo:** el monograma «N» une dos planos en verde petróleo y menta. Aparece en la portada, el acceso, la navegación y el icono del navegador. La portada enlaza al acceso y presenta una vista del panel con órdenes de ejemplo.

## 2. Tokens

Todos son variables `@theme` en `globals.css` (utilidades Tailwind: `bg-canvas`, `text-ink-muted`, …).

### Color y contraste (WCAG 2.2 AA, calculado)

| Token                     | Valor             | Uso                          | Contraste                                                       |
| ------------------------- | ----------------- | ---------------------------- | --------------------------------------------------------------- |
| `canvas`                  | #F3F7F6           | fondo de página              | ink sobre canvas 14.5:1                                         |
| `surface`                 | #FFFFFF           | tarjetas, cabecera, inputs   | ink 15.7:1                                                      |
| `sunken`                  | #EAF1F0           | cabeceras de tabla, hover    | ink-subtle 5.0:1                                                |
| `line`                    | #D8E3E1           | divisores decorativos        | n/a (no transmite estado)                                       |
| `line-strong`             | #738682           | bordes de input/botón        | 3.8:1 sobre surface                                             |
| `ink`                     | #102723           | texto principal              | 15.7:1 sobre surface                                            |
| `ink-muted`               | #405853           | texto secundario             | 7.7:1 sobre surface                                             |
| `ink-subtle`              | #536B65           | ayudas, placeholder          | 5.7:1 sobre surface                                             |
| `accent` / `accent-hover` | #087566 / #065B50 | acción primaria, enlaces     | blanco sobre accent 5.6:1 / 8.0:1                               |
| `accent-soft`             | #DAF2EB           | superficies destacadas       | ink-muted 6.5:1                                                 |
| `focus`                   | #0864C3           | anillo de foco (claro)       | 5.4:1 sobre canvas                                              |
| `nav-focus`               | #65E2C6           | anillo de foco sobre lateral | 9.8:1 sobre nav / 6.9:1 sobre nav-active                         |
| `success` / soft          | #0F6B40 / #E3F4EA | éxito                        | 5.8:1                                                           |
| `warning` / soft          | #7A4A00 / #FFF1D6 | aviso                        | 6.7:1                                                           |
| `danger` / soft           | #B42318 / #FDE8E6 | error, destructivo           | 5.6:1 (6.6:1 sobre blanco)                                      |
| `info` / soft             | #1D5FA8 / #E6F0FB | información                  | 5.6:1                                                           |
| `neutral` / soft          | #3A4556 / #E7EBF0 | badge neutro                 | 8.1:1                                                           |
| `nav` / `nav-active`      | #102826 / #20423D | lateral                      | nav-text #D1E4E0 11.7:1 y nav-muted #A6C4BE 8.3:1 sobre nav      |

Los valores se calcularon con la fórmula de luminancia relativa WCAG; no sustituyen una auditoría con herramienta ni con usuarios. El color nunca es el único portador de significado (badges y alertas llevan texto e icono).

### Tipografía

Pila del sistema (`--font-sans`: system-ui, Segoe UI, Roboto…), sin fuentes remotas ni dependencias; `--font-mono` para identificadores. Escala: título de página 24/32 semibold con `tracking-tight`; sección 16 semibold; cuerpo 14 (16 en inputs móviles para evitar zoom); auxiliar 12 (mínimo, solo etiquetas y badges). Texto corrido ≤ 65ch.

### Espaciado, radios, sombras

- Espaciado: base 4 px, escala de Tailwind. Páginas: padding 16 px móvil / 32 px escritorio; separación entre bloques 24-32 px; dentro de tarjetas 16-24 px.
- Radios de componentes de uso compartido `sm` 4 (badges), `md` 8 (botones, inputs), `lg` 14 (tarjetas, diálogo). Bordes de 1 px y `line-strong` en los controles interactivos.
- Elevación: plana por defecto. `shadow-card` para superficies sueltas; `shadow-pop` solo en capas flotantes (panel móvil, diálogo, aviso). La jerarquía se logra con bordes y fondo, no con sombras apiladas.

### Estados

| Estado            | Regla                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Hover             | un paso más oscuro (accent-hover) o fondo `sunken`; nunca solo cursor                                   |
| Focus             | `:focus-visible` global: anillo de 2 px `focus`, offset 2 px; en `.on-dark` `nav-focus`                 |
| Active            | mismo tono que hover (sin salto de tamaño)                                                              |
| Disabled          | opacidad 55 %, `cursor-not-allowed`, atributo `disabled`; no se usa para transmitir información crítica |
| Error             | borde `danger` de 2 px + mensaje de texto enlazado (`aria-describedby`, `aria-invalid`)                 |
| Success / Warning | `Alert` o `Badge` con texto; iconos decorativos `aria-hidden`                                           |
| Loading           | `Button loading` (deshabilitado, `aria-busy`, spinner), `Skeleton` para contenido                       |

### Movimiento

Solo transiciones funcionales de 150-200 ms (`ease-out`): color de hover y deslizamiento del panel móvil. Spinner y skeleton son los únicos bucles. `prefers-reduced-motion: reduce` reduce toda animación y transición a ~0 (regla global).

## 3. Principios de densidad para ERP

1. Prioriza escaneo: tablas con filas de ~40 px, cabeceras en mayúsculas pequeñas, datos alineados a la izquierda, una acción primaria por vista.
2. Densidad por contenido, no por reducción de tipografía: cuerpo 14 px, sin bajar de 12 px.
3. Tablas con scroll horizontal propio (nunca de página) y `caption`.
4. Los estados vacíos explican qué llegará y cómo; nunca muestran cifras ni gráficos inventados.
5. Los módulos no disponibles se muestran como "Próximamente", sin enlace a rutas inexistentes.
6. Objetivos táctiles ≥ 40 px de alto en móvil (botones md/lg, filas de navegación).

## 4. Guía de componentes

- **Button:** una sola `primary` por zona; `secondary` para acciones alternas (p. ej. Cerrar sesión); `ghost` en barras; `danger` solo para acciones destructivas con confirmación (`Dialog`); `danger-outline` para el disparador discreto de una destructiva (archivar: ancho ajustado, el rojo sólido queda en la confirmación). `sm` mide 40 px en móvil y 32 px desde 768 px. Usa `loading` en envíos.
- **Field:** siempre con etiqueta visible; ayuda con `hint`, errores con `error` (activa `aria-invalid` y `aria-describedby`). No uses placeholder como etiqueta.
- **Badge:** estado corto de un registro (p. ej. de una orden); siempre texto.
- **Table:** `caption` obligatorio, `Th scope="col"`; envolver no es necesario, ya incluye scroll.
- **Dialog:** confirmaciones y formularios breves; título obligatorio; Escape y foco gestionados por `<dialog>`. Si el envío falla, el diálogo de cancelar una orden sigue abierto, muestra el error dentro (`role=alert`, con foco) y conserva lo escrito; si se cerró durante el envío, el error aparece en la página. "Quitar concepto" usa la misma confirmación con error dentro. Destino del foco: cancelar o completar una orden, aviso "Orden cerrada"; asignar, reasignar o iniciar, título "Acciones" (o el mensaje de error); quitar un concepto, título "Conceptos"; aceptar o rechazar un presupuesto, contenido principal (o el mensaje de error). Registrar movimiento y añadir concepto, si el envío dejó el foco sin control: título de su bloque o mensaje de error. Guardar una orden, un presupuesto, un artículo, un cliente o un técnico, y editar un concepto: si falla y el foco se perdió, mensaje de error (en el diálogo, dentro de él; si se cerró durante el envío, junto a "Editar", y reabrir lo limpia). Acceso con credenciales rechazadas y foco perdido: mensaje de error. En las acciones de una orden solo se muestra el resultado de la última. El diálogo de archivar y restaurar delega el foco en `<dialog>`.
- **CollapsibleFilters:** rejilla de los filtros de órdenes, presupuestos y actividad. Por debajo de 768 px la búsqueda y "Filtrar" quedan a la vista y el resto se pliega tras "Filtros (n activos)" (`aria-expanded`/`aria-controls`); los campos plegados se envían igual, un error de rango lo abre y sin JavaScript (`scripting: none`) no se pliega nada.
- **EmptyState / Alert / ErrorState:** vacío = qué llegará; alerta = mensaje contextual; error = qué pasó y cómo reintentar. `danger` anuncia con `role="alert"`.
- **LiveRegion:** aviso breve anunciado a lectores de pantalla; sin cola ni temporizadores.
- **PageHeader / LinkButton:** un único `h1` por página con descripción y acciones; `LinkButton` es un enlace con el aspecto de `Button` (misma altura táctil de 40 px), para navegación (alta, cancelar).
- **SearchBar / SegmentedLinks / Pagination:** búsqueda por `GET`, filtro de una opción y paginación por enlaces; todo viaja en `searchParams` (URL compartible, funciona sin JavaScript). Resumen "Página X de Y".
- **RecordList / RecordForm / ArchiveControl / HistoryList (`ui/records`):** listado (tabla desde 768 px, tarjetas en móvil, estados vacíos con CTA), formulario con validación HTML y errores por campo, archivar/restaurar con `Dialog` (`danger` solo para archivar) y éxito anunciado en `LiveRegion`, e historial de archivado sin actores inventados. Los usan Clientes y Técnicos.
- **AppShell:** marco de toda página autenticada; la navegación se edita solo en `src/features/navigation/items.ts`. `data-testid` `org-name`/`user-role` los emite únicamente el shell.

## 5. Accesibilidad y responsive

Landmarks `header`, `nav` (etiquetada), `main`; un `h1` por página; enlace "Saltar al contenido". Menú móvil: botón con `aria-expanded`/`aria-controls`, Escape cierra y devuelve el foco; panel cerrado en móvil es `visibility: hidden` (no enfocable). Breakpoints: móvil <768 (panel desplegable), ≥768 lateral fijo de 256 px. Sin scroll horizontal de página.

## 6. Verificación

Revisión estática y comprobaciones automáticas del repositorio (tipos, lint, unit, build, E2E de humo). La inspección visual en navegador a 375/768/1280 px y la auditoría de accesibilidad con herramienta quedan pendientes de Testing/humano si no constan en el informe de tarea. No se declara conformidad WCAG.

## Ajustes TASK-008B-DEV2

- Panel móvil: se cierra al cambiar de ruta, al pulsar cualquier enlace (también la ruta actual), con Escape, con la capa, con su botón "Cerrar panel" y al cruzar a 768 px. Abierto: resto del contenido `inert` y body sin scroll; en escritorio no hay capa ni bloqueo.
- Cabecera móvil: botón de menú icónico (40 px, nombre accesible "Menú"), monograma, y a la derecha organización/rol truncados más "Cerrar sesión".
- Contenedor de `main`: ancho máximo 1400 px; formularios ≤ 42rem; detalle en 3 columnas desde 1280 px.
- Login: panel de marca con retícula de plano técnico (SVG inline decorativo), cabecera de marca en móvil y control "Mostrar/Ocultar" de contraseña (texto visible, sin la palabra "contraseña" para no duplicar el label del campo).

## Ajustes TASK-014 (pulido final)

- Panel: cabecera con los accesos rápidos (en la misma línea que el título cuando caben; si no, debajo); indicadores con abiertas, vencidas y total destacados y debajo el desglose compacto por estado; pendientes y actividad (con inventario y enlace a `/activity`); módulos con su cifra y una flecha decorativa, sin badge "Abrir".
- Tablas en columnas estrechas: los conceptos de presupuesto y el historial de movimientos responden al ancho de su contenedor (container queries), no del viewport. Conceptos: un bloque por línea con cifras en rejilla (2, 3 o 5 columnas), conservando la semántica de tabla con `role` explícitos. Movimientos: tabla de cuatro columnas desde 42 rem y tarjetas por debajo. Sustituye en estos dos casos al scroll horizontal propio del principio 3.
- Los estados vacíos de los listados, situados bajo el `h1`, usan `h2`.
- Enlaces dentro de una frase: subrayados siempre (no se distinguen solo por el color).
- Textos largos sin espacios: `main` usa `overflow-wrap: anywhere`; las cabeceras de tabla solo se parten entre palabras y lo demás que no deba partirse declara `whitespace-nowrap` o `truncate`.
- Los formularios con selectores (órdenes, presupuestos, artículos, conceptos, movimientos y asignar técnico) envían con `submitKeepingValues`: si el envío falla se conserva lo elegido (el reseteo automático de React 19 devolvía los `<select>` a su valor inicial). En éxito redirigen, cierran el diálogo o se limpian como antes.
- Envío sin JavaScript (POST progresivo): alta y edición de órdenes, presupuestos, artículos, clientes y técnicos, y asignar, reasignar, iniciar y completar una orden. Requieren JavaScript: registrar movimiento, añadir, editar y quitar concepto (quitar, desde que pide confirmación), cancelar una orden, aceptar o rechazar un presupuesto y archivar o restaurar. Pendiente: en las rutas con `loading.tsx` el contenido no llega a mostrarse sin JavaScript.
