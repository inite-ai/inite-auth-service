import { NotFoundException } from '@nestjs/common';
import { SsfStreamService } from '../ssf-stream.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminScope } from '../../admin/admin-scope';

const SUPERADMIN: AdminScope = { kind: 'superadmin' };
const SCOPED: AdminScope = { kind: 'scoped', companyId: 'acme' };

describe('SsfStreamService.setStatus', () => {
  let prisma: {
    ssfStream: { findFirst: jest.Mock; update: jest.Mock };
  };
  let service: SsfStreamService;

  beforeEach(() => {
    prisma = {
      ssfStream: {
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 's-db', ...data })),
      },
    };
    service = new SsfStreamService(prisma as unknown as PrismaService);
  });

  it('disables a stream by id after resolving it in scope', async () => {
    prisma.ssfStream.findFirst.mockResolvedValue({ id: 's-db', streamId: 's1' });
    const out = await service.setStatus(SUPERADMIN, 's1', 'disabled');
    expect(prisma.ssfStream.update).toHaveBeenCalledWith({
      where: { id: 's-db' },
      data: { status: 'disabled' },
    });
    expect(out.status).toBe('disabled');
  });

  it('re-enables a stream', async () => {
    prisma.ssfStream.findFirst.mockResolvedValue({ id: 's-db', streamId: 's1' });
    await service.setStatus(SUPERADMIN, 's1', 'enabled');
    expect(prisma.ssfStream.update).toHaveBeenCalledWith({
      where: { id: 's-db' },
      data: { status: 'enabled' },
    });
  });

  it('404s (via get) when the stream is out of scope', async () => {
    prisma.ssfStream.findFirst.mockResolvedValue(null);
    await expect(service.setStatus(SCOPED, 'missing', 'disabled')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.ssfStream.update).not.toHaveBeenCalled();
  });
});
