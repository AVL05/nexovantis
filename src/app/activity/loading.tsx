import { Skeleton } from '@/components/ui/Spinner';

export default function ActivityLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando actividad"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
