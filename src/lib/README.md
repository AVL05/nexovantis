# lib

Utilidades transversales y clientes de servicios externos.

- `env.ts`: validación de variables de entorno con Zod, bajo demanda.
- `supabase/`: cliente de navegador (`client.ts`), cliente de servidor (`server.ts`, uno por solicitud, con las cookies de sesión) y tipos de base de datos escritos a mano (`database.types.ts`). Solo usan la clave publicable.
- El refresco de sesión y la protección de rutas viven en `src/proxy.ts` (Next.js 16), que aplica cookies y cabeceras anti-caché de `setAll` (POST-07). Las cabeceras de `setAll` no se pueden fijar desde `cookies()` en `server.ts`.

Ver [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
