/**
 * Auto-seeds system OAuth clients at application bootstrap.
 *
 * "System" clients are the public, schema-stable identifiers that
 * INITE-shipped tools expect to exist out-of-the-box — no manual
 * provisioning. Examples:
 *
 *   - `inite-cli` — public client for the CLI login flow
 *     (authorization_code + PKCE + loopback, device_code fallback).
 *     Powers `curl -fsSL https://auth.inite.ai/login.sh | bash`.
 *
 * Idempotent: re-running just refreshes non-secret fields.
 *
 * Why a seeder, not a migration: Prisma migrations can't see runtime
 * config (env-driven secrets, optional flags). Booting the same image
 * twice — for example two replicas behind a load balancer — converges
 * safely thanks to the upsert.
 */

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

interface SystemClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  allowedGrants: string[];
  allowedAudiences: string[];
}

const SYSTEM_CLIENTS: SystemClient[] = [
  {
    clientId: 'inite-cli',
    name: 'INITE CLI',
    // RFC 8252 §7.3 — loopback. The OAuth service strips port at match time.
    redirectUris: ['http://127.0.0.1/callback'],
    allowedScopes: ['openid', 'profile', 'email'],
    allowedGrants: [
      'authorization_code',
      'urn:ietf:params:oauth:grant-type:device_code',
      'refresh_token',
    ],
    allowedAudiences: [],
  },
];

@Injectable()
export class SystemClientsSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemClientsSeeder.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const c of SYSTEM_CLIENTS) {
      try {
        await this.seedOne(c);
      } catch (err) {
        // Don't block boot — failed seed surfaces as a clearly logged error.
        this.logger.error(
          `Failed to seed system client '${c.clientId}': ${(err as Error).message}`,
        );
      }
    }
  }

  private async seedOne(c: SystemClient): Promise<void> {
    const existing = await this.prisma.oAuthClient.findUnique({
      where: { clientId: c.clientId },
    });

    if (existing) {
      // Refresh shape — do NOT touch clientSecretHash.
      await this.prisma.oAuthClient.update({
        where: { clientId: c.clientId },
        data: {
          name: c.name,
          redirectUris: c.redirectUris,
          allowedScopes: c.allowedScopes,
          allowedGrants: c.allowedGrants,
          allowedAudiences: c.allowedAudiences,
          active: true,
        },
      });
      this.logger.log(`System client '${c.clientId}' present — config refreshed.`);
      return;
    }

    // First boot: create with a throwaway secret. The CLI flow uses
    // PKCE / device_code — neither validates client_secret — so the
    // hash is never consulted. The column itself is required by schema.
    const throwaway = crypto.randomBytes(32).toString('hex');
    const clientSecretHash = await bcrypt.hash(throwaway, 10);

    await this.prisma.oAuthClient.create({
      data: {
        clientId: c.clientId,
        clientSecretHash,
        name: c.name,
        redirectUris: c.redirectUris,
        allowedScopes: c.allowedScopes,
        allowedGrants: c.allowedGrants,
        allowedAudiences: c.allowedAudiences,
        active: true,
      },
    });
    this.logger.log(`Seeded system client '${c.clientId}'.`);
  }
}
