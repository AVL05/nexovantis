// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Prueba independiente de Testing (TASK-010 PRE, A02-02). Develop no la modifica.
//
// Contrato (lo crea Develop): tests/support/local-supabase.ts exporta
//   assertLocalSupabaseUrl(value: unknown): string
//     Devuelve una URL base local normalizada o LANZA un Error. Sin red, sin efectos, sin importar
//     @supabase/supabase-js. Solo acepta protocolo http y hostname (ya normalizado por WHATWG URL)
//     exactamente 127.0.0.1, localhost o [::1]; rechaza credenciales (usuario/clave), URLs
//     invalidas, no cadenas y cualquier otro protocolo o host. El mensaje de error NUNCA incluye
//     la clave de la URL ni valores de claves de API.
//   requireLocalSupabaseEnv(env = process.env): { url: string; anonKey: string; serviceKey: string }
//     Exige SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY (no vacias) y valida la
//     URL con assertLocalSupabaseUrl. Mensajes sin valores de claves.

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import { assertLocalSupabaseUrl, requireLocalSupabaseEnv } from '../../support/local-supabase';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

afterEach(() => {
  vi.restoreAllMocks();
});

const ACCEPTED = [
  'http://127.0.0.1:54321',
  'http://127.0.0.1:54321/',
  'http://localhost:54321',
  'http://LOCALHOST:54321',
  'http://[::1]:54321',
];

const REMOTE = [
  'https://abcdefghijklmnop.supabase.co',
  'http://abcdefghijklmnop.supabase.co:54321',
  'http://example.com:54321',
  'http://10.0.0.5:54321',
  'http://192.168.1.10:54321',
  'http://172.17.0.1:54321',
  'http://host.docker.internal:54321',
  'http://0.0.0.0:54321',
];

// Variantes de sufijo/prefijo/encaje que un filtro por "contiene" o "empieza por" aceptaria.
const LOOKALIKES = [
  'http://localhost.evil.com:54321',
  'http://127.0.0.1.nip.io:54321',
  'http://127.0.0.1.evil.com:54321',
  'http://localhost.localdomain:54321',
  'http://evil.com/127.0.0.1',
  'http://evil.com/?h=localhost',
  'http://evil.com#localhost',
  'http://127.0.0.1@evil.com:54321',
  'http://localhost@evil.com',
  'http://127.0.0.1:54321@evil.com',
  'http://evil.com\\@127.0.0.1',
];

const WITH_CREDENTIALS = [
  'http://user:s3cr3t-pw@127.0.0.1:54321',
  'http://user@localhost:54321',
  'http://:s3cr3t-pw@127.0.0.1:54321',
  'http://evil.com:54321@127.0.0.1',
];

const WRONG_PROTOCOL = [
  'https://127.0.0.1:54321',
  'https://localhost:54321',
  'ftp://127.0.0.1:54321',
  'ws://127.0.0.1:54321',
  'file:///tmp/supabase',
  'javascript:alert(1)',
  'data:text/plain,hi',
];

const INVALID: unknown[] = [
  '',
  '   ',
  'not a url',
  '127.0.0.1:54321',
  'localhost:54321',
  '//127.0.0.1:54321',
  'http://',
  'http://127.0.0.1:99999',
  'http://127.0.0.1:abc',
  undefined,
  null,
  42,
  {},
  ['http://127.0.0.1:54321'],
];

function label(value: unknown) {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
}

describe('A02-02 assertLocalSupabaseUrl: destinos locales', () => {
  it.each(ACCEPTED)('acepta %s y devuelve una URL http local', (input) => {
    const result = assertLocalSupabaseUrl(input);
    expect(typeof result).toBe('string');
    const parsed = new URL(result);
    expect(parsed.protocol).toBe('http:');
    expect(LOCAL_HOSTS.has(parsed.hostname)).toBe(true);
    expect(parsed.username).toBe('');
    expect(parsed.password).toBe('');
  });
});

describe('A02-02 assertLocalSupabaseUrl: destinos rechazados', () => {
  it.each([
    ...REMOTE,
    ...LOOKALIKES,
    ...WITH_CREDENTIALS,
    ...WRONG_PROTOCOL,
    ...INVALID.filter((value): value is string => typeof value === 'string'),
  ])('rechaza %j', (input) => {
    expect(() => assertLocalSupabaseUrl(input)).toThrow(Error);
  });

  it('rechaza tambien las entradas no cadena sin lanzar TypeError ajenos al contrato', () => {
    for (const value of INVALID.filter((item) => typeof item !== 'string')) {
      let thrown: unknown;
      try {
        assertLocalSupabaseUrl(value);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, label(value)).toBeInstanceOf(Error);
    }
  });

  it('el mensaje de error no filtra la clave incluida en la URL', () => {
    for (const input of WITH_CREDENTIALS.filter((item) => item.includes('s3cr3t-pw'))) {
      let message = '';
      try {
        assertLocalSupabaseUrl(input);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, input).not.toBe('');
      expect(message, input).not.toContain('s3cr3t-pw');
    }
  });

  it('rechazar no genera trafico de red ni construye clientes', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const input of [...REMOTE, ...LOOKALIKES, ...WITH_CREDENTIALS, ...WRONG_PROTOCOL]) {
      expect(() => assertLocalSupabaseUrl(input)).toThrow();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('A02-02 requireLocalSupabaseEnv', () => {
  const KEYS = { SUPABASE_ANON_KEY: 'anon-key-xyz', SUPABASE_SERVICE_ROLE_KEY: 'service-key-xyz' };

  it('devuelve url y claves con un destino local', () => {
    const env = requireLocalSupabaseEnv({ SUPABASE_URL: 'http://127.0.0.1:54321', ...KEYS });
    expect(LOCAL_HOSTS.has(new URL(env.url).hostname)).toBe(true);
    expect(env.anonKey).toBe('anon-key-xyz');
    expect(env.serviceKey).toBe('service-key-xyz');
  });

  it.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])(
    'falla si falta %s (nunca se salta) y nombra la variable',
    (name) => {
      const env: Record<string, string | undefined> = {
        SUPABASE_URL: 'http://127.0.0.1:54321',
        ...KEYS,
      };
      env[name] = '   ';
      expect(() => requireLocalSupabaseEnv(env)).toThrow(new RegExp(name));
    },
  );

  it.each([...REMOTE, ...LOOKALIKES, ...WITH_CREDENTIALS, ...WRONG_PROTOCOL, 'not a url'])(
    'rechaza SUPABASE_URL=%s sin filtrar claves ni trafico',
    (input) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      let message = '';
      try {
        requireLocalSupabaseEnv({ SUPABASE_URL: input, ...KEYS });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toBe('');
      expect(message).not.toContain('anon-key-xyz');
      expect(message).not.toContain('service-key-xyz');
      expect(message).not.toContain('s3cr3t-pw');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});

// Validacion ESTATICA: todos los puntos que construyen clientes administrativos usan el helper.
// El comportamiento efectivo de las suites Supabase se comprueba en
// supabase-suites-remote-guard.test.ts (proceso hijo sin red).
describe('A02-02 estatico: puntos de entrada que usan el helper', () => {
  const FILES = [
    'tests/integration/supabase/rls.supabase.test.ts',
    'tests/integration/supabase/independent/archive-restore.supabase.test.ts',
    'tests/integration/supabase/independent/support/stack.ts',
    'tests/e2e-supabase/support/crm-world.ts',
    'tests/e2e-supabase/independent/support/world.ts',
  ];

  it.each(FILES)('%s importa tests/support/local-supabase', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    expect(source).toMatch(/from\s+['"][^'"]*support\/local-supabase['"]/);
  });

  it.each(FILES)('%s no vuelve a leer SUPABASE_URL por su cuenta para crear el cliente', (file) => {
    const source = readFileSync(join(process.cwd(), file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // La unica lectura permitida de la variable es a traves del helper.
    expect(source).not.toMatch(/process\.env\.SUPABASE_URL\s+as\s+string/);
  });
});
