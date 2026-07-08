import { Injectable, OnModuleInit } from '@nestjs/common';
import { FederationProvider } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldCrypto } from '../../common/field-crypto';
import { LoggerService } from '../../common/logger.service';

const SNAPSHOT_TTL_MS = 30 * 1000;

/** A DB-backed provider config, secret already decrypted into memory. */
export interface FederationDbEntry {
  enabled: boolean;
  displayName: string;
  clientId: string;
  /** Decrypted; '' when no secret has been stored yet. */
  clientSecret: string;
  scopes: string[];
  issuer: string | null;
}

/**
 * In-memory, TTL-refreshed snapshot of DB-backed federation provider config.
 * Lets the synchronous env resolver in FederationProviders consult DB overrides
 * without an async ripple through every caller: reads hit the snapshot
 * (stale-while-revalidate, {@link SNAPSHOT_TTL_MS}); admin writes call
 * {@link invalidate} for immediate consistency. Secrets are decrypted once on
 * load and held in memory (same trust level as env secrets); at rest they stay
 * FieldCrypto-encrypted.
 */
@Injectable()
export class FederationConfigStore implements OnModuleInit {
  private readonly logger = new LoggerService();
  private snapshot = new Map<string, FederationDbEntry>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
  ) {
    this.logger.setContext('FederationConfigStore');
  }

  async onModuleInit(): Promise<void> {
    await this.reload().catch((err) =>
      this.logger.warn(`initial federation config load failed: ${String(err)}`),
    );
  }

  /** Sync read of a provider's DB entry; kicks a background refresh when stale. */
  getEntry(slug: string): FederationDbEntry | undefined {
    if (Date.now() - this.loadedAt > SNAPSHOT_TTL_MS) {
      void this.reload();
    }
    return this.snapshot.get(slug);
  }

  /** Force an immediate reload — call after any admin write. */
  async invalidate(): Promise<void> {
    this.loadedAt = 0;
    await this.reload();
  }

  private async reload(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.doReload().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async doReload(): Promise<void> {
    const rows = await this.prisma.federationProvider.findMany();
    const next = new Map<string, FederationDbEntry>();
    for (const row of rows) next.set(row.slug, this.toEntry(row));
    this.snapshot = next;
    this.loadedAt = Date.now();
  }

  private toEntry(row: FederationProvider): FederationDbEntry {
    return {
      enabled: row.enabled,
      displayName: row.displayName,
      clientId: row.clientId,
      clientSecret: row.clientSecretEnc ? this.crypto.decrypt(row.clientSecretEnc) : '',
      scopes: row.scopes,
      issuer: row.issuer ?? null,
    };
  }
}
