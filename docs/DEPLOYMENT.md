# Despliegue y entrega

Procedimiento para el responsable de la prueba técnica. La URL y el resultado de la validación se registrarán en [STATUS.md](STATUS.md) tras ejecutar estos pasos.

## Requisitos previos

- Integra la documentación cuando corresponda y confirma que `main` apunta al SHA de entrega aprobado, con CI en verde. Usa GitHub Actions para comprobarlo por SHA. La importación desde GitHub despliega la rama de producción, así que verifica el SHA antes de pulsar **Deploy**.
- Usa un equipo personal de **Vercel Hobby** si la prueba tiene un uso personal no comercial. GitHub confirma que `AVL05/nexovantis` es privado y pertenece a la cuenta personal `AVL05`. Conecta esa identidad en **Account Settings → Login Connections** y comprueba que el autor del commit desplegado se atribuye al propietario del equipo Hobby. La integración admite este tipo de repositorio privado y restringe las organizaciones de Git y la colaboración en repos privados. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Integración Git](https://vercel.com/docs/git).
- Usa el proyecto de **Supabase Free** con datos ficticios descrito en [SUPABASE_CLOUD.md](SUPABASE_CLOUD.md). El último registro documenta 14/14 migraciones alineadas y seeds cargados. Comprueba en el panel que el proyecto está activo, sigue en Free y tiene margen de uso. Free incluye 500 MB de base de datos por proyecto y 50 000 usuarios activos mensuales. Los proyectos de baja actividad pueden pausarse tras una semana. Comprueba la actividad del proyecto antes de la evaluación. [Cuotas de Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Pausa por inactividad](https://supabase.com/docs/guides/platform/free-project-pausing).

## Supabase Auth y datos demo

1. En **Authentication → Sign In / Providers**, mantén habilitado el proveedor **Email** para el ingreso con correo y contraseña. Confirma que **Allow new users to sign up** y **Allow anonymous sign-ins** están desactivados. El cierre del registro público consta como acción humana previa. Comprueba el ajuste efectivo antes de compartir la URL. [Configuración general de Supabase Auth](https://supabase.com/docs/guides/auth/general-configuration).
2. Reutiliza las cuentas confirmadas que ya tengan una membresía en el proyecto demo. Si falta una cuenta y el responsable autoriza el alta, usa **Authentication → Users → Add user → Create new user** con **Auto Confirm User** y una contraseña única. Crea exactamente una fila en `public.memberships` para ese `user_id`, con la organización de demostración y el rol requerido según el [ADR-001](adr/ADR-001-roles-rls.md). Usa `member` para el recorrido ordinario y reserva `owner` para los escenarios que requieran ese rol. El login directo de una cuenta confirmada funciona sin envío de correo, OAuth ni callback.
3. En un entorno nuevo autorizado, aplica las migraciones en orden y carga `demo-crm.sql`, `demo-orders.sql`, `demo-quotes.sql` y `demo-inventory.sql` siguiendo [SEED.md](SEED.md). El proyecto Cloud existente tiene esos datos documentados. Usa una organización de prueba con datos ficticios para cambios durante la verificación.
4. Cuando conozcas el dominio estable, comprueba **Authentication → URL Configuration → Site URL** y ajústalo a `https://<dominio-de-producción>` si procede. `signInWithPassword` usa la redirección interna de Nexovantis y no necesita una entrada en **Redirect URLs**. [Configuración de URLs en Supabase](https://supabase.com/docs/guides/auth/redirect-urls).

## Configuración en Vercel

1. En el equipo personal, elige **Add New → Project → Import Git Repository** e importa `AVL05/nexovantis`. Selecciona **Next.js** y conserva la raíz del repositorio y **Output Directory** por defecto.
2. Usa **Node.js 24.x**. El requisito `engines.node` actual permite esa versión. Configura estos overrides para fijar el pnpm del repositorio incluso si la detección automática elige otro a partir del lockfile.

   | Ajuste | Valor |
   | --- | --- |
   | **Install Command** | `npx --yes pnpm@12.16.1 install --frozen-lockfile` |
   | **Build Command** | `npx --yes pnpm@12.16.1 run build` |

   [Versiones de Node.js](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) · [Configuración del build](https://vercel.com/docs/builds/configure-a-build).
3. En **Environment Variables**, agrega las dos variables al entorno **Production** antes del build. Si el importador las aplica a más entornos, revisa su alcance en **Settings → Environment Variables**. Las pruebas usan el stack local. Cualquier preview conectado a datos debe usar un Supabase de prueba independiente.

   | Variable | Origen |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | URL HTTPS de la API del proyecto Supabase demo, desde **Connect**. |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del mismo proyecto, desde **Settings → API Keys**. |

   Las variables `NEXT_PUBLIC_*` se incorporan al build. Cualquier cambio exige un nuevo despliegue. Mantén fuera de Vercel las claves secretas o `service_role`, la contraseña de PostgreSQL, credenciales demo y variables administrativas del CI. [Variables en Vercel](https://vercel.com/docs/environment-variables) · [Claves de Supabase](https://supabase.com/docs/guides/api/api-keys).
4. Pulsa **Deploy** y comprueba **Deployments**. El deployment de **Production** debe quedar en **Ready** y mostrar el SHA aprobado. En **Settings → Environments → Production → Branch Tracking**, confirma `main`. Comprueba en el log la versión de Node, la instalación fijada y el build sin volcar variables. [Environments](https://vercel.com/docs/deployments/environments).
5. En **Settings → Domains**, copia el dominio estable asignado a **Production**. En **Settings → Deployment Protection**, comprueba que el dominio de producción queda público. **Vercel Authentication → Standard Protection** en Hobby permite visitar ese dominio y protege las URLs generadas de deployment y preview. [Deployment Protection](https://vercel.com/docs/deployment-protection).

## Verificación de la URL pública

1. En incógnito, sin sesión de Vercel ni cookies de Nexovantis, abre `/` y `/login` por HTTPS en el dominio estable. Deben verse la portada y el formulario propios de Nexovantis. Abre `/dashboard` y una ruta de negocio, por ejemplo `/orders`. Ambas deben redirigir a `/login`.
2. Inicia sesión con una cuenta demo autorizada. Comprueba organización y rol, carga de datos de ejemplo, búsqueda por cliente en órdenes y presupuestos, y acceso a los módulos. Ejecuta el recorrido P0 del [producto](PRODUCT_REQUIREMENTS.md) con datos ficticios si hay autorización de escritura. Si solo se autoriza lectura, registra el recorrido de escritura como pendiente.
3. Cierra sesión y vuelve a abrir `/dashboard`. Repite el acceso con la segunda cuenta demo y comprueba que ve sus propios datos.
4. Ejecuta Lighthouse en producción para la portada y el login y registra URL, dispositivo, herramienta y resultado observado. Revisa teclado, foco y comportamiento móvil en el recorrido demo. [Directrices de testing](TESTING_GUIDELINES.md) · [Decisiones de F7](reviews/claude/TASK-014.md).
5. Registra dominio, SHA, fecha, entorno y resultados. Comparte con el evaluador, por el canal privado, la URL de producción, el acceso al repositorio, las credenciales demo y las cuatro respuestas del formulario. Si se cambia la visibilidad del repositorio, revisa el diff y vuelve a escanear el árbol y el historial que se va a publicar. [Contrato de entrega](CHALLENGE.md).
