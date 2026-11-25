import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';

export default function InventoryNotFound() {
  return (
    <EmptyState
      headingLevel="h2"
      title="Artículo no encontrado"
      action={
        <LinkButton href="/inventory" variant="secondary">
          Volver a inventario
        </LinkButton>
      }
    >
      El artículo no existe o no está disponible para tu organización.
    </EmptyState>
  );
}
