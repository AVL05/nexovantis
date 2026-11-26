import Image from 'next/image';

import { cn } from '@/components/ui/cn';

export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <Image
      src="/brand/nexovantis-mark.webp"
      alt=""
      width={256}
      height={256}
      loading="eager"
      unoptimized
      className={cn('block size-9 shrink-0', className)}
    />
  );
}

export function BrandName({ onDark = false }: Readonly<{ onDark?: boolean }>) {
  return (
    <span
      className={cn(
        'flex items-center gap-2.5 text-lg font-semibold tracking-tight',
        onDark ? 'text-white' : 'text-ink',
      )}
    >
      <BrandMark />
      Nexovantis
    </span>
  );
}
