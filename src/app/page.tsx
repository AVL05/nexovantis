import { BrandName } from '@/components/shell/BrandMark';
import { Badge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/LinkButton';
import { LOGIN_PATH } from '@/features/auth/routes';

const features = [
  {
    title: 'Clientes y técnicos:',
    description: 'alta, edición y archivado de fichas desde un mismo sitio.',
  },
  {
    title: 'Órdenes de servicio:',
    description: 'planifica visitas, asigna responsables y sigue cada intervención.',
  },
  {
    title: 'Presupuestos con IVA:',
    description: 'desglosa conceptos y genera una orden al aceptar el presupuesto.',
  },
  {
    title: 'Inventario:',
    description: 'registra movimientos y consumos, y detecta artículos con stock bajo.',
  },
  {
    title: 'Panel operativo:',
    description: 'consulta indicadores de órdenes y el registro de actividad.',
  },
];

const exampleOrders = [
  { id: 'OT-0142', title: 'Revisión de climatización', status: 'En curso', tone: 'info' },
  { id: 'OT-0143', title: 'Instalación de luminarias', status: 'Asignada', tone: 'success' },
  {
    id: 'OT-0144',
    title: 'Mantenimiento de cuadro eléctrico',
    status: 'Pendiente',
    tone: 'warning',
  },
] as const;

function PanelPreview() {
  return (
    <figure className="grid min-w-0 items-center overflow-hidden rounded-[1.75rem] bg-nav p-4 sm:p-8 xl:p-10">
      <figcaption className="mb-4 flex items-center gap-2 text-sm font-medium text-nav-text">
        <span aria-hidden="true" className="size-2 rounded-full bg-nav-focus" />
        Panel de ejemplo
      </figcaption>
      <div className="min-w-0 overflow-hidden rounded-2xl bg-surface shadow-pop">
        <div className="border-b border-line px-4 py-4 sm:px-6 sm:py-5">
          <p className="font-semibold tracking-tight sm:text-lg">Órdenes de servicio</p>
          <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="rounded-lg bg-accent-soft p-3">
              <dt className="text-xs font-medium text-accent">Abiertas</dt>
              <dd className="text-2xl font-semibold tracking-tight text-accent tabular-nums">12</dd>
            </div>
            <div className="rounded-lg bg-sunken p-3">
              <dt className="text-xs font-medium text-ink-muted">Completadas</dt>
              <dd className="text-2xl font-semibold tracking-tight tabular-nums">08</dd>
            </div>
          </dl>
        </div>
        <ul aria-label="Órdenes de ejemplo" className="divide-y divide-line">
          {exampleOrders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 sm:px-6"
            >
              <div className="min-w-0">
                <span className="block font-mono text-xs text-ink-subtle">{order.id}</span>
                <span className="block text-sm font-medium">{order.title}</span>
              </div>
              <Badge tone={order.tone}>{order.status}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center px-5 sm:px-8 lg:px-12">
          <BrandName />
        </div>
      </header>
      <main className="mx-auto flex max-w-7xl flex-col gap-10 px-5 pt-7 pb-12 sm:gap-14 sm:px-8 sm:pt-10 lg:px-12">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <section className="flex flex-col justify-center gap-6 rounded-[1.75rem] bg-accent-soft px-6 py-10 sm:p-10 xl:p-12">
            <h1 className="max-w-[13ch] text-[clamp(2.3rem,5vw,4.35rem)] leading-[1.04] font-semibold tracking-[-0.06em] text-balance">
              <span className="sr-only">Nexovantis. </span>
              Gestiona tus trabajos de principio a fin
            </h1>
            <p className="max-w-[43ch] text-base leading-relaxed text-ink-muted sm:text-lg">
              Gestión de operaciones y servicios técnicos para pequeñas empresas de mantenimiento,
              instalaciones y reparaciones.
            </p>
            <LinkButton href={LOGIN_PATH} size="lg" className="w-fit">
              Iniciar sesión <span aria-hidden="true">→</span>
            </LinkButton>
          </section>
          <PanelPreview />
        </div>
        <section aria-labelledby="features-heading" className="flex flex-col gap-4">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Funcionalidades
          </h2>
          <ul
            aria-labelledby="features-heading"
            className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {features.map(({ title, description }) => (
              <li key={title} className="rounded-lg border border-line bg-surface px-5 py-4">
                <p className="text-sm leading-relaxed text-ink-muted">
                  <strong className="font-semibold text-ink">{title}</strong> {description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
