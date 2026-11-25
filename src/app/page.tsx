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
      <p className="text-sm text-ink-subtle">Estado: fundación técnica.</p>
    </main>
  );
}
