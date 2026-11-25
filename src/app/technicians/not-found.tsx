import { EmptyState } from '@/components/ui/EmptyState';
import { LinkButton } from '@/components/ui/LinkButton';

export default function TechnicianNotFound() {
  return (
    <EmptyState
      headingLevel="h2"
      title="Técnico no encontrado"
      action={
        <LinkButton href="/technicians" variant="secondary">
          Volver a técnicos
        </LinkButton>
      }
    >
      El técnico no existe o no está disponible para tu organización.
    </EmptyState>
  );
}
