import Link from 'next/link';

import { cn } from '@/components/ui/cn';

export type ShellNavItem = {
  key: string;
  label: string;
  icon: 'home' | 'users' | 'wrench' | 'clipboard' | 'receipt' | 'box' | 'history';
  href: string | null;
};

const ICONS: Record<ShellNavItem['icon'], string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v10h13V10',
  users:
    'M16 20v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  wrench: 'M14.5 6.5a4 4 0 0 0 5 5L10 21a2.1 2.1 0 0 1-3-3l9.5-9.5a4 4 0 0 0-2-2.1z',
  clipboard: 'M9 4h6v3H9zM7 5.5H5.5V20h13V5.5H17M9 12h6M9 16h4',
  receipt: 'M6 3.5h12V21l-3-1.8-3 1.8-3-1.8L6 21zM9 8h6M9 12h6M9 16h3',
  box: 'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9',
  history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4.5l3 1.8',
};

function Icon({ name }: Readonly<{ name: ShellNavItem['icon'] }>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const ROW = 'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium';

export function NavList({
  items,
  current,
}: Readonly<{ items: readonly ShellNavItem[]; current: string }>) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.key}>
          {item.href ? (
            <Link
              href={item.href}
              aria-current={item.key === current ? 'page' : undefined}
              className={cn(
                ROW,
                'transition-[background-color,border-color,color] duration-150',
                item.key === current
                  ? 'bg-nav-active font-semibold text-white [&>svg]:text-nav-focus'
                  : 'text-nav-text hover:bg-nav-active/60 hover:text-white',
              )}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ) : (
            <span className={cn(ROW, 'cursor-not-allowed text-nav-muted')}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              <span className="ml-auto rounded-sm border border-nav-active px-1.5 py-0.5 text-xs font-normal">
                Próximamente
              </span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
