const FORMATTER = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

/** Fecha y hora en es-ES (zona Europe/Madrid, determinista entre servidor y navegador). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : FORMATTER.format(date);
}
