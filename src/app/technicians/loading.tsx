import { Skeleton } from '@/components/ui/Spinner';

export default function TechniciansLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando técnicos"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
