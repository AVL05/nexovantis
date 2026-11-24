import Link from 'next/link';
import type { ComponentProps } from 'react';

import { buttonClass, type ButtonSize, type ButtonVariant } from './Button';

/** Enlace de navegación con el aspecto de un botón (misma altura táctil y foco). */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
