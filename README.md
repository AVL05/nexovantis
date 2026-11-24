# Nexovantis

Gestión de operaciones y servicios técnicos para pequeñas empresas de mantenimiento, instalaciones y reparaciones.

**Estado:** fundación del proyecto; aplicación, pruebas y despliegue aún pendientes.

## Producto
El núcleo conecta clientes, técnicos, órdenes de trabajo y un dashboard basado en datos persistentes. Presupuestos, inventario y trazabilidad son ampliaciones condicionadas a la aprobación del núcleo.

## Ingeniería
Next.js App Router, TypeScript, Supabase PostgreSQL/Auth, pnpm y Vercel (plan gratuito sujeto a elegibilidad). Claude Code coordina dos subagentes nativos: Develop y Testing. Codex realiza auditorías independientes, sin implementar producción.

## Documentación
- [Requisitos](docs/PRODUCT_REQUIREMENTS.md) y [contrato de entrega](docs/CHALLENGE.md)
- [Arquitectura](docs/ARCHITECTURE.md) y [reglas de negocio](docs/BUSINESS_RULES.md)
- [Flujo multiagente](docs/AGENT_WORKFLOW.md) y [directrices de testing](docs/TESTING_GUIDELINES.md)
- [Seguridad](docs/SECURITY.md), [roadmap](docs/ROADMAP.md) y [despliegue](docs/DEPLOYMENT.md)

## Agentes
[Orchestrator](CLAUDE.md) · [Develop](.claude/agents/develop.md) · [Testing](.claude/agents/testing.md) · [Codex auditor](AGENTS.md).

No hay todavía instrucciones de ejecución de la aplicación ni URL de producción: se incorporarán al verificar el scaffold y el despliegue. Las evidencias de revisión se registrarán únicamente después de ejecutar las comprobaciones reales. Los datos serán ficticios y las credenciales de evaluación se comunicarán por un canal privado.
