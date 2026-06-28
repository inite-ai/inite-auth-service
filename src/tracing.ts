/**
 * OpenTelemetry SDK bootstrap. Imported FIRST in main.ts so the
 * auto-instrumentations get to monkey-patch http/express/pg/redis
 * before any other module loads. Activation is opt-in:
 *
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com:4318
 *
 * Without that env var we register no exporter — instrumentation
 * stays loaded but spans go to a noop. Lets the same code path
 * run in CI / dev / prod without forcing an OTel collector
 * everywhere.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export function startTracing(): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint || endpoint.trim().length === 0) return;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? 'inite-auth-service',
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '1.0.0',
      'deployment.environment': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans dominate node traces and dwarf the real work.
        // Off by default; flip via env if you're hunting an issue.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => {
      sdk
        ?.shutdown()
        .catch((err) => console.error('OTel shutdown error', err));
    });
  }
}
