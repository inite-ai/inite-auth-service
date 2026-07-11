import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppSettingsStore } from './app-settings.store';

/** Where a setting's effective value came from. */
export type SettingSource = 'db' | 'env' | 'default';

/**
 * Resolves an operator-tunable setting as: DB override (AppSettingsStore) →
 * env (ConfigService) → caller default. Consumers that previously read
 * `configService.get('X')` directly inject this instead so a runtime admin
 * override takes effect without a redeploy. Reads are synchronous (the store is
 * a TTL snapshot), so guards and token issuance can use it inline.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly store: AppSettingsStore,
    private readonly config: ConfigService,
  ) {}

  /** The effective raw string (DB → env), or undefined when neither is set. */
  raw(key: string): string | undefined {
    return this.store.get(key) ?? this.config.get<string>(key) ?? undefined;
  }

  /** Boolean flag — true only when the effective value is exactly "true". */
  flag(key: string): boolean {
    return this.raw(key) === 'true';
  }

  /** Effective string with a caller fallback (DB → env → fallback). */
  value(key: string, fallback = ''): string {
    return this.raw(key) ?? fallback;
  }

  /** Where the effective value resolved from — for admin display. */
  source(key: string): SettingSource {
    if (this.store.get(key) !== undefined) return 'db';
    if (this.config.get<string>(key) !== undefined) return 'env';
    return 'default';
  }
}
