// Tipos puros (sin imports de servidor) compartidos por Clientes y Técnicos.

/** Configuración de un módulo de registros de personas (cliente, técnico). Solo datos. */
export type RecordModule = {
  /** Ruta base del módulo, p. ej. "/customers". */
  basePath: string;
  /** Clave de navegación (src/features/navigation/items.ts). */
  navKey: string;
  /** Texto en español: "cliente", "clientes". Ambos módulos son de género masculino. */
  singular: string;
  plural: string;
  /** Nombre del campo del formulario y de la columna que contiene el nombre. */
  nameField: 'name' | 'full_name';
  nameLabel: string;
  nameMaxLength: number;
  emailMaxLength: number;
  phoneMaxLength: number;
  notesMaxLength: number;
};

/** Vista normalizada de un cliente o técnico (el nombre siempre en `name`). */
export type RecordView = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Estado de un formulario de alta/edición (useActionState). */
export type FormState = {
  status: 'idle' | 'error';
  message?: string;
  /** Mensaje por campo del formulario. */
  fieldErrors?: Record<string, string>;
  /** Valores enviados, para conservarlos tras un error. */
  values?: Record<string, string>;
};

/** Estado de archivar/restaurar (useActionState). */
export type ArchiveState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

export const IDLE_FORM: FormState = { status: 'idle' };
export const IDLE_ARCHIVE: ArchiveState = { status: 'idle' };

export type ListResult = {
  items: RecordView[];
  total: number;
  /** Página efectiva (ya acotada al rango válido). */
  page: number;
  pageCount: number;
};
