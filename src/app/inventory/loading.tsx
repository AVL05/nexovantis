import { Skeleton } from '@/components/ui/Spinner';

export default function InventoryLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando inventario"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
