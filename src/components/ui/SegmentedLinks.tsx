import Link from 'next/link';

import { cn } from './cn';

export type SegmentedItem = { label: string; href: string; current: boolean };

/** Filtro de una sola opción por enlaces; la opción activa se indica con aria-current y estilo. */
export function SegmentedLinks({
  label,
  items,
}: Readonly<{ label: string; items: readonly SegmentedItem[] }>) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          aria-current={item.current ? 'true' : undefined}
          className={cn(
            'inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium whitespace-nowrap',
            item.current
              ? 'border-accent bg-accent text-white'
              : 'border-line-strong bg-surface text-ink hover:bg-sunken',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
