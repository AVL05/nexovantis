'use client';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Alert';

export default function TechniciansError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <ErrorState
      title="No se pudieron cargar los técnicos"
      action={
        <div>
          <Button variant="secondary" onClick={reset}>
            Reintentar
          </Button>
        </div>
      }
    >
      Ha ocurrido un problema temporal. Inténtalo de nuevo en unos segundos.
    </ErrorState>
  );
}
