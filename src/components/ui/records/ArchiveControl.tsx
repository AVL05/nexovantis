'use client';

import { useActionState, useId, useState } from 'react';

import { IDLE_ARCHIVE, type ArchiveState, type RecordModule } from '@/lib/records/types';

import { Alert } from '../Alert';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { LiveRegion } from '../LiveRegion';

type ArchiveAction = (prev: ArchiveState, formData: FormData) => Promise<ArchiveState>;

/**
 * Archivar o restaurar con confirmación. El éxito se anuncia en una región aria-live; los
 * errores (ya archivado, no encontrado…) aparecen en una alerta junto al botón.
 */
export function ArchiveControl({
  module,
  recordId,
  recordName,
  archived,
  archiveAction,
  restoreAction,
}: Readonly<{
  module: RecordModule;
  recordId: string;
  recordName: string;
  archived: boolean;
  archiveAction: ArchiveAction;
  restoreAction: ArchiveAction;
}>) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<'archive' | 'restore' | null>(null);

  const [archiveState, archiveForm, archivePending] = useActionState(
    async (prev: ArchiveState, formData: FormData) => {
      const next = await archiveAction(prev, formData);
      setLast('archive');
      setOpen(false);
      return next;
    },
    IDLE_ARCHIVE,
  );
  const [restoreState, restoreForm, restorePending] = useActionState(
    async (prev: ArchiveState, formData: FormData) => {
      const next = await restoreAction(prev, formData);
      setLast('restore');
      setOpen(false);
      return next;
    },
    IDLE_ARCHIVE,
  );

  const state =
    last === 'restore' ? restoreState : last === 'archive' ? archiveState : IDLE_ARCHIVE;
  const pending = archivePending || restorePending;
  const verb = archived ? 'Restaurar' : 'Archivar';

  return (
    <div className="flex flex-col gap-3">
      <Button variant={archived ? 'secondary' : 'danger'} onClick={() => setOpen(true)}>
        {verb} {module.singular}
      </Button>

      {state.status === 'error' ? <Alert tone="danger">{state.message}</Alert> : null}
      <LiveRegion>{state.status === 'success' ? state.message : null}</LiveRegion>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${verb} ${module.singular}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={formId}
              variant={archived ? 'primary' : 'danger'}
              loading={pending}
            >
              {verb}
            </Button>
          </>
        }
      >
        <form id={formId} action={archived ? restoreForm : archiveForm}>
          <input type="hidden" name="id" value={recordId} />
          {archived ? (
            <p>
              {recordName} volverá a aparecer entre los {module.plural} activos y podrá editarse de
              nuevo.
            </p>
          ) : (
            <p>
              {recordName} dejará de aparecer entre los {module.plural} activos y no podrá editarse.
              Podrás restaurarlo desde el filtro Archivados.
            </p>
          )}
        </form>
      </Dialog>
    </div>
  );
}
