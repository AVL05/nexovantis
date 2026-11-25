import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<AlertTone, string> = {
  info: 'border-info bg-info-soft',
  success: 'border-success bg-success-soft',
  warning: 'border-warning bg-warning-soft',
  danger: 'border-danger bg-danger-soft',
};
const ICON_TONE: Record<AlertTone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/** `danger` usa role="alert"; el resto role="status". Acepta atributos como data-testid. */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border-l-4 p-3 text-sm text-ink', TONE[tone], className)}
      {...rest}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={cn('mt-0.5 size-4 shrink-0', ICON_TONE[tone])}
        fill="currentColor"
      >
        <circle cx="10" cy="10" r="9" />
        <path d="M10 5.5v5.5M10 13.5v1.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <div className="flex flex-col gap-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Algo salió mal',
  children,
  action,
}: Readonly<{ title?: string; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="danger" title={title}>
        {children}
      </Alert>
      {action}
    </div>
  );
}
