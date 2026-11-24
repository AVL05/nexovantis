# TASK-009-POST — Cierre de integración F3

- Fase: POST (estándar, esfuerzo medium solicitado; efectivo no verificable). Rama feat/supabase-auth, base HEAD 3617d58, árbol con cambios sin commit. Modelo efectivo: autoinformado Sonnet 5.5.
- Git antes/después: mismo estado (12 entradas: 7 M, 5 ??). Solo se añade este informe. Sin commit/push/instalaciones/Supabase Cloud.
- Veredicto: **PASS** (con 2 observaciones Low/Informational para aceptación humana).

## 1. Revisión del diff de Develop

| Criterio | Resultado | Evidencia |
|---|---|---|
| H-1 / C-A1 recuentos primera ejecución | OK | seed-demo.test.ts "crea los recuentos exactos" (Norte 24+1/3, 6/2, 5 ev; Sur 8/2, 3/1, 3 ev) y "actor = owner" |
| C-A2 regresión restaurar + re-ejecutar | OK | "un designado restaurado por un miembro no se vuelve a archivar ni genera eventos": cliente y técnico, mismos ids de activity_events, mismos recuentos |
| C-A3 designado modificado no se altera | OK | "un designado modificado por un usuario no es alterado": fila y snapshot idénticos |
| C-A4 idempotencia | OK | "segunda ejecución sin cambios" y "otra ejecución deja snapshot idéntico" |
| No tautológica | OK (razonamiento) | El SQL antiguo (UPDATE por nombres designados con archived_at is null) re-archivaría los restaurados: fallaría `archived_at toBeNull` y el recuento/ids de eventos. El nuevo UPDATE se limita a `id = any(v_c_ids/v_t_ids)` recogidos del INSERT ... RETURNING de la misma ejecución |
| Invariantes del seed | OK | begin/commit único; `set local role authenticated` con claims del owner; sin service_role, triggers desactivados, INSERT en activity_events ni DELETE (grep: solo el comentario); 5 abortos con atomicidad (0/2 owners, org ausente/duplicada) |
| M1 nombre accesible | OK | `Mostrar <sr-only>contraseña</sr-only>` -> nombre "Mostrar contraseña"/"Ocultar contraseña"; el texto visible va al inicio (label-in-name). Unit actualizado; los e2e-supabase usan regex /mostrar/ y /ocultar/ y siguen siendo válidos |
| M2 teléfono/email | OK (verificación Playwright en página sintética) | Ver abajo |
| Pruebas relajadas | Ninguna | Sin .skip/.only/xit/xtest/.todo; sin cambios en tests/acceptance ni tests/**/independent/**; único cambio de test existente: nombres esperados más específicos en login-form.test.tsx |

M2 — verificación Playwright (chromium, CSS real compilado de .next, markup con las clases exactas de RecordList/RecordDetails/Table, email `administracion@oficinas-centro-empresarial-cantabrico.example.com`; script en scratchpad, no versionado). No hay sesión real local, por lo que no es la ruta autenticada:
- 375/768/1024/1280/1440: scroll horizontal de página = 0 y de la región de la tabla = 0 en todos.
- Teléfono una sola línea en tabla, tarjeta y detalle (altura 41/20/24 px) en todos los anchos.
- Email: tarjetas y detalle ajustan sin desbordar (detalle a 2 líneas); tabla trunca a 1024 (345 de 460 px) y 1280 (434 de 460), con `title` completo y texto completo en el DOM (scrollWidth > clientWidth).

## 2. Hallazgos

| ID | Gravedad | Ubicación | Descripción |
|---|---|---|---|
| F-1 | Low | src/components/ui/records/RecordList.tsx:78 | `max-w-64` en la celda es inerte: en 1024/1280 la celda mide 345/434 px (>256) y a 1440 no trunca. El truncado solo ocurre cuando la tabla se estrecha. Cumple el criterio (sin desbordes, title, DOM completo) pero el tope declarado no se aplica. Aceptación humana o ajuste cosmético |
| F-2 | Informational | tests | No hay prueba versionada de M2 (requiere sesión real; solo CI e2e-supabase podría cubrirlo). Verificación de esta tarea es manual/sintética. Sugerencia: añadir aserción de overflow con email largo en crm.spec.ts en una tarea futura (el seed incluye ese registro en Demo Norte) |

Ningún hallazgo Critical/High. Sin criterios incumplidos.

## 3. Comandos (locales)

| Comando | Exit | Resumen |
|---|---|---|
| pnpm format:check | 0 | OK |
| pnpm lint | 0 | 0 warnings |
| pnpm typecheck | 0 | OK |
| pnpm test:unit | 0 | 18 archivos, 260 tests |
| pnpm test:integration | 0 | 7 archivos, 235 tests (PGlite; incluye seed-demo 16) |
| pnpm build | 0 | OK |
| pnpm test:e2e | 0 | 12 tests |
| test:supabase, test:e2e:supabase | no ejecutados | Sin Docker/Supabase CLI |

## 4. Matriz criterio -> evidencia

| Criterio F3 | Local | CI 45484066916 sobre 3617d58 |
|---|---|---|
| Login/logout/sesión/rutas protegidas | unit auth-routes, independent/auth-static-guards, safe-next-path; e2e login-layout, home | e2e-supabase independent/{anonymous-access, authenticated-access, login-logout}; el diff (solo etiqueta del botón y estilos) no la invalida |
| Clientes y técnicos: alta, edición, búsqueda, paginación, archivar/restaurar | unit customers/technicians-schema, records-components/params/search/errors; integration records-flow, constraints, independent/archive-restore, archived-freeze | e2e-supabase crm.spec (alta/listado/búsqueda/edición/archivar/filtro/restaurar; validación servidor); S-02 búsqueda literal; no invalidada |
| Actividad archived/restored | integration independent/archive-restore, seed-demo (eventos, actor owner) | integración Supabase real: no invalidada por el diff (el seed no es migración) |
| Permisos, RLS, GRANT por columna, owner/member, aislamiento entre organizaciones | integration independent/rls, rls-extra, archived-freeze; seed-demo "aislamiento" | integration/supabase rls.supabase.test y crm.spec "otra organización no ve ni modifica": solo CI, no invalidada |
| Navegación, accesibilidad, responsive | unit app-shell-a11y, shell-frame, linkbutton-ssr; e2e login-layout y home (320-1280); verificación M2 sintética | crm.spec "móvil 375 px" y "shell autenticado": solo CI; el diff de estilos no la invalida (no hay overflow según M2) |
| Seed demo (H-1) | integration seed-demo.test | no aplica (PGlite); ejecución contra Supabase Cloud fuera de alcance |

No se detectan huecos sin cobertura en ninguna capa distintos de F-2. No se añadieron pruebas.

## 5. Preparación para G2/AUDIT-002 — riesgos residuales a auditar

1. R1 JWT residual: un usuario con membresía revocada conserva un JWT válido hasta su expiración; verificar que las políticas RLS consultan memberships en tiempo real y no claims.
2. Comodín de búsqueda: escape de %, _ y \ cubierto por S-02 (CI); auditar el patrón ilike y longitud máxima, y coste con volumen.
3. DH pendientes (deuda heredada) documentados en STATUS: revisar su cierre o aceptación humana.
4. PGlite vs Supabase: integración local usa un shim de auth/roles; el seed y las RLS solo están validados en PGlite localmente. GRANT por columna, `set local role` y triggers deben confirmarse en integration/supabase (CI) y, para el seed, en una ejecución real controlada.
5. Seed: se ejecuta con privilegios administrativos; auditar docs/SEED.md (deshacer, datos +34 000 y example.com) y que no se ejecute en producción por accidente.
6. Cobertura M2 solo manual/sintética (F-2) y F-1 cosmético.
7. e2e-supabase y test:supabase no ejecutables localmente: la regresión completa depende de un CI nuevo sobre el SHA final de esta tarea (evidencia 45484066916 corresponde a 3617d58, no al árbol actual).
