'use client';

import { ErrorState } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export default function QuotesError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <ErrorState
      title="No se pudieron cargar los presupuestos"
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
