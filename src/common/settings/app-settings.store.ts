import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SNAPSHOT_TTL_MS = 30 * 1000;

/**
 * In-memory, TTL-refreshed snapshot of DB-backed runtime settings — the same
 * stale-while-revalidate pattern as FederationConfigStore, so synchronous
 * per-request resolvers (guards, token issuance) can consult DB overrides
 * without an async ripple. Admin writes call {@link invalidate} for immediate
 * consistency; otherwise a background reload refreshes every {@link SNAPSHOT_TTL_MS}.
 */
@Injectable()
export class AppSettingsStore implements OnModuleInit {
  private snapshot = new Map<string, string>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload().catch(() => {
      // A failed initial load leaves an empty snapshot — every resolver then
      // falls back to env, which is the safe default. Next access retries.
    });
  }

  /** Sync read of a DB override; kicks a background refresh when stale. */
  get(key: string): string | undefined {
    if (Date.now() - this.loadedAt > SNAPSHOT_TTL_MS) void this.reload();
    return this.snapshot.get(key);
  }

  /** All current DB overrides (key → value). */
  all(): Record<string, string> {
    if (Date.now() - this.loadedAt > SNAPSHOT_TTL_MS) void this.reload();
    return Object.fromEntries(this.snapshot);
  }

  /** Upsert a DB override and refresh the snapshot immediately. */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await this.invalidate();
  }

  /** Remove a DB override (revert to env) and refresh immediately. */
  async unset(key: string): Promise<void> {
    await this.prisma.appSetting.deleteMany({ where: { key } });
    await this.invalidate();
  }

  /** Force an immediate reload — called after every admin write. */
  async invalidate(): Promise<void> {
    this.loadedAt = 0;
    await this.reload();
  }

  private async reload(): Promise<void> {
    if (this.loading !== null) return this.loading;
    this.loading = this.doReload().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async doReload(): Promise<void> {
    const rows = await this.prisma.appSetting.findMany();
    const next = new Map<string, string>();
    for (const row of rows) next.set(row.key, row.value);
    this.snapshot = next;
    this.loadedAt = Date.now();
  }
}
