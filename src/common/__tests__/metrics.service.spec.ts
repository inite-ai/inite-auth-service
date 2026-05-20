import { MetricsService } from '../metrics.service';

describe('MetricsService', () => {
  let svc: MetricsService;

  beforeEach(() => {
    svc = new MetricsService();
    svc.onModuleInit();
  });

  it('exposes prometheus text-format metrics', async () => {
    svc.tokensIssued.inc({ grant_type: 'authorization_code' });
    svc.tokensIssued.inc({ grant_type: 'client_credentials' }, 2);
    svc.tokenFailures.inc({ grant_type: 'refresh_token', reason: 'invalid_credentials' });

    const { contentType, body } = await svc.expose();
    expect(contentType).toMatch(/text\/plain/);
    expect(body).toContain('oauth_tokens_issued_total');
    expect(body).toMatch(
      /oauth_tokens_issued_total\{grant_type="authorization_code"\} 1/,
    );
    expect(body).toMatch(
      /oauth_tokens_issued_total\{grant_type="client_credentials"\} 2/,
    );
    expect(body).toContain(
      'oauth_token_failures_total{grant_type="refresh_token",reason="invalid_credentials"}',
    );
  });

  it('records latency observations in the histogram', async () => {
    const end = svc.tokenLatency.startTimer({ grant_type: 'client_credentials' });
    await new Promise((r) => setTimeout(r, 20));
    end({ status: 'success' });

    const { body } = await svc.expose();
    expect(body).toContain('oauth_token_request_duration_seconds');
    expect(body).toMatch(
      /oauth_token_request_duration_seconds_count\{grant_type="client_credentials"/,
    );
  });

  it('includes default node runtime metrics', async () => {
    const { body } = await svc.expose();
    // collectDefaultMetrics gives us process_*/nodejs_* — sanity check
    expect(body).toMatch(/process_(cpu|start_time|resident)_/);
  });
});
