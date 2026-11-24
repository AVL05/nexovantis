/**
 * Extrae solo los campos esperados de un FormData. React añade claves internas ($ACTION_*) y un
 * atacante puede añadir otras (p. ej. organization_id): todo lo que no está en la lista se ignora.
 * Los campos ausentes o que no son texto se devuelven como cadena vacía.
 */
export function pickFields(formData: FormData, keys: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    result[key] = typeof value === 'string' ? value : '';
  }
  return result;
}
