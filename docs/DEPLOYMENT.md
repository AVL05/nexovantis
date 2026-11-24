# Despliegue (pendiente)

1. Confirmar elegibilidad del uso gratuito de Vercel y Supabase y límites; si no encaja, elegir alternativa gratuita permitida.
2. Configurar proyecto Supabase y entorno de prueba separado; aplicar migraciones y seed según procedimiento validado, sin exponer claves.
3. Configurar variables necesarias en Vercel; no subir .env.local. Construir desde commit aprobado.
4. Confirmar URL de producción estable, no preview. Revisar Settings → Deployment Protection → Vercel Authentication para que producción sea pública.
5. Probar desde incógnito sin sesión de Vercel: acceso público al login, autenticación propia de la app, flujo demo y protección de rutas. Registrar URL, fecha, SHA y resultado sin contraseña.
6. Auditar secretos antes de hacer público el repo. Enviar app, repo, credenciales demo y respuestas a cuatro preguntas solo por el enlace privado de entrega.

Nada de lo anterior está ejecutado aún. Referencia: https://vercel.com/docs/deployment-protection
