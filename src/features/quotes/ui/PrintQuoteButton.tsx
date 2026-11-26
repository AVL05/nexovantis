'use client';

import { Button } from '@/components/ui/Button';

export function PrintQuoteButton() {
  return <Button onClick={() => window.print()}>Imprimir o guardar PDF</Button>;
}
