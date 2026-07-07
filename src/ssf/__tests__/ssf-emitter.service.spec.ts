import { SsfEmitterService } from '../ssf-emitter.service';
import { CAEP_EVENTS } from '../caep-event-types';

describe('SsfEmitterService', () => {
  let prisma: any;
  let builder: any;
  let push: any;
  let service: SsfEmitterService;

  beforeEach(() => {
    prisma = {
      ssfStream: { findMany: jest.fn().mockResolvedValue([]) },
      setDelivery: { create: jest.fn().mockResolvedValue({ id: 'd1' }) },
    };
    builder = { build: jest.fn().mockResolvedValue({ jwt: 'jwt', jti: 'jti1' }) };
    push = { deliver: jest.fn().mockResolvedValue(undefined) };
    service = new SsfEmitterService(prisma, builder, push);
  });

  it('is a no-op when no streams match', async () => {
    await service.emit({ eventType: CAEP_EVENTS.sessionRevoked, subject: 'did:x', companyId: 'acme' });
    expect(prisma.setDelivery.create).not.toHaveBeenCalled();
    expect(push.deliver).not.toHaveBeenCalled();
  });

  it('queues and pushes a SET to a matching push stream', async () => {
    prisma.ssfStream.findMany.mockResolvedValue([
      { id: 's1', deliveryMethod: 'push', pushEndpointUrl: 'https://rp/ssf', pushAuthHeader: 'Bearer t', aud: ['rp'] },
    ]);
    await service.emit({ eventType: CAEP_EVENTS.sessionRevoked, subject: 'did:x', companyId: 'acme' });
    expect(prisma.setDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ streamId: 's1', jti: 'jti1' }) }),
    );
    expect(push.deliver).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://rp/ssf' }));
  });

  it('scopes the stream query to global streams when tenant-less', async () => {
    await service.emit({ eventType: CAEP_EVENTS.sessionRevoked, subject: 'did:x' });
    const where = prisma.ssfStream.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBeNull();
    expect(where.OR).toBeUndefined();
  });

  it('does not push for a poll-delivery stream (queues only)', async () => {
    prisma.ssfStream.findMany.mockResolvedValue([
      { id: 's2', deliveryMethod: 'poll', pushEndpointUrl: null, pushAuthHeader: null, aud: [] },
    ]);
    await service.emit({ eventType: CAEP_EVENTS.sessionRevoked, subject: 'did:x', companyId: 'acme' });
    expect(prisma.setDelivery.create).toHaveBeenCalled();
    expect(push.deliver).not.toHaveBeenCalled();
  });
});
