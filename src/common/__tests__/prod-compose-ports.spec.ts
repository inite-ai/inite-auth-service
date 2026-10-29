import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Docker publishes ports through its own iptables chain, ahead of ufw, so a
 * bare "3002:3002" in the prod compose file put the API (bypassing Traefik
 * and Cloudflare), Postgres and Redis on the open internet. Every published
 * port in the file that deploy copies to the host must bind loopback.
 */
describe('deploy/docker-compose.prod.yml', () => {
  const text = readFileSync(join(__dirname, '../../../deploy/docker-compose.prod.yml'), 'utf8');
  const published = [...text.matchAll(/^\s*-\s*"?([0-9.:]+:\d+(?:\/\w+)?)"?\s*$/gm)].map((m) => m[1] ?? '');

  it('publishes some ports (the matcher still sees them)', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it.each(published)('%s binds 127.0.0.1', (mapping) => {
    expect(mapping.startsWith('127.0.0.1:')).toBe(true);
  });
});
