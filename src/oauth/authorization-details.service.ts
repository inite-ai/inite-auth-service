import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthorizationDetail } from './contracts/authorization-detail';
import { resolveAuthorizationDetailsTypes } from './authorization-details.config';
import { SettingsService } from '../common/settings/settings.service';

/**
 * RFC 9396 Rich Authorization Requests — parse + validate the
 * `authorization_details` parameter.
 *
 * The parameter is a JSON-encoded array of typed permission objects sent
 * alongside `scope` at /authorize or /par. This service is the single valve:
 * it rejects malformed input or unsupported `type`s with the RFC-mandated
 * `invalid_authorization_details` error (§5), so every entry point validates
 * identically. Feature-gated by `RAR_ENABLED` — when off, a present parameter
 * is rejected as unsupported rather than silently honored.
 */
@Injectable()
export class AuthorizationDetailsService {
  constructor(private readonly settings: SettingsService) {}

  /** True when RAR is turned on for this deployment. */
  isEnabled(): boolean {
    return this.settings.flag('RAR_ENABLED');
  }

  /** The supported `type` values (for enforcement + discovery metadata). */
  supportedTypes(): string[] {
    return resolveAuthorizationDetailsTypes(
      this.settings.raw('AUTHORIZATION_DETAILS_TYPES'),
    );
  }

  /**
   * Parse + validate a raw `authorization_details` string (JSON array).
   * Returns the validated details, or `undefined` when the parameter is absent.
   * Throws `invalid_authorization_details` (RFC 9396 §5) on any violation.
   */
  parse(raw: string | undefined | null): AuthorizationDetail[] | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;

    if (!this.isEnabled()) {
      throw this.reject('authorization_details is not supported by this server');
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw this.reject('authorization_details must be a JSON array');
    }
    if (!Array.isArray(value) || value.length === 0) {
      throw this.reject('authorization_details must be a non-empty JSON array');
    }

    const supported = new Set(this.supportedTypes());
    return value.map((element) => this.validateElement(element, supported));
  }

  private validateElement(
    element: unknown,
    supported: Set<string>,
  ): AuthorizationDetail {
    if (typeof element !== 'object' || element === null || Array.isArray(element)) {
      throw this.reject('each authorization_details entry must be an object');
    }
    const detail = element as Record<string, unknown>;
    if (typeof detail.type !== 'string' || detail.type.length === 0) {
      throw this.reject('each authorization_details entry requires a string "type"');
    }
    if (!supported.has(detail.type)) {
      throw this.reject(`unsupported authorization_details type: ${detail.type}`);
    }
    return detail as AuthorizationDetail;
  }

  private reject(description: string): BadRequestException {
    return new BadRequestException({
      error: 'invalid_authorization_details',
      error_description: description,
    });
  }
}
