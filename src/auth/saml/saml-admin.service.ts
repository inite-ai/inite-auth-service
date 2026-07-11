import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldCrypto } from '../../common/field-crypto';
import { AdminScope, applyScopeFilter } from '../../admin/admin-scope';
import { CreateSamlConnectionDto } from './dto/create-saml-connection.dto';

/** A SAML connection as returned to admins — never includes the IdP cert. */
export interface SamlConnectionView {
  id: string;
  companyId: string;
  slug: string;
  displayName: string;
  enabled: boolean;
  idpEntityId: string;
  idpSsoUrl: string;
  createdAt: Date;
}

/**
 * Admin CRUD for SAML IdP connections, tenant-scoped like OrganizationsService.
 * The IdP signing certificate is FieldCrypto-encrypted on write and never
 * returned on read.
 */
@Injectable()
export class SamlAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
  ) {}

  async create(scope: AdminScope, dto: CreateSamlConnectionDto): Promise<SamlConnectionView> {
    if (scope.kind === 'scoped' && scope.companyId !== dto.companyId) {
      throw new BadRequestException('cannot create a connection outside your tenant');
    }
    const existing = await this.prisma.samlConnection.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException(`SAML connection "${dto.slug}" already exists`);

    const row = await this.prisma.samlConnection.create({
      data: {
        companyId: dto.companyId,
        slug: dto.slug,
        displayName: dto.displayName,
        enabled: dto.enabled ?? true,
        idpEntityId: dto.idpEntityId,
        idpSsoUrl: dto.idpSsoUrl,
        idpCertEnc: this.crypto.encrypt(dto.idpCert),
      },
    });
    return this.toView(row);
  }

  async list(scope: AdminScope): Promise<SamlConnectionView[]> {
    const where: Record<string, unknown> = {};
    applyScopeFilter(scope, where);
    const rows = await this.prisma.samlConnection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toView(r));
  }

  async remove(scope: AdminScope, id: string): Promise<void> {
    const where: Record<string, unknown> = { id };
    applyScopeFilter(scope, where);
    const row = await this.prisma.samlConnection.findFirst({ where });
    if (!row) throw new NotFoundException('SAML connection not found');
    await this.prisma.samlConnection.delete({ where: { id: row.id } });
  }

  private toView(row: {
    id: string;
    companyId: string;
    slug: string;
    displayName: string;
    enabled: boolean;
    idpEntityId: string;
    idpSsoUrl: string;
    createdAt: Date;
  }): SamlConnectionView {
    return {
      id: row.id,
      companyId: row.companyId,
      slug: row.slug,
      displayName: row.displayName,
      enabled: row.enabled,
      idpEntityId: row.idpEntityId,
      idpSsoUrl: row.idpSsoUrl,
      createdAt: row.createdAt,
    };
  }
}
