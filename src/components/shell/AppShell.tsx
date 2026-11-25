import type { ReactNode } from 'react';

import { NavList, type ShellNavItem } from './NavList';
import { ShellFrame } from './ShellFrame';

/**
 * Shell de la app autenticada. Sin lógica de negocio: recibe navegación, contexto de
 * organización/usuario y acciones ya resueltos por el servidor.
 */
export function AppShell({
  items,
  current,
  organizationName,
  roleLabel,
  userEmail,
  actions,
  children,
}: Readonly<{
  items: readonly ShellNavItem[];
  current: string;
  /** Si es null/undefined (sin membresía) no se muestra contexto de organización. */
  organizationName?: string | null;
  roleLabel?: string | null;
  userEmail?: string | null;
  actions?: ReactNode;
  children: ReactNode;
}>) {
  const context = (
    <div className="flex min-w-0 flex-col items-end text-right leading-tight sm:flex-row sm:items-center sm:gap-3">
      {organizationName ? (
        <span
          data-testid="org-name"
          className="block max-w-full truncate text-sm font-semibold sm:max-w-64"
        >
          {organizationName}
        </span>
      ) : null}
      {roleLabel ? (
        <span data-testid="user-role" className="block max-w-full truncate text-xs text-ink-muted">
          {roleLabel}
        </span>
      ) : null}
      {userEmail && !organizationName ? (
        <span className="block max-w-full truncate text-xs text-ink-muted sm:max-w-64">
          {userEmail}
        </span>
      ) : null}
    </div>
  );

  return (
    <ShellFrame
      nav={<NavList items={items} current={current} />}
      headerContext={context}
      headerActions={actions}
    >
      {children}
    </ShellFrame>
  );
}
