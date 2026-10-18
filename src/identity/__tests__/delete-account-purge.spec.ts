import { IdentityAccountService } from '../identity-account.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { IdentityService } from '../identity.service';
import { SsfEmitterService } from '../../ssf/ssf-emitter.service';
import { CAEP_EVENTS } from '../../ssf/caep-event-types';

/**
 * A relying party keeps its own copy of the user keyed by DID. Deleting the
 * account here is only half a deletion unless they are told, so the purge
 * signal is part of the contract of deleteAccount.
 */
describe('IdentityAccountService.deleteAccount → account-purged', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  function build(user: { id: string; did: string | null; passwordHash: string | null } | null) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const ssf = { emit: jest.fn().mockResolvedValue(undefined) };
    const service = new IdentityAccountService(
      prisma as unknown as PrismaService,
      {} as EmailService,
      {} as IdentityService,
      ssf as unknown as SsfEmitterService,
    );
    return { service, prisma, ssf };
  }

  it('emits account-purged with the DID after deleting', async () => {
    const { service, prisma, ssf } = build({ id: userId, did: 'did:key:abc', passwordHash: null });

    await service.deleteAccount(userId, '');

    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: userId } });
    expect(ssf.emit).toHaveBeenCalledWith({
      eventType: CAEP_EVENTS.accountPurged,
      subject: 'did:key:abc',
      claims: { reason: 'user_delete' },
    });
  });

  it('emits nothing when the password check stops the delete', async () => {
    // bcrypt hash of a different password — compare fails.
    const { service, prisma, ssf } = build({
      id: userId,
      did: 'did:key:abc',
      passwordHash: '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.QZ5i5L9o1m8KJ6m6U5zJ8y3L4N6e',
    });

    await expect(service.deleteAccount(userId, 'wrong')).rejects.toThrow();
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(ssf.emit).not.toHaveBeenCalled();
  });

  it('still deletes when no SSF transmitter is wired', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: userId, did: 'did:key:abc', passwordHash: null }),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new IdentityAccountService(
      prisma as unknown as PrismaService,
      {} as EmailService,
      {} as IdentityService,
    );
    await service.deleteAccount(userId, '');
    expect(prisma.user.delete).toHaveBeenCalled();
  });
});
