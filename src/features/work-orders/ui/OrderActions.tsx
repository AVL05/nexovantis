'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { focusLost, submitKeepingValues } from '@/components/ui/forms';
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

  const [reason, setReason] = useState('');

  const assignFormRef = useRef<HTMLFormElement>(null);

  // Asignar y avanzar reciben la Server Action sin envoltorio: así el `<form>` se envía por POST
  // también sin JavaScript.
  const [assignState, assignForm, assigning] = useActionState(assignAction, IDLE);
  const [advanceState, advanceForm, advancing] = useActionState(advanceAction, IDLE);
  const [cancelState, cancelForm, cancelling] = useActionState(
    async (prev: OrderActionState, formData: FormData) => {
      const next = await cancelAction(prev, formData);
      // Solo el éxito cierra el diálogo: ante un fallo se conservan el motivo y el contexto.
      if (next.status === 'success') setCancelOpen(false);
      return { ...next }; // identidad nueva: distingue este resultado de uno ya descartado
    },
    IDLE,
  );
  // Resultado de cancelación que el usuario ya cerró (o que había al abrir el diálogo).
  const [dismissed, setDismissed] = useState<OrderActionState | null>(null);
  const cancelError =
    !cancelling && cancelState.status === 'error' && cancelState !== dismissed ? cancelState : null;

  const openCancel = () => {
    setDismissed(cancelState);
    setCancelOpen(true);
  };
  // Cerrar durante el envío descarta solo lo anterior: el fallo que llegue se verá en la página.
  const closeCancel = () => {
    setDismissed(cancelState);
    setCancelOpen(false);
  };

  const busy = assigning || advancing || cancelling;
  // Última acción con resultado: es la que se muestra y anuncia (no una anterior). Sin JavaScript
  // la página llega ya con un único resultado.
  const [tracked, setTracked] = useState({
    assignState,
    advanceState,
    cancelState,
    last: null as OrderActionState | null,
  });
  if (
    tracked.assignState !== assignState ||
    tracked.advanceState !== advanceState ||
    tracked.cancelState !== cancelState
  ) {
    const last =
      tracked.assignState !== assignState
        ? assignState
        : tracked.advanceState !== advanceState
          ? advanceState
          : cancelState;
    setTracked({ assignState, advanceState, cancelState, last });
  }
  const latest =
    tracked.last ??
    [cancelState, advanceState, assignState].find((s) => s.status !== 'idle') ??
    IDLE;
  // Solo se muestra el resultado de la última acción. Con el diálogo abierto, el fallo de
  // cancelación va dentro y no se repite detrás; una vez cerrado y visto, no reaparece.
  const error =
    latest === cancelState
      ? cancelOpen
        ? null
        : cancelError
      : latest.status === 'error'
        ? latest
        : null;
  const success = latest.status === 'success' ? latest : undefined;
  const closed =
    !allowed.assign && !allowed.reassign && !allowed.start && !allowed.complete && !allowed.cancel;
  // La orden se cerró desde aquí: el botón usado desaparece y el foco pasa al aviso.
  const closedHere =
    closed && (advanceState.status === 'success' || cancelState.status === 'success');

  const dialogErrorRef = useRef<HTMLDivElement>(null);
  const pageErrorRef = useRef<HTMLDivElement>(null);
  const closedRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Asignar, reasignar, iniciar y completar deshabilitan o retiran el botón usado: al terminar, el
  // foco va al error o al título de la sección.
  // El técnico elegido se conserva si falla; el formulario se limpia solo en éxito.
  useEffect(() => {
    if (assignState.status === 'success') assignFormRef.current?.reset();
  }, [assignState]);
  useEffect(() => {
    if (assignState.status === 'idle' || !focusLost()) return;
    (assignState.status === 'error' ? pageErrorRef : headingRef).current?.focus();
  }, [assignState]);
  useEffect(() => {
    if (advanceState.status === 'idle' || !focusLost()) return;
    (advanceState.status === 'error' ? pageErrorRef : headingRef).current?.focus();
  }, [advanceState]);

  // El envío deshabilita los botones y el foco se pierde: se lleva al error.
  useEffect(() => {
    if (!cancelError) return;
    if (cancelOpen) dialogErrorRef.current?.focus();
    else if (document.activeElement === document.body) pageErrorRef.current?.focus();
  }, [cancelError, cancelOpen]);

  useEffect(() => {
    if (closedHere) closedRef.current?.focus();
  }, [closedHere]);

  // La región de avisos se mantiene montada también cuando la orden queda cerrada.
  const announcement = <LiveRegion>{success?.message}</LiveRegion>;

  if (closed) {
    return (
      <>
        {announcement}
        <div ref={closedRef} tabIndex={-1}>
          <Alert tone="info" title="Orden cerrada">
            Una orden completada o cancelada es de solo lectura.
          </Alert>
        </div>
      </>
    );
  }

  const candidates = technicians.filter((t) => t.id !== technicianId);

  return (
    <>
      {announcement}
      <section aria-labelledby="acciones" className="flex flex-col gap-4">
        <h2 id="acciones" ref={headingRef} tabIndex={-1} className="text-base font-semibold">
          Acciones
        </h2>
        {error ? (
          <div ref={pageErrorRef} tabIndex={-1}>
            <Alert tone="danger">{error.message}</Alert>
          </div>
        ) : null}

        {allowed.assign || allowed.reassign ? (
          candidates.length > 0 ? (
            <form
              ref={assignFormRef}
              action={assignForm}
              onSubmit={submitKeepingValues(assignForm)}
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
            <Button variant="danger" onClick={openCancel} disabled={busy}>
              Cancelar orden
            </Button>
          ) : null}
        </div>

        <Dialog
          open={cancelOpen}
          onClose={closeCancel}
          title="Cancelar orden"
          footer={
            <>
              <Button variant="secondary" onClick={closeCancel} disabled={cancelling}>
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
            {cancelOpen && cancelError ? (
              <div ref={dialogErrorRef} tabIndex={-1}>
                <Alert tone="danger">{cancelError.message}</Alert>
              </div>
            ) : null}
            <p>
              La orden pasará a cancelada y quedará de solo lectura. Esta acción no se puede
              deshacer.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${cancelFormId}-reason`}>Motivo (opcional)</Label>
              <textarea
                id={`${cancelFormId}-reason`}
                name="reason"
                rows={3}
                maxLength={ORDER_LIMITS.reason}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={`${inputClass} h-auto min-h-20 py-2`}
              />
            </div>
          </form>
        </Dialog>
      </section>
    </>
  );
}
