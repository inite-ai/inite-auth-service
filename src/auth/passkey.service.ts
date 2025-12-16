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
} from '@simplewebauthn/server';
import { Passkey, User } from '../database/entities';

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
      userID: user.id,
      userName: user.email || user.did,
      userDisplayName: user.name || user.email || 'User',
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: Buffer.from(passkey.credentialId, 'base64'),
        type: 'public-key',
        transports: passkey.transports as any,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

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

    const { credentialPublicKey, credentialID, counter } =
      verification.registrationInfo;

    // Save passkey
    const passkey = this.passkeyRepository.create({
      userId,
      credentialId: Buffer.from(credentialID).toString('base64'),
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      counter,
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
    let allowCredentials = undefined;

    // If email is provided, only allow passkeys for that user
    if (email) {
      const user = await this.userRepository.findOne({ where: { email } });
      if (user) {
        const passkeys = await this.passkeyRepository.find({
          where: { userId: user.id },
        });

        allowCredentials = passkeys.map((passkey) => ({
          id: Buffer.from(passkey.credentialId, 'base64'),
          type: 'public-key' as const,
          transports: passkey.transports as any,
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
      allowCredentials,
    });

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
    const credentialId = Buffer.from(response.id, 'base64url').toString('base64');
    const passkey = await this.passkeyRepository.findOne({
      where: { credentialId },
      relations: ['user'],
    });

    if (!passkey) {
      throw new BadRequestException('Passkey not found');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      authenticator: {
        credentialID: Buffer.from(passkey.credentialId, 'base64'),
        credentialPublicKey: Buffer.from(passkey.publicKey, 'base64'),
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

