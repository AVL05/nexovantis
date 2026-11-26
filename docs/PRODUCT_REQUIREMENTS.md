# Requisitos de producto

Nexovantis es un ERP vertical de servicios técnicos para pequeñas empresas. Idioma español, datos ficticios y experiencia de escritorio y móvil.

## P0 — imprescindible
- AUTH: login demo, logout, rutas protegidas y aislamiento por organización; sin registro público necesario.
- CRM: crear, consultar, editar, buscar y archivar clientes.
- TEAM: crear, consultar, editar, buscar y archivar técnicos; asignar solo técnicos activos de la organización.
- ORDERS: alta con cliente, descripción, fecha, prioridad y técnico; transiciones válidas, historial y persistencia.
- DASH: indicadores calculados desde datos reales, lista de pendientes y navegación funcional.

## P1 — diferenciación, solo tras aprobar P0
- QUOTES: conceptos, cantidades, precios, IVA y totales exactos; aceptar/rechazar; aceptación crea una única orden transaccional.
- STOCK: catálogo, saldo y movimientos; consumo vinculado a orden; impedir saldo negativo y doble aplicación.
- ACTIVITY: trazabilidad de eventos empresariales clave.

## P2 — opcional
PDF, calendario y modo oscuro solo si queda capacidad y se aprueba el alcance.

Flujo demo P0: login → cliente → orden → asignar técnico → iniciar → completar → comprobar historial/dashboard. P1: presupuesto → aceptación → orden → consumo → cierre. No mostrar botones o módulos ficticios.

Fuera de alcance: facturación fiscal, pagos, IA en producción, integraciones externas, email/WhatsApp, multiempresa avanzada y apps nativas. No usar datos personales reales.

## Precisiones de aceptación (aditivas, TASK-002)
No cambian el alcance anterior; solo enlazan TEAM y ACTIVITY con sus criterios de prueba.
- TEAM: la asignación de técnicos se valida en interfaz y en API/RLS (solo activos y de la organización); un técnico archivado conserva su historial. Casos TC-TEAM y TC-ARCH en docs/TESTING_GUIDELINES.md; ejecución en F3.
- ACTIVITY: el conjunto mínimo de eventos y sus actores se ratificaron en F4 y F6. [DH-08 en las reglas de negocio](BUSINESS_RULES.md) · [Casos TC-EVT](TESTING_GUIDELINES.md).
