import { startTransition, useEffect, useRef, type FormEvent } from 'react';

/**
 * Envía una acción sin el restablecimiento automático que React 19 aplica a `<form action>`: los
 * valores se conservan si falla y quien llama limpia el formulario solo en éxito. El `<form>`
 * mantiene `action` para funcionar sin JavaScript.
 */
export function submitKeepingValues(dispatch: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };
}

/** El foco no está en ningún control utilizable (p. ej. se deshabilitó o retiró el botón usado). */
export function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active.matches(':disabled');
}

/**
 * Referencia para el mensaje de error de un formulario: tras cada fallo (también repetido) recibe el
 * foco si el envío lo dejó sin control. No lo mueve si el usuario ya está en otro.
 */
export function useFocusOnError(state: Readonly<{ status: string } | { error: string | null }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const failed = 'status' in state ? state.status === 'error' : state.error !== null;
    if (failed && focusLost()) ref.current?.focus();
  }, [state]);
  return ref;
}
