import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FederationProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FieldCrypto } from '../common/field-crypto';
import { ProviderConfig } from '../auth/federation/contracts/provider-config';
import { FederationProviders } from '../auth/federation/federation-providers.service';
import { FederationConfigStore } from '../auth/federation/federation-config.store';
import { STATIC_PROVIDERS } from '../auth/federation/providers';
import { UpsertFederationDto } from './dto/upsert-federation.dto';

const KNOWN_SLUGS = ['google', 'github', 'oidc'];

/** Admin-facing summary of one provider (never includes the secret itself). */
export interface FederationSummary {
  slug: string;
  displayName: string;
  enabled: boolean;
  source: 'db' | 'env' | 'unset';
  clientId: string;
  hasSecret: boolean;
  scopes: string[];
  issuer: string | null;
  callbackUrl: string;
  requiresIssuer: boolean;
}

/**
 * CRUD for DB-backed federation provider config. Superadmin-only (federation is
 * global, not tenant-scoped). Secrets are encrypted at rest via FieldCrypto and
 * never returned. Writes invalidate the resolver's snapshot for hot reload.
 */
@Injectable()
export class FederationAdminService {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly providers: FederationProviders,
    private readonly store: FederationConfigStore,
  ) {}

  async list(): Promise<FederationSummary[]> {
    return Promise.all(KNOWN_SLUGS.map((slug) => this.describe(slug)));
  }

  async upsert(slug: string, dto: UpsertFederationDto): Promise<FederationSummary> {
    this.ensureKnown(slug);
    await this.assertIssuerPresent(slug, dto);
    await this.prisma.federationProvider.upsert({
      where: { slug },
      create: this.buildCreate(slug, dto),
      update: this.buildUpdate(dto),
    });
    await this.store.invalidate();
    return this.describe(slug);
  }

  private async assertIssuerPresent(slug: string, dto: UpsertFederationDto): Promise<void> {
    if (slug === 'oidc' && !dto.issuer && !(await this.hasIssuer(slug))) {
      throw new BadRequestException('the OIDC connector requires an issuer');
    }
  }

  private buildCreate(slug: string, dto: UpsertFederationDto) {
    return {
      slug,
      displayName: dto.displayName ?? this.defaultName(slug),
      clientId: dto.clientId,
      clientSecretEnc: dto.clientSecret ? this.crypto.encrypt(dto.clientSecret) : null,
      scopes: dto.scopes ?? [],
      issuer: dto.issuer ?? null,
      enabled: dto.enabled ?? false,
    };
  }

  private buildUpdate(dto: UpsertFederationDto): Record<string, unknown> {
    const data: Record<string, unknown> = { clientId: dto.clientId };
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.clientSecret !== undefined) data.clientSecretEnc = this.crypto.encrypt(dto.clientSecret);
    if (dto.scopes !== undefined) data.scopes = dto.scopes;
    if (dto.issuer !== undefined) data.issuer = dto.issuer;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    return data;
  }

  async setEnabled(slug: string, enabled: boolean): Promise<FederationSummary> {
    this.ensureKnown(slug);
    const existing = await this.prisma.federationProvider.findUnique({ where: { slug } });
    if (existing) {
      await this.prisma.federationProvider.update({ where: { slug }, data: { enabled } });
    } else {
      await this.seedFromEnv(slug, enabled);
    }
    await this.store.invalidate();
    return this.describe(slug);
  }

  async test(slug: string): Promise<{ ok: boolean; detail: string }> {
    this.ensureKnown(slug);
    const cfg = this.providers.resolveForTest(slug);
    if (!cfg) return { ok: false, detail: 'Provider is not configured' };
    if (slug === 'oidc') {
      try {
        await this.providers.getEndpoints(cfg);
        return { ok: true, detail: 'OIDC discovery document reachable' };
      } catch (err) {
        return { ok: false, detail: `Discovery failed: ${String((err as Error).message)}` };
      }
    }
    const ok = Boolean(cfg.clientId && cfg.clientSecret);
    return { ok, detail: ok ? 'Credentials present' : 'Missing client id or secret' };
  }

  private async seedFromEnv(slug: string, enabled: boolean): Promise<void> {
    const env = this.providers.envConfig(slug);
    if (!env) {
      throw new BadRequestException('configure the provider before enabling or disabling it');
    }
    await this.prisma.federationProvider.create({
      data: {
        slug,
        displayName: env.displayName,
        clientId: env.clientId,
        clientSecretEnc: this.crypto.encrypt(env.clientSecret),
        scopes: env.scopes,
        issuer: env.issuer ?? null,
        enabled,
      },
    });
  }

  private async describe(slug: string): Promise<FederationSummary> {
    const row = await this.prisma.federationProvider.findUnique({ where: { slug } });
    if (row) return this.summaryFromRow(slug, row);
    const env = this.providers.envConfig(slug);
    if (env) return this.summaryFromEnv(slug, env);
    return this.emptySummary(slug);
  }

  private summaryFromRow(slug: string, row: FederationProvider): FederationSummary {
    return {
      slug,
      displayName: row.displayName,
      enabled: row.enabled,
      source: 'db',
      clientId: row.clientId,
      hasSecret: Boolean(row.clientSecretEnc),
      scopes: row.scopes,
      issuer: row.issuer ?? null,
      callbackUrl: this.providers.redirectUri(slug),
      requiresIssuer: slug === 'oidc',
    };
  }

  private summaryFromEnv(slug: string, env: ProviderConfig): FederationSummary {
    return {
      slug,
      displayName: env.displayName,
      enabled: true,
      source: 'env',
      clientId: env.clientId,
      hasSecret: true,
      scopes: env.scopes,
      issuer: env.issuer ?? null,
      callbackUrl: this.providers.redirectUri(slug),
      requiresIssuer: slug === 'oidc',
    };
  }

  private emptySummary(slug: string): FederationSummary {
    return {
      slug,
      displayName: this.defaultName(slug),
      enabled: false,
      source: 'unset',
      clientId: '',
      hasSecret: false,
      scopes: [],
      issuer: null,
      callbackUrl: this.providers.redirectUri(slug),
      requiresIssuer: slug === 'oidc',
    };
  }

  private async hasIssuer(slug: string): Promise<boolean> {
    const row = await this.prisma.federationProvider.findUnique({ where: { slug } });
    return Boolean(row?.issuer);
  }

  private defaultName(slug: string): string {
    const meta = (STATIC_PROVIDERS as Record<string, { displayName?: string }>)[slug];
    return meta?.displayName ?? 'Single Sign-On';
  }

  private ensureKnown(slug: string): void {
    if (!KNOWN_SLUGS.includes(slug)) {
      throw new NotFoundException(`Unknown federation provider: ${slug}`);
    }
  }
}
