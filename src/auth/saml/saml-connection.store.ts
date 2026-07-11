import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldCrypto } from '../../common/field-crypto';

/** A SAML connection with its IdP signing certificate decrypted into memory. */
export interface ResolvedSamlConnection {
  id: string;
  companyId: string;
  slug: string;
  displayName: string;
  enabled: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  /** Decrypted PEM X.509 signing certificate of the IdP. */
  idpCert: string;
}

/**
 * Read path for per-tenant SAML IdP connections. The IdP signing certificate is
 * stored FieldCrypto-encrypted at rest and decrypted here on load (same trust
 * model as federation client secrets). Metadata/ACS are cold paths, so this
 * reads Prisma directly rather than caching.
 */
@Injectable()
export class SamlConnectionStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
  ) {}

  /** Resolve an enabled connection by slug, decrypting its IdP cert. */
  async findEnabledBySlug(slug: string): Promise<ResolvedSamlConnection> {
    const row = await this.prisma.samlConnection.findUnique({ where: { slug } });
    if (!row || !row.enabled) {
      throw new NotFoundException(`no enabled SAML connection "${slug}"`);
    }
    return {
      id: row.id,
      companyId: row.companyId,
      slug: row.slug,
      displayName: row.displayName,
      enabled: row.enabled,
      idpEntityId: row.idpEntityId,
      idpSsoUrl: row.idpSsoUrl,
      idpCert: this.crypto.decrypt(row.idpCertEnc),
    };
  }
}
