import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The running release, read from package.json (release-please bumps it).
 * The image starts with `node dist/main`, not `npm start`, so
 * `npm_package_version` is never set there. The file sits two levels up from
 * both src/common (ts-node, jest) and dist/common (the image).
 */
function readServiceVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const SERVICE_VERSION = readServiceVersion();
