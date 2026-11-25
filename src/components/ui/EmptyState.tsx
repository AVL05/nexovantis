import type { ReactNode } from 'react';

import { cn } from './cn';

export function EmptyState({
  title,
  children,
  action,
  headingLevel: Heading = 'h3',
  className,
}: Readonly<{
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 'h2' | 'h3' | 'h4';
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong bg-surface p-6',
        className,
      )}
    >
      <Heading className="text-base font-semibold text-ink">{title}</Heading>
      {children ? <p className="max-w-prose text-sm text-ink-muted">{children}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
