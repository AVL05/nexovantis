# Seguridad

- Secretos en gestor de variables de entorno o .env.local ignorado. .env.example solo nombres/placeholders. Clave publicable de Supabase apta para cliente con RLS correcto; service_role y claves secretas nunca cliente ni repositorio.
- RLS por operación y membresía; no confiar en parámetros del cliente. Validar identidad y autorización en servidor y DB. Evitar acceso cruzado, XSS, fugas en logs y errores detallados.
- Cuenta demo limitada, datos sintéticos, sin permisos de infraestructura. Entregar credenciales por canal privado; no ponerlas en README, commits o informes.
- Separar pruebas de producción. No ejecutar resets, migraciones destructivas o pruebas de escritura contra producción sin autorización explícita.
- Revisar diff, historial Git y archivos antes de hacer público el repo; si se expone un secreto, revocarlo/rotarlo primero y tratar el historial.
- No activar facturación, exponer enlaces privados ni ampliar permisos sin autorización humana. Los permisos de herramientas de agentes no son una frontera de seguridad completa.
