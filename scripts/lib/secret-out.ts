import { appendFileSync, chmodSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_FILE = 'client-secrets.local.env';

/**
 * Provisioning scripts hand freshly generated client secrets to the
 * operator through this file instead of stdout — terminal scrollback and
 * CI logs are not a place for long-lived credentials. The file is
 * chmod 600, gitignored, and meant to be read once and deleted.
 */
export function writeSecretToFile(envVar: string, value: string): string {
  const path = resolve(OUT_FILE);
  if (!existsSync(path)) writeFileSync(path, '', { mode: 0o600 });
  chmodSync(path, 0o600);
  appendFileSync(path, `${envVar}=${value}\n`);
  return path;
}
