import Link from 'next/link';

import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Td, Th } from '@/components/ui/Table';
import { formatDateTime } from '@/lib/records/format';

import { KIND_LABEL, formatQuantity, type MovementKind } from '../constants';
import type { MovementView } from '../service';

const ACTOR_LABEL = {
  self: 'Tú',
  member: 'Miembro de la organización',
  former: 'Antiguo miembro de la organización',
} as const;

const KIND_TONE: Record<MovementKind, BadgeTone> = {
  in: 'success',
  out: 'neutral',
  consumption: 'info',
};

const SIGN: Record<MovementKind, string> = { in: '+', out: '−', consumption: '−' };

function Detail({ movement }: Readonly<{ movement: MovementView }>) {
  return (
    <>
      {movement.orderId ? (
        <Link
          href={`/orders/${movement.orderId}`}
          className="font-medium text-accent [overflow-wrap:anywhere] hover:underline"
        >
          {movement.orderTitle ?? 'Orden de servicio'}
        </Link>
      ) : null}
      {movement.note ? (
        <span className="block text-ink-muted [overflow-wrap:anywhere]">{movement.note}</span>
      ) : null}
      {!movement.orderId && !movement.note ? <span className="text-ink-muted">—</span> : null}
    </>
  );
}

/**
 * Historial de movimientos (más reciente primero): tabla desde 1024 px y tarjetas en móvil. Cada fila
 * conserva cantidad, saldo anterior y posterior, orden vinculada, nota y actor. Sin acciones: no hay
 * anulaciones ni borrados (INV-4).
 */
export function MovementHistory({
  items,
  unit,
}: Readonly<{ items: readonly MovementView[]; unit: string }>) {
  if (items.length === 0) {
    return (
      <EmptyState title="Sin movimientos todavía" headingLevel="h3">
        Registra una entrada para fijar la existencia inicial de este artículo.
      </EmptyState>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table caption="Historial de movimientos">
          <thead>
            <tr>
              <Th className="w-px whitespace-nowrap">Fecha</Th>
              <Th className="w-px whitespace-nowrap">Tipo</Th>
              <Th className="w-px text-right whitespace-nowrap">Cantidad</Th>
              <Th className="w-px text-right whitespace-nowrap">Saldo</Th>
              <Th>Orden y nota</Th>
              <Th className="w-px whitespace-nowrap">Quién</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((movement) => (
              <tr key={movement.id}>
                <Td className="whitespace-nowrap">
                  <time dateTime={movement.createdAt}>{formatDateTime(movement.createdAt)}</time>
                </Td>
                <Td className="whitespace-nowrap">
                  <Badge tone={KIND_TONE[movement.kind]}>{KIND_LABEL[movement.kind]}</Badge>
                </Td>
                <Td className="text-right font-semibold whitespace-nowrap tabular-nums">
                  {SIGN[movement.kind]}
                  {formatQuantity(movement.quantity)} {unit}
                </Td>
                <Td className="text-right whitespace-nowrap text-ink-muted tabular-nums">
                  {formatQuantity(movement.balanceBefore)} → {formatQuantity(movement.balanceAfter)}
                </Td>
                <Td className="max-w-0 min-w-48">
                  <Detail movement={movement} />
                </Td>
                <Td className="whitespace-nowrap">{ACTOR_LABEL[movement.actor]}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ol aria-label="Historial de movimientos" className="flex flex-col gap-3 lg:hidden">
        {items.map((movement) => (
          <li
            key={movement.id}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4 text-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <Badge tone={KIND_TONE[movement.kind]}>{KIND_LABEL[movement.kind]}</Badge>
              <span className="font-semibold tabular-nums">
                {SIGN[movement.kind]}
                {formatQuantity(movement.quantity)} {unit}
              </span>
            </div>
            <span className="text-ink-muted tabular-nums">
              Saldo {formatQuantity(movement.balanceBefore)} →{' '}
              {formatQuantity(movement.balanceAfter)}
            </span>
            <div>
              <Detail movement={movement} />
            </div>
            <span className="text-ink-muted">
              <time dateTime={movement.createdAt}>{formatDateTime(movement.createdAt)}</time> ·{' '}
              {ACTOR_LABEL[movement.actor]}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
