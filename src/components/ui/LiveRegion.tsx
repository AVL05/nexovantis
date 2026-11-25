import type { ReactNode } from 'react';

/**
 * Región `aria-live` persistente para avisos breves (toast mínimo): renderízala siempre y
 * cambia su contenido para que los lectores de pantalla lo anuncien. No gestiona temporizadores.
 */
export function LiveRegion({
  children,
  assertive = false,
}: Readonly<{ children?: ReactNode; assertive?: boolean }>) {
  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="fixed right-4 bottom-4 z-50 max-w-sm empty:hidden"
    >
      {children ? (
        <div className="rounded-md bg-nav px-4 py-3 text-sm text-white shadow-pop">{children}</div>
      ) : null}
    </div>
  );
}
