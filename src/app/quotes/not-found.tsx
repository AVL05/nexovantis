import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';

export default function QuoteNotFound() {
  return (
    <EmptyState
      headingLevel="h2"
      title="Presupuesto no encontrado"
      action={
        <LinkButton href="/quotes" variant="secondary">
          Volver a presupuestos
        </LinkButton>
      }
    >
      El presupuesto no existe o no está disponible para tu organización.
    </EmptyState>
  );
}
