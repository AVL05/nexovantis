import { useId, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode } from 'react';

import { cn } from './cn';

export type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: ReactNode;
  /** Texto de ayuda enlazado con aria-describedby. */
  hint?: ReactNode;
  /** Mensaje de error; marca el campo con aria-invalid. */
  error?: ReactNode;
  id?: string;
};

export function Label({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-ink', className)} {...rest} />;
}

export function FieldError({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  return (
    <p id={id} className="text-sm font-medium text-danger">
      {children}
    </p>
  );
}

export const inputClass =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-70 aria-invalid:border-2 aria-invalid:border-danger sm:text-sm';

/** Label + Input + ayuda + error con asociaciones ARIA correctas. */
export function Field({ label, hint, error, id, className, ...input }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(inputClass, className)}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
