import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';

export default function OrderNotFound() {
  return (
    <EmptyState
      headingLevel="h2"
      title="Orden no encontrada"
      action={
        <LinkButton href="/orders" variant="secondary">
          Volver a órdenes
        </LinkButton>
      }
    >
      La orden no existe o no está disponible para tu organización.
    </EmptyState>
  );
}
