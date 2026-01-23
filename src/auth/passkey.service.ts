import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { Passkey, User } from '../database/entities';
import { isoUint8Array, isoBase64URL } from '@simplewebauthn/server/helpers';

@Injectable()
export class PasskeyService {
  private rpName: string;
  private rpID: string;
  private origin: string;

  constructor(
    @InjectRepository(Passkey)
    private readonly passkeyRepository: Repository<Passkey>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {
    this.rpName = this.configService.get<string>('RP_NAME', 'INITE Identity');
    this.rpID = this.configService.get<string>('RP_ID', 'inite.ai');
    this.origin = this.configService.get<string>('RP_ORIGIN', 'https://auth.inite.ai');
  }

  /**
   * Generate registration options for WebAuthn
   * Always uses platform authenticator (Touch ID, Face ID, Windows Hello, browser keystore)
   */
  async generateRegistrationOptions(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Get existing passkeys for this user
    const existingPasskeys = await this.passkeyRepository.find({
      where: { userId },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: isoUint8Array.fromUTF8String(user.id),
      userName: user.email || user.did,
      userDisplayName: user.name || user.email || 'User',
      attestationType: 'none',
      excludeCredentials: existingPasskeys.length > 0 ? existingPasskeys.map((passkey) => {
        // Convert base64 to base64url string for excludeCredentials
        const base64Url = passkey.credentialId.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        return {
          id: base64Url,
          type: 'public-key' as const,
          // Only internal transport for platform authenticators
          transports: ['internal'] as ('usb' | 'nfc' | 'ble' | 'internal' | 'hybrid')[],
        };
      }) : undefined,
      authenticatorSelection: {
        // Platform authenticator (Touch ID, Face ID, Windows Hello, browser keystore)
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Add hints for browsers that support them (guides UI to show preferred authenticator type first)
    // 'client-device' = platform authenticators like Touch ID, Face ID, Windows Hello
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
    const user = await this.userRepository.findOne({ where: { id: userId } });
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

    // Save passkey
    const passkey = this.passkeyRepository.create({
      userId,
      credentialId: Buffer.from(credential.id).toString('base64'),
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      transports: response.response.transports || [],
    });

    await this.passkeyRepository.save(passkey);

    return {
      verified: true,
      passkeyId: passkey.id,
    };
  }

  /**
   * Generate authentication options for WebAuthn
   */
  async generateAuthenticationOptions(email?: string) {
    // If no passkey registered yet, allowCredentials stays undefined
    // This triggers discoverable credentials mode
    let allowCredentials = undefined;

    // If email provided, try to get user's passkeys
    if (email) {
      const user = await this.userRepository.findOne({ where: { email } });
      if (user) {
        const passkeys = await this.passkeyRepository.find({
          where: { userId: user.id },
        });

        if (passkeys.length > 0) {
          allowCredentials = passkeys.map((passkey) => {
            const base64Url = passkey.credentialId
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=/g, '');
            
            // Use saved transports or default to 'internal' for platform authenticators
            const transports = passkey.transports?.length > 0 
              ? passkey.transports 
              : ['internal'];
            
            return {
              id: base64Url,
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

    // Add hints for browsers that support them (guides UI to show preferred authenticator type first)
    // 'client-device' = platform authenticators like Touch ID, Face ID, Windows Hello
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
    // Find passkey by credential ID
    // Try multiple formats since different browsers/versions may encode differently
    const credentialIdBase64 = Buffer.from(response.id, 'base64url').toString('base64');
    const credentialIdBase64Url = response.id;
    
    // Also try rawId if available
    const rawIdBase64 = response.rawId 
      ? Buffer.from(response.rawId, 'base64url').toString('base64')
      : null;
    
    // Try finding with different formats
    let passkey = await this.passkeyRepository.findOne({
      where: { credentialId: credentialIdBase64 },
      relations: ['user'],
    });
    
    if (!passkey) {
      passkey = await this.passkeyRepository.findOne({
        where: { credentialId: credentialIdBase64Url },
        relations: ['user'],
      });
    }
    
    if (!passkey && rawIdBase64) {
      passkey = await this.passkeyRepository.findOne({
        where: { credentialId: rawIdBase64 },
        relations: ['user'],
      });
    }

    if (!passkey) {
      // Log for debugging
      console.error('Passkey not found. Tried formats:', {
        credentialIdBase64,
        credentialIdBase64Url,
        rawIdBase64,
        responseId: response.id,
      });
      throw new BadRequestException('Passkey not found. You may need to register a new passkey for this account.');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: isoBase64URL.toBuffer(passkey.publicKey),
        counter: Number(passkey.counter),
      },
    });

    if (!verification.verified) {
      throw new BadRequestException('Passkey authentication verification failed');
    }

    // Update counter
    passkey.counter = verification.authenticationInfo.newCounter;
    passkey.lastUsedAt = new Date();
    await this.passkeyRepository.save(passkey);

    return {
      verified: true,
      user: passkey.user,
    };
  }

  /**
   * Get user's passkeys
   */
  async getUserPasskeys(userId: string) {
    return await this.passkeyRepository.find({
      where: { userId },
      select: ['id', 'deviceType', 'deviceName', 'createdAt', 'lastUsedAt'],
    });
  }

  /**
   * Delete passkey
   */
  async deletePasskey(userId: string, passkeyId: string) {
    const passkey = await this.passkeyRepository.findOne({
      where: { id: passkeyId, userId },
    });

    if (!passkey) {
      throw new BadRequestException('Passkey not found');
    }

    await this.passkeyRepository.remove(passkey);
  }
}

