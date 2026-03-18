import { Injectable, BadRequestException } from '@nestjs/common';
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
} from '@simplewebauthn/types';
import { isoUint8Array, isoBase64URL } from '@simplewebauthn/server/helpers';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PasskeyService {
  private rpName: string;
  private rpID: string;
  private origin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.rpName = this.configService.get<string>('RP_NAME', 'INITE Identity');
    this.rpID = this.configService.get<string>('RP_ID', 'inite.ai');
    this.origin = this.configService.get<string>('RP_ORIGIN', 'https://auth.inite.ai');
  }

  /**
   * Generate registration options for WebAuthn
   */
  async generateRegistrationOptions(userId: string) {
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
      attestationType: 'none',
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

    (options as any).hints = ['client-device'];

    return options;
  }

  /**
   * Verify registration response and save passkey
   */
  async verifyRegistrationResponse(
    userId: string,
    response: RegistrationResponseJSON,
    expectedChallenge: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
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
  async generateAuthenticationOptions(email?: string) {
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

    (options as any).hints = ['client-device'];

    return options;
  }

  /**
   * Verify authentication response
   */
  async verifyAuthenticationResponse(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
  ) {
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
