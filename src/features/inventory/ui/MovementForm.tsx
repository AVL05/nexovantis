'use client';

import { useActionState, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, FieldError, Label, inputClass } from '@/components/ui/Field';
import { LiveRegion } from '@/components/ui/LiveRegion';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/records/format';

import type { MovementActionState } from '../actions';
import {
  INVENTORY_LIMITS,
  KIND_LABEL,
  MOVEMENT_KINDS,
  ORDER_STATUS_LABEL,
  type MovementKind,
} from '../constants';

type Action = (prev: MovementActionState, formData: FormData) => Promise<MovementActionState>;
type OrderOption = { id: string; title: string; status: string; scheduledDate: string };

const IDLE: MovementActionState = { status: 'idle' };

/**
 * Registro de entradas, salidas y consumos. `requestId` es la clave de idempotencia del envío
 * (INV-5): un doble clic o un reintento devuelve el movimiento original en vez de duplicarlo; tras un
 * registro correcto la página se refresca con una clave nueva. El consumo exige una orden abierta
 * (INV-6). PostgreSQL vuelve a comprobar saldo, estado del artículo y orden: aquí solo se ayuda.
 */
export function MovementForm({
  itemId,
  unit,
  requestId,
  orders,
  action,
}: Readonly<{
  itemId: string;
  unit: string;
  requestId: string;
  orders: readonly OrderOption[];
  action: Action;
}>) {
  const [kind, setKind] = useState<MovementKind>('in');
  const formRef = useRef<HTMLFormElement>(null);
  // Tras un registro correcto se limpian los campos para el siguiente movimiento.
  const [state, formAction, pending] = useActionState(
    async (prev: MovementActionState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.status === 'success') {
        formRef.current?.reset();
        setKind('in');
      }
      return next;
    },
    IDLE,
  );
  const errors = state.fieldErrors ?? {};

  const consumption = kind === 'consumption';

  return (
    <section aria-labelledby="movimiento" className="flex flex-col gap-3">
      <h2 id="movimiento" className="text-base font-semibold">
        Registrar movimiento
      </h2>
      <form
        ref={formRef}
        action={formAction}
        aria-label="Registrar movimiento"
        className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
      >
        <input type="hidden" name="request_id" value={requestId} />
        <input type="hidden" name="item_id" value={itemId} />
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" data-testid="movement-error">
            {state.message}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de movimiento"
            name="kind"
            required
            value={kind}
            onChange={(event) => setKind(event.target.value as MovementKind)}
            options={MOVEMENT_KINDS.map((value) => ({ value, label: KIND_LABEL[value] }))}
          />
          <Field
            label={`Cantidad (${unit})`}
            name="quantity"
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={INVENTORY_LIMITS.maxMovement}
            step={1}
            autoComplete="off"
            error={errors.quantity}
          />
        </div>

        {consumption ? (
          orders.length > 0 ? (
            <Select
              label="Orden de servicio"
              name="order_id"
              required
              placeholder="Selecciona una orden"
              defaultValue=""
              error={errors.order_id}
              hint="Solo órdenes pendientes, asignadas o en curso."
              options={orders.map((order) => ({
                value: order.id,
                label: `${order.title} · ${ORDER_STATUS_LABEL[order.status] ?? order.status} · ${formatDate(order.scheduledDate)}`,
              }))}
            />
          ) : (
            <Alert tone="warning" title="No hay órdenes abiertas">
              Un consumo se imputa a una orden pendiente, asignada o en curso. Crea o reabre el
              trabajo en Órdenes antes de registrar el consumo.
            </Alert>
          )
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="movement-note">Nota (opcional)</Label>
          <textarea
            id="movement-note"
            name="note"
            rows={2}
            maxLength={INVENTORY_LIMITS.note}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? 'movement-note-error' : undefined}
            className={`${inputClass} h-auto min-h-16 py-2`}
          />
          {errors.note ? <FieldError id="movement-note-error">{errors.note}</FieldError> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} disabled={consumption && orders.length === 0}>
            {pending ? 'Registrando…' : 'Registrar movimiento'}
          </Button>
          <p className="text-sm text-ink-muted">
            Los movimientos no se editan ni se borran: para corregir, registra el contrario.
          </p>
        </div>
      </form>
      <LiveRegion>{state.status === 'success' ? state.message : null}</LiveRegion>
    </section>
  );
}
