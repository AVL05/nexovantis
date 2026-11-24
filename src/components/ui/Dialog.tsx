'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Button } from './Button';

/**
 * Diálogo modal sobre <dialog> nativo: el navegador gestiona foco, Escape y capa inerte.
 * Es controlado: `open` y `onClose` los decide el padre.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-line bg-surface p-0 text-ink shadow-pop"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <div className="text-sm text-ink-muted">{children}</div>
        <div className="flex justify-end gap-2">
          {footer ?? (
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
