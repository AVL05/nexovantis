import { logoutAction } from './actions';

/** Cierre de sesion por Server Action (POST). No existe ninguna ruta GET de logout. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded border border-current px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Cerrar sesión
      </button>
    </form>
  );
}
