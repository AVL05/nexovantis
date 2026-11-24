import type { ReactNode, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from './cn';

/** Contenedor con scroll horizontal propio (región enfocable por teclado) y caption obligatorio. */
export function Table({
  caption,
  children,
  className,
  ...rest
}: Omit<TableHTMLAttributes<HTMLTableElement>, 'children'> & {
  caption: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-lg border border-line bg-surface"
    >
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...rest}>
        <caption className="px-4 py-3 text-left text-sm font-semibold text-ink">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, scope = 'col', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-y border-line bg-sunken px-4 py-2 text-xs font-semibold tracking-wide text-ink-muted uppercase',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-4 py-2.5 text-ink', className)} {...rest} />;
}
