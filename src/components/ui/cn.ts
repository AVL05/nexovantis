/** Une nombres de clase ignorando valores falsos. */
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
