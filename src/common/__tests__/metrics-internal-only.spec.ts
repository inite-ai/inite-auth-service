import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cameThroughProxy } from '../health.controller';

/**
 * /metrics served Prometheus metrics to anyone on auth-api.inite.ai (family
 * security baseline H11). The scrape comes straight from Alloy on the docker
 * network; a request through Traefik or Cloudflare is an outside caller.
 */
describe('/metrics is internal only', () => {
  it('a direct scrape (no forwarded headers) is served', () => {
    expect(cameThroughProxy({ headers: { host: 'inite-auth-service:3002' } })).toBe(false);
  });

  it.each(['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip'])(
    'a request carrying %s is refused',
    (h) => {
      expect(cameThroughProxy({ headers: { [h]: '203.0.113.7' } })).toBe(true);
    },
  );

  it('the auth.inite.ai path router does not route /metrics', () => {
    const text = readFileSync(join(__dirname, '../../../deploy/docker-compose.prod.yml'), 'utf8');
    const rule = text.split('\n').find((l) => l.includes('routers.auth-api-path.rule=')) ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toContain('/metrics');
  });
});
