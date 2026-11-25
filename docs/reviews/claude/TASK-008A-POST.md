# TASK-008A — Testing POST

- Fase: POST (estándar, UI/design system). Esfuerzo solicitado: medium; efectivo no verificable.
- Rama feat/supabase-auth, base HEAD 09fb320, árbol sin commit (diff de Develop sobre el workspace).
- Escritura propia: `tests/unit/independent/app-shell-a11y.test.tsx` (A), `tests/e2e/independent/login-layout.spec.ts` (A) y este informe. Nada más modificado por Testing.

## Veredicto: PASS (con limitaciones registradas)

## Comandos (exit codes)

| Comando                                       | Exit | Resultado                                           |
| --------------------------------------------- | ---- | --------------------------------------------------- |
| pnpm format:check / lint / typecheck          | 0    | limpio                                              |
| pnpm test:unit                                | 0    | 164 tests (incluye mis 9 nuevos)                    |
| pnpm test:integration                         | 0    | 151 tests                                           |
| pnpm build                                    | 0    | ok                                                  |
| pnpm test:e2e                                 | 0    | 9 passed (antes de añadir mi spec); mi spec 3/3 ok  |
| test:e2e:supabase                             | n/e  | no ejecutado (solo CI), según instrucciones         |

## Criterios

- C1: docs/design.md tiene 3 direcciones distintas (Plano técnico / Papel de taller / Consola nocturna), elección argumentada, tokens, densidad ERP y guía de componentes. Cumple (revisión estática).
- C2: contraste recalculado: texto ink/canvas 16.3, ink-muted/surface 7.4, ink-subtle/sunken 5.07, blanco/accent 6.05, blanco/danger 6.57, badges soft 5.2-6.7, nav-text/nav 11.3, nav-muted/nav-active 5.46; UI: line-strong/canvas 3.40, focus/canvas 5.36. Todo >= AA. `:focus-visible` 2px azul (`rgb(11,95,217)` medido), `.on-dark` turquesa, prefers-reduced-motion presente. Cumple.
- C3: AppShell/ShellFrame verificados en jsdom: landmarks únicos, aria-expanded/aria-controls con id existente, Escape cierra y devuelve foco, panel cerrado `invisible` (no enfocable), Panel con aria-current, Clientes/Técnicos/Órdenes sin enlace, solo `/dashboard` enlazada, config en `items.ts`. Cumple. Limitación: "no enfocable" solo comprobado por clase `invisible` (jsdom no calcula CSS).
- C4: login-form/page conservan Server Action, safeNextPath, hidden next, Alert `data-testid="form-error"`; en navegador 1 h1, label correo/contraseña, 1 botón, sin enlace de registro. Cumple.
- C5: `requireMembership` intacto; org-name/user-role una sola vez y ausentes en denegado (jsdom); access-denied una vez; un único botón Cerrar sesión (form + Server Action); sin métricas. Cumple (revisión de código + jsdom; sin sesión real).
- C6: Button (variantes, loading con aria-busy/disabled), Field (aria-describedby/aria-invalid), Alert (role), Dialog nativo, LiveRegion, Table/Badge/EmptyState/Spinner presentes y tipados; typecheck ok. Cumple.
- C7: tests independientes de home en verde (unit y e2e).
- C8: sin desbordamiento horizontal en `/` y `/login` a 375/768/1280 (scrollWidth == clientWidth); un h1 y un main en todas; Tab recorre email, contraseña, botón con outline sólido 2px.
- C9: `git diff` vacío para src/proxy.ts, src/lib, supabase, package.json, lockfile y tests/ de Develop; sin dependencias nuevas. LogoutButton solo presentación. Sin `.skip/.only/.todo` ni relajación. Cumple.
- Selectores de tests/e2e-supabase/independent: sin duplicados de testid ni botones/labels en `/login` ni en el shell (el botón "Menú" no coincide con /cerrar sesi/).

## Revisión visual (capturas fuera del repo)

`<scratchpad de la sesión>/screens/` (temporal, fuera del repositorio; ruta local saneada por Orchestrator) — home-{375,768,1280}.png, login-{375,768,1280}.png, login-focus-1280.png, login-focus-input.png, login-focus-btn2.png.
Juicio: /login a 1280 con panel oscuro de marca y formulario claro, jerarquía clara, monograma propio y acento teal contenido; coherente y profesional, no genérico, adecuado para ERP. A 375 una columna limpia. Home sobria, correcta aunque minimalista.

## Hallazgos (ninguno bloqueante)

- F1 Low, `src/components/ui/Button.tsx` (`transition-colors` incluye outline-color) : al enfocar por teclado el anillo parte de `currentColor` (blanco en botón primario) y tarda ~150 ms en llegar a azul; una captura inmediata no muestra anillo. Estado final correcto. Sugerencia: no animar outline-color (`transition-[background-color,border-color]`).
- F2 Informational, `src/app/login/login-form.tsx`: `Alert role="alert"` dentro de `div aria-live="polite"` puede anunciarse dos veces. Quitar el wrapper o el rol.
- F3 Informational: `LiveRegion` y `Dialog` sin pruebas propias de Develop (sin uso aún).

Medium/Low/Informational requieren aceptación humana registrada.

## Limitaciones / pendiente

- /dashboard no inspeccionado visualmente (requiere sesión real; no se usaron credenciales): validado por jsdom y código. Comportamiento móvil del shell (panel desplegable) no visto en navegador real.
- test:e2e:supabase pendiente de CI.
- Estado Git: tras mi trabajo solo se añaden los dos tests independientes y este informe.
