import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';

export default function CustomerNotFound() {
  return (
    <EmptyState
      headingLevel="h2"
      title="Cliente no encontrado"
      action={
        <LinkButton href="/customers" variant="secondary">
          Volver a clientes
        </LinkButton>
      }
    >
      El cliente no existe o no está disponible para tu organización.
    </EmptyState>
  );
}
