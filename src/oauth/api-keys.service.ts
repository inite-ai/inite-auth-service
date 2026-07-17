/**
 * Long-lived opaque API keys ("ik_…") for vertical resource access.
 *
 * Closes the gap verticals worked around with env-baked static key tables
 * (brain's BRAIN_API_KEYS): keys are issued per tenant (optionally bound to
 * a user), carry an audience + scope set, and are verified by resource
 * servers through RFC 7662 introspection — the introspection answer uses
 * the same claim shape as our JWTs (sub/org/org_id/scope/aud), so
 * @inite/auth-resource resolves keys and tokens identically.
 *
 * The raw key is returned exactly once at issuance; only its SHA-256 is
 * stored (O(1) unique lookup, DB leak alone can't be replayed as a key
 * listing — though unlike refresh tokens there's no HMAC secret, because
 * introspection callers are already authenticated confidential clients).
 */

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiKey } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { supportedScopes } from './oauth-scopes.registry';

const KEY_PREFIX = 'ik_';
/** Chars of the raw key kept in clear for operator display ("ik_a1b2c3"). */
const DISPLAY_PREFIX_LENGTH = 9;

export interface IssueApiKeyInput {
  name: string;
  /** Tenant the key belongs to (Organization.companyId). */
  companyId: string;
  /** RFC 8707 audience the key is valid for, e.g. 'brain'. */
  audience: string;
  scopes: string[];
  /**
   * ABAC policy set names the vertical resolves for this key — answered
   * as the `policy` member of the introspection response. Names use the
   * verticals' policy-set charset; semantics live vertical-side.
   */
  policyNames?: string[];
  /** Optional owner user (UUID) — introspection then answers sub=user.did. */
  userId?: string;
  expiresAt?: Date;
}

/** Mirror of the verticals' policy-set naming rules (brain policy-store). */
const VALID_POLICY_NAME = /^[a-z][a-z0-9_-]{1,63}$/;
const MAX_POLICY_NAMES = 8;

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/** Public row shape — keyHash never leaves the service. */
function toPublicRow(key: ApiKey): Omit<ApiKey, 'keyHash'> {
  const { keyHash: _keyHash, ...publicRow } = key;
  return publicRow;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issue a key. The raw value is in the response and never retrievable again. */
  async issue(
    input: IssueApiKeyInput,
  ): Promise<{ apiKey: Omit<ApiKey, 'keyHash'>; rawKey: string }> {
    this.assertIssueInput(input);
    const organization = await this.prisma.organization.findUnique({
      where: { companyId: input.companyId },
    });
    if (!organization) {
      throw new BadRequestException(`Unknown companyId "${input.companyId}"`);
    }
    // Resolve the owner up front — a dangling userId would otherwise
    // surface as an FK violation (500) instead of a clean 400.
    if (input.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
      if (!user) throw new BadRequestException(`Unknown userId "${input.userId}"`);
    }

    const rawKey = KEY_PREFIX + crypto.randomBytes(32).toString('base64url');
    const apiKey = await this.prisma.apiKey.create({
      data: {
        keyHash: hashKey(rawKey),
        prefix: rawKey.slice(0, DISPLAY_PREFIX_LENGTH),
        name: input.name,
        organizationId: organization.id,
        userId: input.userId ?? null,
        audience: input.audience,
        scopes: input.scopes,
        policyNames: input.policyNames ?? [],
        expiresAt: input.expiresAt ?? null,
      },
    });
    return { apiKey: toPublicRow(apiKey), rawKey };
  }

  /** Tenant-scoped listing (companyId undefined = superadmin, all tenants). */
  async list(
    companyId?: string,
  ): Promise<Array<Omit<ApiKey, 'keyHash'> & { companyId: string }>> {
    const rows = await this.prisma.apiKey.findMany({
      where: companyId ? { organization: { companyId } } : {},
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { companyId: true } } },
    });
    return rows.map((row) => {
      const { organization, ...key } = row;
      return { ...toPublicRow(key), companyId: organization.companyId };
    });
  }

  /**
   * Revoke a key. `companyId` bounds the operation for scoped admins — a
   * scoped operator cannot revoke another tenant's key by guessing ids.
   */
  async revoke(id: string, companyId?: string): Promise<Omit<ApiKey, 'keyHash'>> {
    const result = await this.prisma.apiKey.updateMany({
      where: {
        id,
        revoked: false,
        ...(companyId ? { organization: { companyId } } : {}),
      },
      data: { revoked: true, revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('API key not found or already revoked');
    }
    const row = await this.prisma.apiKey.findUnique({ where: { id } });
    return toPublicRow(row!);
  }

  /**
   * RFC 7662 resolution for the introspection endpoint. Returns the claim
   * set for an active key, or null (introspection then answers
   * `{active:false}` — never why, per spec).
   */
  async introspectionClaims(rawKey: string): Promise<Record<string, unknown> | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashKey(rawKey) },
      include: { organization: true, user: { select: { did: true } } },
    });
    if (!key || key.revoked) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;

    this.touchLastUsed(key.id);
    return {
      sub: key.user?.did ?? key.organization.companyId,
      org: key.organization.companyId,
      org_id: key.organizationId,
      aud: key.audience,
      client_id: key.audience,
      scope: key.scopes.join(' '),
      // ABAC policy sets the vertical resolves for this key — same
      // claim name as on JWTs, so resource-side parsing is uniform.
      ...(key.policyNames.length > 0 ? { policy: key.policyNames } : {}),
      token_type: 'api_key',
      iat: Math.floor(key.createdAt.getTime() / 1000),
      ...(key.expiresAt ? { exp: Math.floor(key.expiresAt.getTime() / 1000) } : {}),
    };
  }

  private assertIssueInput(input: IssueApiKeyInput): void {
    if (!input.name?.trim()) throw new BadRequestException('name is required');
    if (!input.audience?.trim()) throw new BadRequestException('audience is required');
    if (!input.scopes?.length) throw new BadRequestException('scopes are required');
    const known = supportedScopes();
    const unknown = input.scopes.filter((s) => !known.includes(s));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown scope(s): ${unknown.join(', ')}`);
    }
    const policyNames = input.policyNames ?? [];
    if (policyNames.length > MAX_POLICY_NAMES) {
      throw new BadRequestException(`At most ${MAX_POLICY_NAMES} policy sets per key`);
    }
    const badNames = policyNames.filter((n) => !VALID_POLICY_NAME.test(n));
    if (badNames.length > 0) {
      throw new BadRequestException(`Invalid policy set name(s): ${badNames.join(', ')}`);
    }
  }

  /** Fire-and-forget usage stamp — introspection latency must not pay a write. */
  private touchLastUsed(id: string): void {
    void this.prisma.apiKey
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
}
