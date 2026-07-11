import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SamlAdminService } from '../saml-admin.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { FieldCrypto } from '../../../common/field-crypto';
import { AdminScope } from '../../../admin/admin-scope';

const SUPERADMIN: AdminScope = { kind: 'superadmin' };
const SCOPED: AdminScope = { kind: 'scoped', companyId: 'co-1' };

const dto = {
  companyId: 'co-1',
  slug: 'acme',
  displayName: 'Acme IdP',
  idpEntityId: 'https://idp/entity',
  idpSsoUrl: 'https://idp/sso',
  idpCert: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
};

function setup() {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    samlConnection: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return { id: 'c1', createdAt: new Date('2026-01-01T00:00:00Z'), ...data };
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  // Real FieldCrypto with a test key so encrypt actually runs.
  const crypto = FieldCrypto.fromEnv('a'.repeat(64));
  const svc = new SamlAdminService(prisma as unknown as PrismaService, crypto);
  return { svc, prisma, created, crypto };
}

describe('SamlAdminService', () => {
  it('encrypts the IdP cert at rest and never returns it', async () => {
    const { svc, created, crypto } = setup();
    const view = await svc.create(SUPERADMIN, dto);
    expect(view).not.toHaveProperty('idpCert');
    expect(view).not.toHaveProperty('idpCertEnc');
    const stored = created[0]!.idpCertEnc as string;
    expect(FieldCrypto.isEncrypted(stored)).toBe(true);
    expect(crypto.decrypt(stored)).toBe(dto.idpCert);
  });

  it('rejects creating a connection outside the caller tenant', async () => {
    const { svc } = setup();
    await expect(
      svc.create(SCOPED, { ...dto, companyId: 'other-co' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409s on a duplicate slug', async () => {
    const { svc, prisma } = setup();
    prisma.samlConnection.findUnique.mockResolvedValue({ id: 'x' });
    await expect(svc.create(SUPERADMIN, dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('scopes list to the caller tenant', async () => {
    const { svc, prisma } = setup();
    await svc.list(SCOPED);
    expect(prisma.samlConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'co-1' } }),
    );
  });

  it('404s when removing a connection outside scope', async () => {
    const { svc, prisma } = setup();
    prisma.samlConnection.findFirst.mockResolvedValue(null);
    await expect(svc.remove(SCOPED, 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
