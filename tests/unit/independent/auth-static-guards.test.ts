// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Prueba independiente de Testing (TASK-007, T7-13 y T7-14). Develop no la modifica.
// Comprobaciones ESTATICAS sobre src/: heuristicas baratas que complementan (no sustituyen) a las
// E2E con Auth real. Los comentarios se descartan antes de buscar.

// TESTING_ROOT permite validar las heuristicas contra un arbol sintetico; en uso normal es el repo.
const ROOT = process.env.TESTING_ROOT ?? process.cwd();
const SRC = join(ROOT, 'src');

type SourceFile = { path: string; rel: string; raw: string; code: string };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const files: SourceFile[] = existsSync(SRC)
  ? walk(SRC).map((path) => {
      const raw = readFileSync(path, 'utf8');
      return {
        path,
        rel: relative(ROOT, path).replaceAll('\\', '/'),
        raw,
        code: stripComments(raw),
      };
    })
  : [];

function hasDirective(file: SourceFile, directive: 'use client' | 'use server') {
  return new RegExp(`^\\s*['"]${directive}['"]`).test(file.code);
}

function where(matches: SourceFile[]) {
  return matches.map((file) => file.rel).join(', ');
}

const VERIFIES_IDENTITY = /\.(getClaims|getUser)\s*\(/;
const SIGN_IN = /\bsignInWithPassword\s*\(/;
const IS_PROXY_FILE = /(^|\/)proxy(\.|\/)/;

describe('T7-13 sin secretos ni service_role en src/', () => {
  it('src/ existe y contiene codigo', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('el codigo no hace referencia a service_role ni a claves secretas', () => {
    const offenders = files.filter((file) =>
      /service[_\s-]?role|SERVICE_ROLE|serviceRole|sb_secret_|NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)/i.test(
        file.code,
      ),
    );
    expect(
      offenders.map((file) => file.rel),
      where(offenders),
    ).toEqual([]);
  });

  it('no hay JWT incrustados en el codigo', () => {
    const offenders = files.filter((file) =>
      /eyJ[\w-]{15,}\.[\w-]{15,}\.[\w-]{10,}/.test(file.raw),
    );
    expect(offenders.map((file) => file.rel)).toEqual([]);
  });

  it('.env.example no define claves de servicio ni secretos', () => {
    const path = join(ROOT, '.env.example');
    expect(existsSync(path)).toBe(true);
    const assignments = readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('#') && line.includes('='));
    for (const line of assignments) {
      expect(line.split('=')[0]).not.toMatch(/SERVICE|SECRET|PRIVATE/i);
    }
  });
});

describe('T7-14 arquitectura de autenticacion y autorizacion', () => {
  it('no se decide con getSession(), no hay signUp ni API de administracion en src/', () => {
    const offenders = files.filter((file) =>
      /\.getSession\s*\(|\.signUp\s*\(|\.auth\.admin\b|\bsignInWithOtp\s*\(/.test(file.code),
    );
    expect(
      offenders.map((file) => file.rel),
      where(offenders),
    ).toEqual([]);
  });

  it('existe src/proxy.ts (Next.js 16) y no hay middleware.ts', () => {
    expect(existsSync(join(SRC, 'proxy.ts')), 'falta src/proxy.ts').toBe(true);
    for (const legacy of ['src/middleware.ts', 'middleware.ts', 'src/middleware.js']) {
      expect(existsSync(join(ROOT, legacy)), `${legacy} esta obsoleto en Next.js 16`).toBe(false);
    }
  });

  it('src/proxy.ts exporta proxy y config con matcher', () => {
    const proxy = files.find((file) => file.rel === 'src/proxy.ts');
    expect(proxy, 'falta src/proxy.ts').toBeDefined();
    expect(proxy!.code).toMatch(
      /export\s+(async\s+)?function\s+proxy\b|export\s*\{[^}]*\bproxy\b[^}]*\}|export\s+default/,
    );
    expect(proxy!.code).toMatch(/export\s+const\s+config\b/);
    expect(proxy!.code).toMatch(/matcher/);
  });

  it('la identidad se verifica con getClaims()/getUser() en el proxy y, aparte, en el servidor', () => {
    const proxySide = files.filter(
      (file) => IS_PROXY_FILE.test(file.rel) && VERIFIES_IDENTITY.test(file.code),
    );
    const serverSide = files.filter(
      (file) => !IS_PROXY_FILE.test(file.rel) && VERIFIES_IDENTITY.test(file.code),
    );
    expect(proxySide.length, 'el proxy no verifica identidad').toBeGreaterThan(0);
    expect(
      serverSide.length,
      'ninguna helper/pagina de servidor verifica identidad',
    ).toBeGreaterThan(0);
  });

  it('la pagina /dashboard es de servidor y exige autenticacion en el servidor', () => {
    const page = files.find((file) => file.rel === 'src/app/dashboard/page.tsx');
    expect(page, 'falta src/app/dashboard/page.tsx').toBeDefined();
    expect(hasDirective(page!, 'use client'), 'el dashboard no puede ser Client Component').toBe(
      false,
    );
    const dashboardFiles = files.filter((file) => file.rel.startsWith('src/app/dashboard/'));
    expect(
      dashboardFiles.some((file) =>
        /\brequire[A-Z]\w*\s*\(|\.(getClaims|getUser)\s*\(/.test(file.code),
      ),
      'ni la pagina ni su layout llaman a una helper require*() / getClaims() / getUser()',
    ).toBe(true);
  });

  it('nada de lo autenticado se fuerza a cache estatica o compartida', () => {
    const offenders = files.filter(
      (file) =>
        /^src\/(app\/dashboard|features\/auth|lib)\//.test(file.rel) &&
        /force-static|export\s+const\s+revalidate\s*=\s*[1-9]|['"]use cache['"]|unstable_cache/.test(
          file.code,
        ),
    );
    expect(
      offenders.map((file) => file.rel),
      where(offenders),
    ).toEqual([]);
  });

  it('los Client Components no importan modulos de servidor ni inician sesion', () => {
    const clients = files.filter((file) => hasDirective(file, 'use client'));
    const offenders = clients.filter(
      (file) =>
        /from\s+['"](next\/headers|server-only|@\/lib\/supabase\/server|[^'"]*\/server)['"]/.test(
          file.code,
        ) || SIGN_IN.test(file.code),
    );
    expect(
      offenders.map((file) => file.rel),
      where(offenders),
    ).toEqual([]);
  });

  it('el inicio de sesion usa Server Actions y validacion Zod', () => {
    expect(
      files.some((file) => SIGN_IN.test(file.code)),
      'no hay llamada a signInWithPassword',
    ).toBe(true);
    const actions = files.filter((file) => hasDirective(file, 'use server'));
    expect(actions.length, 'no hay ninguna Server Action').toBeGreaterThan(0);
    const zodInAuth = files.some(
      (file) => /from\s+['"]zod['"]/.test(file.code) && /(^|\/)(auth|login)/.test(file.rel),
    );
    expect(zodInAuth, 'no hay esquema Zod en features/auth ni en la ruta de login').toBe(true);
  });

  it('el error de Auth no se devuelve al cliente (mensajes genericos)', () => {
    const login = files.filter((file) => SIGN_IN.test(file.code));
    for (const file of login) {
      expect(
        /return[^;]*\berror\??\.message\b|message:\s*\w*[eE]rror\??\.message/.test(file.code),
        `${file.rel}: devuelve el mensaje de error de Auth`,
      ).toBe(false);
    }
  });
});
