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

**Rasgo distintivo:** el lateral oscuro con foco turquesa y el monograma "N" trazado como recorrido; el acento teal se reserva a acciones primarias y estado activo.

## 2. Tokens

Todos son variables `@theme` en `globals.css` (utilidades Tailwind: `bg-canvas`, `text-ink-muted`, …).

### Color y contraste (WCAG 2.2 AA, calculado)

| Token                     | Valor             | Uso                          | Contraste                                                       |
| ------------------------- | ----------------- | ---------------------------- | --------------------------------------------------------------- |
| `canvas`                  | #F6F7F9           | fondo de página              | ink sobre canvas 16.3:1                                         |
| `surface`                 | #FFFFFF           | tarjetas, cabecera, inputs   | ink 17.5:1                                                      |
| `sunken`                  | #EEF1F4           | cabeceras de tabla, hover    | ink-subtle 5.1:1                                                |
| `line`                    | #D8DDE4           | divisores decorativos        | n/a (no transmite estado)                                       |
| `line-strong`             | #7C8796           | bordes de input/botón        | 3.6:1 sobre surface (UI 3:1)                                    |
| `ink`                     | #0F1A2A           | texto principal              | 17.5:1                                                          |
| `ink-muted`               | #4A5668           | texto secundario             | 7.4:1                                                           |
| `ink-subtle`              | #5B6778           | ayudas, placeholder          | 5.7:1                                                           |
| `accent` / `accent-hover` | #0B6E6E / #095858 | acción primaria, enlaces     | blanco sobre accent 6.0:1 / 8.2:1                               |
| `focus`                   | #0B5FD9           | anillo de foco (claro)       | 5.8:1                                                           |
| `nav-focus`               | #7FD6D6           | anillo de foco sobre lateral | 10.3:1                                                          |
| `success` / soft          | #0F6B40 / #E3F4EA | éxito                        | 5.8:1                                                           |
| `warning` / soft          | #7A4A00 / #FFF1D6 | aviso                        | 6.7:1                                                           |
| `danger` / soft           | #B42318 / #FDE8E6 | error, destructivo           | 5.6:1 (6.6:1 sobre blanco)                                      |
| `info` / soft             | #1D5FA8 / #E6F0FB | información                  | 5.6:1                                                           |
| `neutral` / soft          | #3A4556 / #E7EBF0 | badge neutro                 | 8.1:1                                                           |
| `nav` / `nav-active`      | #0F1B2D / #1F3049 | lateral                      | texto #C9D2DF 11.3:1; activo blanco 13.3:1; muted #9AA7BA 7.1:1 |

Los valores se calcularon con la fórmula de luminancia relativa WCAG; no sustituyen una auditoría con herramienta ni con usuarios. El color nunca es el único portador de significado (badges y alertas llevan texto e icono).

### Tipografía

Pila del sistema (`--font-sans`: system-ui, Segoe UI, Roboto…), sin fuentes remotas ni dependencias; `--font-mono` para identificadores. Escala: título de página 24/32 semibold con `tracking-tight`; sección 16 semibold; cuerpo 14 (16 en inputs móviles para evitar zoom); auxiliar 12 (mínimo, solo etiquetas y badges). Texto corrido ≤ 65ch.

### Espaciado, radios, sombras

- Espaciado: base 4 px, escala de Tailwind. Páginas: padding 16 px móvil / 32 px escritorio; separación entre bloques 24-32 px; dentro de tarjetas 16-24 px.
- Radios: `sm` 4 (badges), `md` 8 (botones, inputs), `lg` 12 (tarjetas, diálogo). Bordes 1 px `line`; los controles interactivos usan `line-strong`.
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

- **Button:** una sola `primary` por zona; `secondary` para acciones alternas (p. ej. Cerrar sesión); `ghost` en barras; `danger` solo para acciones destructivas con confirmación (`Dialog`). Usa `loading` en envíos.
- **Field:** siempre con etiqueta visible; ayuda con `hint`, errores con `error` (activa `aria-invalid` y `aria-describedby`). No uses placeholder como etiqueta.
- **Badge:** estado corto de un registro (p. ej. de una orden); siempre texto.
- **Table:** `caption` obligatorio, `Th scope="col"`; envolver no es necesario, ya incluye scroll.
- **Dialog:** confirmaciones y formularios breves; título obligatorio; Escape y foco gestionados por `<dialog>`.
- **EmptyState / Alert / ErrorState:** vacío = qué llegará; alerta = mensaje contextual; error = qué pasó y cómo reintentar. `danger` anuncia con `role="alert"`.
- **LiveRegion:** aviso breve anunciado a lectores de pantalla; sin cola ni temporizadores.
- **AppShell:** marco de toda página autenticada; la navegación se edita solo en `src/features/navigation/items.ts`. `data-testid` `org-name`/`user-role` los emite únicamente el shell.

## 5. Accesibilidad y responsive

Landmarks `header`, `nav` (etiquetada), `main`; un `h1` por página; enlace "Saltar al contenido". Menú móvil: botón con `aria-expanded`/`aria-controls`, Escape cierra y devuelve el foco; panel cerrado en móvil es `visibility: hidden` (no enfocable). Breakpoints: móvil <768 (panel desplegable), ≥768 lateral fijo de 256 px. Sin scroll horizontal de página.

## 6. Verificación

Revisión estática y comprobaciones automáticas del repositorio (tipos, lint, unit, build, E2E de humo). La inspección visual en navegador a 375/768/1280 px y la auditoría de accesibilidad con herramienta quedan pendientes de Testing/humano si no constan en el informe de tarea. No se declara conformidad WCAG.
