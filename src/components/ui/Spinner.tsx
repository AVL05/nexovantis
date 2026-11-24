import { cn } from './cn';

/** Indicador decorativo; el estado lo comunica el contexto (aria-busy, texto visible). */
export function Spinner({ size = 'md' }: Readonly<{ size?: 'sm' | 'md' }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('nx-spin shrink-0', size === 'sm' ? 'size-4' : 'size-6')}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: Readonly<{ className?: string }>) {
  return <div aria-hidden="true" className={cn('nx-pulse rounded-md bg-line', className)} />;
}
