import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cn } from './cn';
import { FieldError, Label, inputClass } from './Field';

export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> & {
  label: ReactNode;
  options: readonly SelectOption[];
  /** Opción inicial sin valor (p. ej. "Todos"); si se omite no se añade. */
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
};

/** Selector nativo con etiqueta visible, ayuda y error enlazados (aria-describedby). */
export function Select({
  label,
  options,
  placeholder,
  hint,
  error,
  id,
  className,
  ...rest
}: SelectProps) {
  const auto = useId();
  const selectId = id ?? auto;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={selectId}>{label}</Label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(inputClass, 'pr-8', className)}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
