import type { ButtonHTMLAttributes } from 'react';

import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken active:bg-line',
  ghost: 'text-ink hover:bg-sunken active:bg-line',
  danger: 'bg-danger text-white hover:bg-danger-hover active:bg-danger-hover',
  'danger-outline':
    'border border-danger bg-surface text-danger hover:bg-danger-soft active:bg-danger-soft',
};
const SIZE: Record<ButtonSize, string> = {
  // Compacto solo desde `md`: en móvil conserva un objetivo táctil de 40 px.
  sm: 'h-10 px-3 text-sm md:h-8',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

/** Clases de un botón; las reutiliza LinkButton para enlaces con aspecto de botón. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-55',
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Muestra un indicador y bloquea la interacción; conserva el nombre accesible. */
  loading?: boolean;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : null}
      {children}
    </button>
  );
}
