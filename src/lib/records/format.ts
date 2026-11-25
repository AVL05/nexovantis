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

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeZone: 'UTC' });

/** Fecha de calendario (AAAA-MM-DD, sin zona horaria) en es-ES. */
export function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? '—' : DATE_FORMATTER.format(parsed);
}

/** Hoy como AAAA-MM-DD en la zona Europe/Madrid (misma zona que formatDateTime). */
export function todayInMadrid(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
