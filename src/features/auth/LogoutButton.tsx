import { Button } from '@/components/ui/Button';

import { logoutAction } from './actions';

/** Cierre de sesion por Server Action (POST). No existe ninguna ruta GET de logout. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="secondary" size="sm">
        Cerrar sesión
      </Button>
    </form>
  );
}
