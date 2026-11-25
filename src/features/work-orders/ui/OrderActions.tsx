'use client';

import { useActionState, useId, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Label, inputClass } from '@/components/ui/Field';
import { LiveRegion } from '@/components/ui/LiveRegion';
import { Select } from '@/components/ui/Select';

import type { OrderActionState } from '../actions';
import { ORDER_LIMITS, type OrderStatus, availableActions } from '../constants';

type Action = (prev: OrderActionState, formData: FormData) => Promise<OrderActionState>;
const IDLE: OrderActionState = { status: 'idle' };

/**
 * Acciones de una orden según su estado (DH-01 reasignar solo en asignada, DH-02 cancelar, DH-03
 * sin saltos, DH-07 terminal de solo lectura). La interfaz solo ofrece lo permitido; PostgreSQL
 * vuelve a comprobarlo siempre. Los botones se bloquean mientras se envían (sin doble envío).
 */
export function OrderActions({
  orderId,
  status,
  technicianId,
  technicians,
  assignAction,
  advanceAction,
  cancelAction,
}: Readonly<{
  orderId: string;
  status: OrderStatus;
  technicianId: string | null;
  technicians: readonly { id: string; name: string }[];
  assignAction: Action;
  advanceAction: Action;
  cancelAction: Action;
}>) {
  const allowed = availableActions(status);
  const cancelFormId = useId();
  const [cancelOpen, setCancelOpen] = useState(false);

  const [assignState, assignForm, assigning] = useActionState(assignAction, IDLE);
  const [advanceState, advanceForm, advancing] = useActionState(advanceAction, IDLE);
  const [cancelState, cancelForm, cancelling] = useActionState(
    async (prev: OrderActionState, formData: FormData) => {
      const next = await cancelAction(prev, formData);
      setCancelOpen(false);
      return next;
    },
    IDLE,
  );

  const busy = assigning || advancing || cancelling;
  const states = [assignState, advanceState, cancelState];
  const error = states.find((s) => s.status === 'error');
  const success = states.find((s) => s.status === 'success');

  if (
    !allowed.assign &&
    !allowed.reassign &&
    !allowed.start &&
    !allowed.complete &&
    !allowed.cancel
  ) {
    return (
      <Alert tone="info" title="Orden cerrada">
        Una orden completada o cancelada es de solo lectura.
      </Alert>
    );
  }

  const candidates = technicians.filter((t) => t.id !== technicianId);

  return (
    <section aria-labelledby="acciones" className="flex flex-col gap-4">
      <h2 id="acciones" className="text-base font-semibold">
        Acciones
      </h2>
      {error ? <Alert tone="danger">{error.message}</Alert> : null}
      <LiveRegion>{success?.message}</LiveRegion>

      {allowed.assign || allowed.reassign ? (
        candidates.length > 0 ? (
          <form
            action={assignForm}
            className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="id" value={orderId} />
            <div className="min-w-0 flex-1">
              <Select
                label={allowed.reassign ? 'Reasignar a' : 'Asignar técnico'}
                name="technician_id"
                required
                placeholder="Selecciona un técnico activo"
                defaultValue=""
                options={candidates.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
            <Button type="submit" variant="secondary" loading={assigning} disabled={busy}>
              {allowed.reassign ? 'Reasignar' : 'Asignar'}
            </Button>
          </form>
        ) : (
          <Alert tone="warning">
            No hay técnicos activos disponibles para {allowed.reassign ? 'reasignar' : 'asignar'}.
          </Alert>
        )
      ) : null}

      <div className="flex flex-wrap gap-3">
        {allowed.start ? (
          <form action={advanceForm}>
            <input type="hidden" name="id" value={orderId} />
            <input type="hidden" name="to" value="in_progress" />
            <Button type="submit" loading={advancing} disabled={busy}>
              Iniciar orden
            </Button>
          </form>
        ) : null}
        {allowed.complete ? (
          <form action={advanceForm}>
            <input type="hidden" name="id" value={orderId} />
            <input type="hidden" name="to" value="completed" />
            <Button type="submit" loading={advancing} disabled={busy}>
              Completar orden
            </Button>
          </form>
        ) : null}
        {allowed.cancel ? (
          <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={busy}>
            Cancelar orden
          </Button>
        ) : null}
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar orden"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Volver
            </Button>
            <Button type="submit" form={cancelFormId} variant="danger" loading={cancelling}>
              Cancelar orden
            </Button>
          </>
        }
      >
        <form id={cancelFormId} action={cancelForm} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={orderId} />
          <p>
            La orden pasará a cancelada y quedará de solo lectura. Esta acción no se puede deshacer.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${cancelFormId}-reason`}>Motivo (opcional)</Label>
            <textarea
              id={`${cancelFormId}-reason`}
              name="reason"
              rows={3}
              maxLength={ORDER_LIMITS.reason}
              className={`${inputClass} h-auto min-h-20 py-2`}
            />
          </div>
        </form>
      </Dialog>
    </section>
  );
}
