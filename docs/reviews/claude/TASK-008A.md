# TASK-008A — Nexovantis Design System

Fecha: 2026-11-24. Rama `feat/supabase-auth`, HEAD `09fb320` (sin commit; el humano no autorizó commits). Clasificación: estándar, sin Testing PRE (no se modifican contratos de seguridad). Metodología: Premium Frontend Director (perfil Core, ambición Refined) aplicada por Develop. Modelos y esfuerzos efectivos: no observables; configurados según docs/AGENT_WORKFLOW.md.

## Decisiones humanas registradas
DH-04, DH-05 y DH-06 ratificadas según las propuestas de docs/BUSINESS_RULES.md (anotación añadida bajo la tabla). Se implementan en las fases funcionales; DH-06 requiere una tarea crítica con PRE para adaptar el trigger de congelación.

## Flujo real
1. Orchestrator: criterios C1–C9 y lista cerrada de rutas → Develop.
2. Develop: dirección A "Plano técnico" (lienzo gris frío, lateral tinta #0F1B2D, acento teal #0B6E6E, fuentes del sistema, solo tema claro), elegida frente a B "Papel de taller" y C "Consola nocturna". Detalle en [docs/design.md](../../design.md).
3. Testing POST: **PASS** con F1 (Low, retardo del anillo de foco), F2 (Informational, posible doble anuncio del error) y F3 (Informational, LiveRegion y Dialog sin pruebas propias). [TASK-008A-POST](TASK-008A-POST.md).
4. Develop corrigió F1 y F2. Testing RETEST: **PASS**. [TASK-008A-RETEST](TASK-008A-RETEST.md). F3 queda abierto como observación.

## Entregado
- docs/design.md: tres direcciones, selección argumentada, tokens (color con contraste calculado, tipografía, espaciado, radios, elevación, estados, movimiento) y guía de componentes.
- Tokens en src/app/globals.css; focus-visible; prefers-reduced-motion.
- Shell: src/components/shell/ (AppShell, ShellFrame, NavList, BrandMark). Sidebar fija en escritorio y desplegable en móvil (aria-expanded, Escape, retorno de foco), enlace de salto al contenido. Navegación centralizada en src/features/navigation/items.ts: Clientes, Técnicos y Órdenes aparecen como "Próximamente", sin enlazar a rutas que no existen.
- Componentes en src/components/ui/: Button, Field, Badge, Table, Dialog (nativo), EmptyState, Spinner/Skeleton, Alert, LiveRegion.
- /login, /dashboard y / rediseñados. La lógica de autenticación, la sesión, el proxy, RLS, package.json y el lockfile no cambiaron. El dashboard solo muestra estados vacíos honestos, sin métricas.

## Comprobación Git (manifiestos de hashes fuera del repositorio)
SHA y rama sin cambios en todas las delegaciones; sin staging. Los únicos ignorados sensibles son `.claude/settings.local.json` y `.env.local`, igual que en la línea base. Todas las rutas que cambiaron están dentro de la lista permitida:
- Develop: docs/design.md, src/app/**, src/components/**, src/features/auth/LogoutButton.tsx (solo presentación), src/features/navigation/items.ts.
- Testing: tests/unit/independent/app-shell-a11y.test.tsx, tests/e2e/independent/login-layout.spec.ts y sus informes.
- Orchestrator: docs/BUSINESS_RULES.md, docs/STATUS.md y este registro.

## Resultados (RETEST, local)
lint 0 · typecheck 0 · build 0 · test:unit 173 · test:e2e 12. En el POST también estaban en verde format:check y test:integration (151). test:e2e:supabase no se ejecutó en local: solo corre en CI.

## Limitaciones
- Capturas de / y /login a 375, 768 y 1280 px, y del foco, fuera del repositorio (scratchpad de la sesión, no persistente).
- /dashboard no se inspeccionó visualmente porque hace falta una sesión real y no se usan credenciales de Cloud. El shell se validó en jsdom; el menú móvil no se ha visto en un navegador real.
- Los E2E con Auth real están pendientes de CI sobre un SHA que incluya estos cambios.
- Solo tema claro, documentado en design.md.

## Decisiones humanas de cierre (2026-11-24)
- F3 (Dialog y LiveRegion sin pruebas propias): aceptado provisionalmente. Se probarán cuando se usen en funcionalidades reales.
- Limitación de inspección visual del dashboard autenticado: se mantiene registrada y abierta.
- Commit autorizado, junto con DH-04/05/06 y los registros pendientes de TASK-007. Antes del commit se revisó que no hubiera secretos, capturas ni artefactos generados. Las rutas locales absolutas de TASK-008A-POST y TASK-008A-RETEST se sustituyeron por `<scratchpad de la sesión>` sin cambiar el contenido. Premium Frontend Director tiene una única copia en `.claude/skills/premium-frontend-director/`, fijada por commit en `skills-lock.json`, sin rutas locales.
