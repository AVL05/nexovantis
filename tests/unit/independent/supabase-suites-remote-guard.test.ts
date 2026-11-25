// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Prueba independiente de Testing (TASK-010 PRE, A02-02). Develop no la modifica.
//
// Ejecuta `vitest run -c vitest.supabase.config.mts` (las suites REALES de tests/integration/supabase/**,
// incluida la independiente) en un proceso hijo con un SUPABASE_URL no autorizado y comprueba que:
//   - termina con codigo distinto de 0,
//   - el rechazo procede de la proteccion de destino local (mensaje que lo indica) y
//   - NO se intento ninguna conexion: ni DNS (ENOTFOUND/EAI_AGAIN), ni conexion rechazada, ni TLS,
//     ni "fetch failed". Si se hubiera construido un cliente administrativo y enviado una peticion,
//     la salida contendria alguno de esos errores.
// Los destinos usan TLD reservados (.invalid, RFC 6761) o loopback sin servicio: sin trafico externo
// ni siquiera en el estado previo a la correccion. No necesita Docker ni Supabase.

const ROOT = process.cwd();
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const NETWORK_TRACE =
  /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|getaddrinfo|certificate|ERR_SSL|socket hang up/i;

const DESTINATIONS: [string, string][] = [
  ['host remoto', 'https://project-ref.supabase.invalid'],
  ['sufijo de localhost', 'http://localhost.invalid:54321'],
  ['IP local como subdominio', 'http://127.0.0.1.nip.invalid:54321'],
  ['usuario@host remoto', 'http://127.0.0.1@project-ref.supabase.invalid:54321'],
  ['credenciales en la URL', 'http://admin:s3cr3t-pw@127.0.0.1:54321'],
  ['protocolo https', 'https://127.0.0.1:54321'],
  ['URL invalida', 'not a url'],
];

function runSupabaseSuites(url: string) {
  const result = spawnSync(process.execPath, [VITEST, 'run', '-c', 'vitest.supabase.config.mts'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 100_000,
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: 'guard-test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'guard-test-service-key',
    },
  });
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

describe('A02-02 las suites Supabase rechazan destinos no locales antes de cualquier peticion', () => {
  it.each(DESTINATIONS)(
    '%s: error de proteccion, codigo != 0 y sin trafico',
    (_name, url) => {
      const { status, output } = runSupabaseSuites(url);
      expect(status, 'debe terminar con error').not.toBe(0);
      expect(output, 'no debe haber intentos de conexion').not.toMatch(NETWORK_TRACE);
      // La linea del error (p. ej. "Error: ... solo un stack local ...") debe nombrar el motivo.
      expect(output, 'el rechazo debe explicar que solo se admite un stack local').toMatch(
        /^\s*(?:\w+)?Error:[^\n]*\blocal/im,
      );
      expect(output, 'no debe filtrar la clave de la URL ni claves de API').not.toMatch(
        /s3cr3t-pw|guard-test-service-key|guard-test-anon-key/,
      );
    },
    130_000,
  );
});
