# components

Componentes de interfaz compartidos y accesibles, sin lógica de negocio. Identidad y tokens: [docs/design.md](../../docs/design.md). Arquitectura: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## `ui/` (primitivos)

| Componente                     | Notas                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `Button`                       | `variant` primary/secondary/ghost/danger, `size` sm/md/lg, `loading` (deshabilita y muestra `Spinner`). |
| `Field`, `Label`, `FieldError` | `Field` une label + input + ayuda + error con `aria-describedby`/`aria-invalid`.                        |
| `Badge`                        | Tonos neutral/success/warning/danger/info. El significado va en el texto.                               |
| `Table`, `Th`, `Td`            | Scroll horizontal propio, `caption` obligatorio, `scope="col"`.                                         |
| `Dialog`                       | Sobre `<dialog>` nativo, controlado (`open`/`onClose`). Client Component.                               |
| `EmptyState`                   | Estado vacío honesto: explica qué llegará, sin cifras.                                                  |
| `Alert`, `ErrorState`          | `danger` usa `role="alert"`, el resto `role="status"`.                                                  |
| `Spinner`, `Skeleton`          | Decorativos (`aria-hidden`); el estado lo anuncia el contexto.                                          |
| `LiveRegion`                   | Región `aria-live` mínima para avisos (toast sin cola ni temporizadores).                               |
| `cn`                           | Unión de clases sin dependencias.                                                                       |

Importa desde `@/components/ui` (barrel) o por archivo.

## `shell/` (app autenticada)

`AppShell` recibe navegación, contexto de organización/rol y acciones ya resueltos por el servidor. La navegación vive en `src/features/navigation/items.ts`: un módulo con `href: null` se muestra como "Próximamente" sin enlace. `data-testid` `org-name` y `user-role` se emiten solo desde `AppShell` (una vez por página).
