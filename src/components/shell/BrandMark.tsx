import { cn } from '@/components/ui/cn';

/** Logotipo propio: monograma "N" trazado como un recorrido de servicio. Decorativo. */
export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className={cn('size-8 shrink-0', className)}
      focusable="false"
    >
      <rect width="32" height="32" rx="7" fill="#0f1b2d" />
      <path
        d="M9 23V9l14 14V9"
        fill="none"
        stroke="#7fd6d6"
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function BrandName({ onDark = false }: Readonly<{ onDark?: boolean }>) {
  return (
    <span
      className={cn(
        'flex items-center gap-2.5 text-base font-semibold tracking-tight',
        onDark ? 'text-white' : 'text-ink',
      )}
    >
      <BrandMark className={onDark ? 'ring-1 ring-nav-active rounded-[7px]' : undefined} />
      Nexovantis
    </span>
  );
}
