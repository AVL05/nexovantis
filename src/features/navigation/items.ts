// Única fuente de verdad de la navegación autenticada.
// Para activar un módulo: asigna su `href` real (la ruta debe existir) y quita `soon`.

export type NavIcon = 'home' | 'users' | 'wrench' | 'clipboard';

export type NavItem = {
  key: string;
  label: string;
  icon: NavIcon;
  /** Ruta del módulo; null mientras no exista (se muestra como "Próximamente", sin enlace). */
  href: string | null;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'dashboard', label: 'Panel', icon: 'home', href: '/dashboard' },
  { key: 'customers', label: 'Clientes', icon: 'users', href: '/customers' },
  { key: 'technicians', label: 'Técnicos', icon: 'wrench', href: '/technicians' },
  { key: 'orders', label: 'Órdenes', icon: 'clipboard', href: null },
];
