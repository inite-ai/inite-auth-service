import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsService } from '../common/settings/settings.service';
import { AppSettingsStore } from '../common/settings/app-settings.store';
import { OAuthAuditService } from '../audit/oauth-audit.service';
import {
  SETTINGS_REGISTRY,
  SettingDef,
  settingDef,
  validateSettingValue,
} from '../common/settings/settings.registry';

/** Admin-facing view of one operator setting. Secrets never return their value. */
export interface SettingView {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingDef['type'];
  secret: boolean;
  /** Effective value (DB → env → default); null for secrets. */
  value: string | null;
  /** Whether a value is set (for secrets, this is all the UI gets). */
  isSet: boolean;
  source: 'db' | 'env' | 'default';
}

/**
 * Admin CRUD for the runtime settings registry. Only registry keys are writable
 * (secrets like JWT/SMTP keys are absent). A DB override shadows the env value;
 * clearing it reverts to env. Every write is audit-logged.
 */
@Injectable()
export class SettingsAdminService {
  constructor(
    private readonly settings: SettingsService,
    private readonly store: AppSettingsStore,
    private readonly audit: OAuthAuditService,
  ) {}

  list(): SettingView[] {
    return SETTINGS_REGISTRY.map((def) => this.viewOf(def));
  }

  async set(key: string, value: string, actor: string | null): Promise<SettingView> {
    const def = this.require(key);
    const error = validateSettingValue(def, value);
    if (error) throw new BadRequestException(`${key} ${error}`);
    await this.store.set(key, value);
    await this.record('admin.settings.updated', key, actor);
    return this.viewOf(def);
  }

  async reset(key: string, actor: string | null): Promise<SettingView> {
    const def = this.require(key);
    await this.store.unset(key);
    await this.record('admin.settings.reset', key, actor);
    return this.viewOf(def);
  }

  private require(key: string): SettingDef {
    const def = settingDef(key);
    if (!def) throw new NotFoundException(`Unknown setting: ${key}`);
    return def;
  }

  private viewOf(def: SettingDef): SettingView {
    const raw = this.settings.raw(def.key);
    return {
      key: def.key,
      group: def.group,
      label: def.label,
      description: def.description,
      type: def.type,
      secret: Boolean(def.secret),
      value: def.secret ? null : (raw ?? def.default ?? ''),
      isSet: raw !== undefined || def.default !== undefined,
      source: this.settings.source(def.key),
    };
  }

  private async record(event: string, key: string, actor: string | null): Promise<void> {
    await this.audit.record({
      event,
      clientId: null,
      sub: actor,
      success: true,
      metadata: { key },
    });
  }
}
