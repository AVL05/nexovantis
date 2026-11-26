import { BrandMark } from '@/components/shell/BrandMark';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-5 px-6 py-12">
      <BrandMark className="size-12" />
      <h1 className="text-4xl font-semibold tracking-tight">Nexovantis</h1>
      <p className="max-w-prose text-lg text-ink-muted">
        Gestión de operaciones y servicios técnicos para pequeñas empresas de mantenimiento,
        instalaciones y reparaciones.
      </p>
      <ul
        aria-label="Funcionalidades"
        className="flex max-w-prose list-disc flex-col gap-1.5 pl-5 text-sm text-ink-muted"
      >
        <li>Clientes y técnicos: alta, edición y archivado de sus fichas.</li>
        <li>Órdenes de servicio: prioridad, fecha programada, técnico asignado y estado.</li>
        <li>Presupuestos con conceptos e IVA; al aceptarlos se genera la orden de servicio.</li>
        <li>Inventario: entradas, salidas, consumos en órdenes y control de stock bajo.</li>
        <li>Panel con indicadores de órdenes y registro de actividad.</li>
      </ul>
    </main>
  );
}
