import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { AuditWebhookService } from '../audit-webhook.service';

function svc(env: Record<string, string | undefined>) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new AuditWebhookService(config);
}

describe('AuditWebhookService', () => {
  it('is disabled and a no-op when no URL is configured', async () => {
    const s = svc({});
    expect(s.enabled).toBe(false);
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(s.deliver({ event: 'x' })).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('signs the body with HMAC-SHA256 over sha256=<hex> when a secret is set', () => {
    const s = svc({ AUDIT_WEBHOOK_URL: 'https://x', AUDIT_WEBHOOK_SECRET: 'sek' });
    const body = '{"a":1}';
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', 'sek').update(body).digest('hex');
    expect(s.sign(body)).toBe(expected);
  });

  it('POSTs to the URL with the signature header and never throws on failure', async () => {
    const s = svc({ AUDIT_WEBHOOK_URL: 'https://hook.example', AUDIT_WEBHOOK_SECRET: 'sek' });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);

    await s.deliver({ event: 'token.issued' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe('https://hook.example');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-INITE-Signature']).toMatch(/^sha256=/);
    expect(JSON.parse(opts.body)).toMatchObject({
      type: 'audit.event',
      event: { event: 'token.issued' },
    });

    // A rejected fetch must be swallowed.
    fetchSpy.mockRejectedValueOnce(new Error('down'));
    await expect(s.deliver({ event: 'y' })).resolves.toBeUndefined();
    fetchSpy.mockRestore();
  });
});
