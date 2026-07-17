import { closeSync, fchmodSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT_FILE = 'client-secrets.local.env';

/**
 * Provisioning scripts hand freshly generated client secrets to the
 * operator through this file instead of stdout — terminal scrollback and
 * CI logs are not a place for long-lived credentials. The file is
 * chmod 600, gitignored, and meant to be read once and deleted.
 *
 * All operations go through one file descriptor (open-append + fchmod):
 * no exists/stat-then-act sequence, so there is no TOCTOU window on the
 * path.
 */
export function writeSecretToFile(envVar: string, value: string): string {
  const path = resolve(OUT_FILE);
  const fd = openSync(path, 'a', 0o600);
  try {
    fchmodSync(fd, 0o600);
    writeSync(fd, `${envVar}=${value}\n`);
  } finally {
    closeSync(fd);
  }
  return path;
}
