import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import { isoUint8Array, isoBase64URL } from '@simplewebauthn/server/helpers';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis.service';

// WebAuthn challenge replay protection: server-issued challenges are stored
// in Redis with a 5-minute TTL and consumed atomically (getDel) on verify.
// Per WebAuthn spec, the challenge is what makes each signed assertion
// unique and unreplayable — relying on a client-supplied "expectedChallenge"
// (the previous behavior) defeated the entire mechanism.
const CHALLENGE_TTL_SECONDS = 5 * 60;
const REGISTRATION_KEY = (userId: string) => `webauthn:reg:${userId}`;
const AUTHENTICATION_KEY = (challenge: string) => `webauthn:auth:${challenge}`;

// simplewebauthn-server accepts 'none' | 'direct' | 'enterprise'.
// 'indirect' is in the WebAuthn spec but maps to 'direct' in practice;
// callers passing it via env get coerced to 'direct' below.
type AttestationConveyancePreference = 'none' | 'direct' | 'enterprise';

@Injectable()
export class PasskeyService {
  private rpName: string;
  private rpID: string;
  private origin: string;
  /**
   * Attestation policy controls how much the RP demands of the
   * authenticator's identity.
   *
   *   none       — Don't ask. Strongest privacy, weakest assurance.
   *   indirect   — Anonymized attestation (browser may proxy).
   *   direct     — Authenticator-issued statement (DEFAULT). Lets
   *                downstream code verify make/model against a CA
   *                allowlist if needed.
   *   enterprise — Vendor-specific extension; reserved for managed
   *                fleets.
   *
   * Override via env WEBAUTHN_ATTESTATION_TYPE.
   */
  private readonly attestationType: AttestationConveyancePreference;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.rpName = this.configService.get<string>('RP_NAME', 'INITE Identity');
    this.rpID = this.configService.get<string>('RP_ID', 'localhost');
    this.origin = this.configService.get<string>('RP_ORIGIN', 'http://localhost:3000');
    const configured = (
      this.configService.get<string>('WEBAUTHN_ATTESTATION_TYPE', 'direct') ?? 'direct'
    ).toLowerCase();
    const normalised = configured === 'indirect' ? 'direct' : configured;
    this.attestationType = (
      (['none', 'direct', 'enterprise'] as readonly string[]).includes(normalised)
        ? normalised
        : 'direct'
    ) as AttestationConveyancePreference;
  }

  /**
   * Decode the server-signed challenge from a WebAuthn assertion's
   * clientDataJSON (base64url-encoded JSON). The library will also verify
   * this matches expectedChallenge, but we extract it first so we can look
   * up the server-issued challenge in Redis.
   */
  private extractChallengeFromResponse(
    response: { response: { clientDataJSON: string } },
  ): string {
    try {
      const json = Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf-8');
      const parsed = JSON.parse(json) as { challenge?: string };
      if (typeof parsed.challenge !== 'string' || !parsed.challenge) {
        throw new Error('missing challenge');
      }
      return parsed.challenge;
    } catch {
      throw new BadRequestException('Malformed WebAuthn response');
    }
  }

  /**
   * Generate registration options for WebAuthn
   */
  async generateRegistrationOptions(
    userId: string,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const existingPasskeys = await this.prisma.passkey.findMany({
      where: { userId },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: isoUint8Array.fromUTF8String(user.id),
      userName: user.email || user.did,
      userDisplayName: user.name || user.email || 'User',
      attestationType: this.attestationType,
      excludeCredentials: existingPasskeys.length > 0 ? existingPasskeys.map((passkey) => ({
        id: passkey.credentialId,
        type: 'public-key' as const,
        transports: ['internal'] as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid')[],
      })) : undefined,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.redis.set(
      REGISTRATION_KEY(userId),
      options.challenge,
      CHALLENGE_TTL_SECONDS,
    );

    (options as { hints?: string[] }).hints = ['client-device'];

    return options;
  }

  /**
   * Verify registration response and save passkey.
   *
   * The expected challenge is read from Redis (where it was stored when
   * `generateRegistrationOptions` was called) — never from the client.
   */
  async verifyRegistrationResponse(
    userId: string,
    response: RegistrationResponseJSON,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const expectedChallenge = await this.redis.getDel(REGISTRATION_KEY(userId));
    if (!expectedChallenge) {
      throw new UnauthorizedException(
        'Registration challenge expired or not found — call options endpoint again',
      );
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration verification failed');
    }

    const { credential } = verification.registrationInfo;

    const credentialIdToStore = typeof credential.id === 'string'
      ? credential.id
      : isoBase64URL.fromBuffer(credential.id);

    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64');

    const passkey = await this.prisma.passkey.create({
      data: {
        userId,
        credentialId: credentialIdToStore,
        publicKey: publicKeyBase64,
        counter: credential.counter,
        transports: response.response.transports || [],
      },
    });

    return {
      verified: true,
      passkeyId: passkey.id,
    };
  }

  /**
   * Generate authentication options for WebAuthn
   */
  async generateAuthenticationOptions(
    email?: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    let allowCredentials = undefined;

    if (email) {
      const user = await this.prisma.user.findUnique({ where: { email } });
      if (user) {
        const passkeys = await this.prisma.passkey.findMany({
          where: { userId: user.id },
        });

        if (passkeys.length > 0) {
          allowCredentials = passkeys.map((passkey) => {
            const transports = (passkey.transports as string[])?.length > 0
              ? passkey.transports as string[]
              : ['internal'];

            return {
              id: passkey.credentialId,
              type: 'public-key' as const,
              transports: transports as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid')[],
            };
          });
        }
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

    // Authentication is pre-identification — there's no userId to key the
    // challenge by. Use the challenge itself as the key; the verify path
    // extracts the challenge from the client's signed assertion and
    // atomically getDel's the matching key.
    await this.redis.set(
      AUTHENTICATION_KEY(options.challenge),
      '1',
      CHALLENGE_TTL_SECONDS,
    );

    (options as { hints?: string[] }).hints = ['client-device'];

    return options;
  }

  /**
   * Verify authentication response.
   *
   * The challenge is extracted from the client's signed assertion
   * (clientDataJSON) and looked up in Redis. If it isn't present, the
   * challenge was never issued by this server, already consumed, or
   * expired — assertion is rejected. This is what makes WebAuthn
   * assertions unreplayable.
   */
  async verifyAuthenticationResponse(
    response: AuthenticationResponseJSON,
  ) {
    const expectedChallenge = this.extractChallengeFromResponse(response);
    const stored = await this.redis.getDel(AUTHENTICATION_KEY(expectedChallenge));
    if (!stored) {
      throw new UnauthorizedException(
        'Authentication challenge expired, already used, or never issued',
      );
    }

    const credentialIdBase64Url = response.id;

    // Primary lookup - direct match with stored base64url
    let passkey = await this.prisma.passkey.findUnique({
      where: { credentialId: credentialIdBase64Url },
      include: { user: true },
    });

    // Fallback: try base64 format (for old passkeys stored before fix)
    if (!passkey) {
      const credentialIdBase64 = credentialIdBase64Url
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        + '='.repeat((4 - credentialIdBase64Url.length % 4) % 4);

      passkey = await this.prisma.passkey.findUnique({
        where: { credentialId: credentialIdBase64 },
        include: { user: true },
      });
    }

    if (!passkey) {
      throw new BadRequestException('Passkey not found. You may need to register a new passkey for this account.');
    }

    const publicKeyBuffer = Buffer.from(passkey.publicKey, 'base64');

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(publicKeyBuffer),
        counter: passkey.counter,
      },
    });

    if (!verification.verified) {
      throw new BadRequestException('Passkey authentication verification failed');
    }

    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter > 0 && newCounter <= passkey.counter) {
      throw new BadRequestException(
        'Authenticator counter did not increase — possible cloned device detected',
      );
    }

    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });

    return {
      verified: true,
      user: passkey.user,
    };
  }

  /**
   * Get user's passkeys
   */
  async getUserPasskeys(userId: string) {
    return await this.prisma.passkey.findMany({
      where: { userId },
      select: { id: true, deviceType: true, deviceName: true, createdAt: true, lastUsedAt: true },
    });
  }

  /**
   * Delete passkey
   */
  async deletePasskey(userId: string, passkeyId: string) {
    const passkey = await this.prisma.passkey.findFirst({
      where: { id: passkeyId, userId },
    });

    if (!passkey) {
      throw new BadRequestException('Passkey not found');
    }

    await this.prisma.passkey.delete({ where: { id: passkeyId } });
  }
}
