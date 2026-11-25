# TASK-009 RETEST

- Fase: RETEST dirigido. Rama feat/supabase-auth, HEAD 3617d58, árbol con cambios sin commit (mismo conjunto de rutas que en POST; solo RecordList.tsx cambió según Orchestrator). Modelo: Sonnet 5.5 (autoinformado).
- Escritura: solo este informe. Sin commit/push/dependencias/Cloud.

## Verificación

| Check | Resultado |
|---|---|
| Diff de RecordList.tsx | La celda email pasa a `<Td><span className="block max-w-64 truncate" title={item.email ?? undefined}>`. El teléfono pasa a `whitespace-nowrap`. Las tarjetas móviles usan `[overflow-wrap:anywhere]` y `whitespace-nowrap`; ese cambio ya estaba en el POST. No se puede aislar el diff desde el POST porque el árbol no tiene commit. El resto del estado Git no ha cambiado. |
| pnpm lint | exit 0 |
| pnpm typecheck | exit 0 |
| pnpm test:unit | exit 0, 18 archivos y 260 tests pasados |
| pnpm build | exit 0 |
| pnpm test:e2e | exit 0, 12 pasados |

M2 con Playwright (chromium, CSS compilado real de .next, markup sintético con el span nuevo, email largo `administracion@oficinas-centro-empresarial-cantabrico.example.com`). No es la ruta autenticada.

| Ancho | Scroll de página | Scroll de la tabla | Email | Teléfono |
|---|---|---|---|---|
| 1024, 1280, 1440 | 0 | 0 | El span mide 256 px (scrollWidth 428), con `title` completo y texto completo en el DOM | Una línea (fila de 41 px) |
| 375, 768 | 0 | no aplica (se ven tarjetas) | La tarjeta ajusta sin desbordar | Una línea (20 px) |

El detalle también es correcto en los 5 anchos: el email ocupa 2 líneas, el teléfono 24 px y no hay desbordes.

## Estado de hallazgos

- F-1 (Low): **cerrado**. El tope de 256 px se aplica ahora en 1024, 1280 y 1440.
- F-2 (Informational): **sigue abierto, sin cambios**. No hay prueba versionada de M2, que requiere sesión real. Se sugiere añadir una aserción de overflow en crm.spec.ts en una tarea futura. Requiere aceptación humana registrada.

## Veredicto: PASS

Hallazgos Critical/High: ninguno.
