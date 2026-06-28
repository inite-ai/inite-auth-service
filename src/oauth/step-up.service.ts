import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Step-up authentication / Authentication Context Class Reference (acr)
 * enforcement — OIDC core acr_values + RFC 9470 (OAuth 2.0 Step-Up
 * Authentication Challenge).
 *
 * We model three coarse assurance ranks and map both the session's actual
 * factors (amr, RFC 8176) and an RP's requested acr_values onto them:
 *
 *   1  aal1  — a single factor (password, magic-link, federated, lone OTP)
 *   2  aal2  — multi-factor (e.g. pwd + otp)               → "mfa"
 *   3  phr   — phishing-resistant possession (passkey/FIDO) → "phr"/"phrh"
 *
 * Higher ranks satisfy lower requests (a passkey session satisfies a request
 * for aal2). Unrecognized acr tokens are treated as "no enforceable
 * constraint" so custom RP values don't lock users out.
 */
@Injectable()
export class StepUpService {
  /**
   * Recognized acr tokens → assurance rank. A data table rather than a switch
   * keeps this trivial to extend and within the complexity gate. Tokens not
   * present here rank 0 ("no enforceable constraint").
   */
  private static readonly ACR_RANKS: Record<string, number> = {
    aal1: 1, '1': 1, loa1: 1, low: 1,
    aal2: 2, '2': 2, mfa: 2, loa2: 2, silver: 2,
    phr: 3, phrh: 3, aal3: 3, '3': 3, loa3: 3, hwk: 3, gold: 3,
  };

  /** Map a single acr token to a rank, or 0 when we don't model it. */
  private rankOfAcrToken(token: string): number {
    return StepUpService.ACR_RANKS[token.trim().toLowerCase()] ?? 0;
  }

  /** True when the session's factors carry a phishing-resistant possession factor. */
  private isPhishingResistant(amr: string[]): boolean {
    return amr.some((m) => ['fido', 'hwk', 'wia', 'pop'].includes(m.toLowerCase()));
  }

  /** Rank of the assurance the current session actually achieved. */
  sessionRank(amr: string[]): number {
    if (!amr || amr.length === 0) return 0;
    if (this.isPhishingResistant(amr)) return 3;
    const distinct = new Set(amr.map((m) => m.toLowerCase()));
    return distinct.size >= 2 ? 2 : 1;
  }

  /** Canonical acr string the session achieved, for the id_token `acr` claim. */
  achievedAcr(amr: string[]): string | undefined {
    const rank = this.sessionRank(amr);
    if (rank >= 3) return 'phr';
    if (rank === 2) return 'aal2';
    if (rank === 1) return 'aal1';
    return undefined;
  }

  /**
   * Required rank for a space-separated acr_values request. Returns the max
   * rank among tokens we recognize, or 0 when none are recognized (= no
   * enforceable step-up requirement).
   */
  requiredRank(acrValues?: string): number {
    if (!acrValues) return 0;
    return acrValues
      .split(/\s+/)
      .filter(Boolean)
      .reduce((max, t) => Math.max(max, this.rankOfAcrToken(t)), 0);
  }

  /** Does the session satisfy the requested acr_values? */
  isSatisfied(amr: string[], acrValues?: string): boolean {
    const required = this.requiredRank(acrValues);
    if (required === 0) return true; // nothing enforceable requested
    return this.sessionRank(amr) >= required;
  }

  /**
   * RFC 9470 §3 — build a resource server's `WWW-Authenticate` challenge value
   * for a 401 `insufficient_user_authentication`. Hand this to your protected
   * API when the presented access token's acr/auth_time is too low; the client
   * then drives the user back through /authorize with the named acr_values.
   */
  challengeHeader(opts: { acrValues?: string; maxAge?: number } = {}): string {
    const parts = [
      'error="insufficient_user_authentication"',
      'error_description="A higher authentication assurance level is required"',
    ];
    if (opts.acrValues) parts.push(`acr_values="${opts.acrValues}"`);
    if (typeof opts.maxAge === 'number') parts.push(`max_age=${opts.maxAge}`);
    return `Bearer ${parts.join(', ')}`;
  }

  /**
   * Resource-server convenience: write the RFC 9470 401 challenge to a
   * response. Returns the same body shape Nest would emit for an
   * UnauthorizedException so callers can `return` it from a handler.
   */
  sendInsufficientAuthentication(
    res: Response,
    opts: { acrValues?: string; maxAge?: number } = {},
  ): void {
    res
      .status(401)
      .setHeader('WWW-Authenticate', this.challengeHeader(opts));
    res.json({
      error: 'insufficient_user_authentication',
      error_description:
        'A higher authentication assurance level is required for this resource',
      acr_values: opts.acrValues,
    });
  }
}
