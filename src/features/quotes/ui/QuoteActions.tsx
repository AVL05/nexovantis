'use client';

import { useActionState, useId, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { LiveRegion } from '@/components/ui/LiveRegion';

import type { QuoteActionState } from '../actions';
import { availableActions, type QuoteStatus } from '../constants';
import { formatCents } from '../money';

type Action = (prev: QuoteActionState, formData: FormData) => Promise<QuoteActionState>;
const IDLE: QuoteActionState = { status: 'idle' };

/**
 * Decisión sobre un borrador: aceptar (genera una orden de servicio) o rechazar, ambas con
 * confirmación. Aceptado y rechazado son terminales y de solo lectura: no se ofrece ninguna acción.
 * PostgreSQL vuelve a comprobarlo siempre; los botones se bloquean mientras se envían.
 */
export function QuoteActions({
  quoteId,
  status,
  totalCents,
  itemCount,
  acceptAction,
  rejectAction,
}: Readonly<{
  quoteId: string;
  status: QuoteStatus;
  totalCents: number;
  /** Conceptos del presupuesto; sin ninguno no se puede aceptar (undefined = no cargados). */
  itemCount?: number;
  acceptAction: Action;
  rejectAction: Action;
}>) {
  const allowed = availableActions(status);
  const acceptFormId = useId();
  const rejectFormId = useId();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const [acceptState, acceptForm, accepting] = useActionState(
    async (prev: QuoteActionState, formData: FormData) => {
      const next = await acceptAction(prev, formData);
      setAcceptOpen(false);
      return next;
    },
    IDLE,
  );
  const [rejectState, rejectForm, rejecting] = useActionState(
    async (prev: QuoteActionState, formData: FormData) => {
      const next = await rejectAction(prev, formData);
      setRejectOpen(false);
      return next;
    },
    IDLE,
  );

  if (!allowed.accept && !allowed.reject) return null;

  const noItems = itemCount === 0;
  const noItemsId = `${acceptFormId}-no-items`;
  const busy = accepting || rejecting;
  const error = [acceptState, rejectState].find((s) => s.status === 'error');
  const success = [acceptState, rejectState].find((s) => s.status === 'success');

  return (
    <section aria-labelledby="decision" className="flex flex-col gap-4">
      <h2 id="decision" className="text-base font-semibold">
        Decisión
      </h2>
      {error ? <Alert tone="danger">{error.message}</Alert> : null}
      <LiveRegion>{success?.message}</LiveRegion>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => setAcceptOpen(true)}
          disabled={busy || noItems}
          aria-describedby={noItems ? noItemsId : undefined}
        >
          Aceptar presupuesto
        </Button>
        <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={busy}>
          Rechazar presupuesto
        </Button>
      </div>
      {noItems ? (
        <p id={noItemsId} className="text-sm text-ink-muted">
          Añade al menos un concepto para poder aceptar el presupuesto.
        </p>
      ) : null}

      <Dialog
        open={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title="Aceptar presupuesto"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAcceptOpen(false)} disabled={accepting}>
              Volver
            </Button>
            <Button type="submit" form={acceptFormId} loading={accepting}>
              Aceptar y crear orden
            </Button>
          </>
        }
      >
        <form id={acceptFormId} action={acceptForm} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={quoteId} />
          <p>
            Se creará una orden de servicio pendiente para este cliente con el título y la
            descripción del presupuesto (importe total {formatCents(totalCents)}). El presupuesto
            quedará aceptado y de solo lectura. Esta acción no se puede deshacer.
          </p>
        </form>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar presupuesto"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)} disabled={rejecting}>
              Volver
            </Button>
            <Button type="submit" form={rejectFormId} variant="danger" loading={rejecting}>
              Rechazar presupuesto
            </Button>
          </>
        }
      >
        <form id={rejectFormId} action={rejectForm} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={quoteId} />
          <p>
            El presupuesto quedará rechazado y de solo lectura; no se creará ninguna orden. Esta
            acción no se puede deshacer.
          </p>
        </form>
      </Dialog>
    </section>
  );
}
