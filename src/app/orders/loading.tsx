import { Skeleton } from '@/components/ui/Spinner';

export default function OrdersLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando órdenes"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
