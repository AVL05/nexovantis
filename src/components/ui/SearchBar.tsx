import Link from 'next/link';

import { Button } from './Button';
import { inputClass, Label } from './Field';

/**
 * Búsqueda por GET (sin JavaScript, URL compartible). `hidden` conserva otros parámetros (p. ej.
 * el filtro de estado); la página se reinicia al buscar.
 */
export function SearchBar({
  action,
  label,
  defaultValue,
  hidden,
  clearHref,
  maxLength = 100,
}: Readonly<{
  action: string;
  label: string;
  defaultValue: string;
  hidden?: Record<string, string>;
  /** Si hay término, enlace para limpiar la búsqueda. */
  clearHref?: string;
  maxLength?: number;
}>) {
  return (
    <form action={action} method="get" role="search" className="flex flex-col gap-1.5">
      <Label htmlFor="busqueda">{label}</Label>
      <div className="flex gap-2">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input
          id="busqueda"
          name="q"
          type="search"
          defaultValue={defaultValue}
          maxLength={maxLength}
          autoComplete="off"
          className={inputClass}
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        {defaultValue && clearHref ? (
          <Link
            href={clearHref}
            className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-accent hover:underline"
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
