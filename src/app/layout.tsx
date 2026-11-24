import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Nexovantis',
  description:
    'Gestión de operaciones y servicios técnicos para pequeñas empresas de mantenimiento, instalaciones y reparaciones.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
