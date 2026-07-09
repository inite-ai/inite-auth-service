import { ForbiddenException } from '@nestjs/common';
import { SsfController } from '../ssf.controller';
import { SsfStreamService } from '../ssf-stream.service';
import { SsfDeliveryService } from '../ssf-delivery.service';
import { SsfEmitterService } from '../ssf-emitter.service';
import type { AuthenticatedUser } from '../../auth/authenticated-user';

/**
 * SsfController scope() gate + delegation. verify/poll first resolve the
 * stream (tenant-scoped) then hand off to the emitter / delivery service.
 */
describe('SsfController', () => {
  const admin = {
    kind: 'user',
    userId: 'u1',
    metadata: { roles: ['superadmin'] },
  } as unknown as AuthenticatedUser;

  const nonAdmin = {
    kind: 'user',
    userId: 'u2',
    metadata: { roles: [] },
  } as unknown as AuthenticatedUser;

  let streams: jest.Mocked<SsfStreamService>;
  let delivery: jest.Mocked<SsfDeliveryService>;
  let emitter: jest.Mocked<SsfEmitterService>;
  let controller: SsfController;

  beforeEach(() => {
    streams = {
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue({ id: 's1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SsfStreamService>;
    delivery = {
      poll: jest.fn().mockResolvedValue(['set1']),
    } as unknown as jest.Mocked<SsfDeliveryService>;
    emitter = {
      verify: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SsfEmitterService>;
    controller = new SsfController(streams, delivery, emitter);
  });

  it('rejects a non-admin principal with Forbidden', () => {
    expect(() => controller.list(nonAdmin)).toThrow(ForbiddenException);
    expect(streams.list).not.toHaveBeenCalled();
  });

  it('create delegates with scope + dto', async () => {
    const dto = { delivery_method: 'poll', events: [] } as never;
    await controller.create(admin, dto);
    expect(streams.create).toHaveBeenCalledWith({ kind: 'superadmin' }, dto);
  });

  it('remove awaits + returns success', async () => {
    await expect(controller.remove(admin, 's1')).resolves.toEqual({ success: true });
    expect(streams.remove).toHaveBeenCalledWith({ kind: 'superadmin' }, 's1');
  });

  it('verify resolves the stream then emits a verification SET', async () => {
    await expect(controller.verify(admin, 's1')).resolves.toEqual({ status: 'sent' });
    expect(streams.get).toHaveBeenCalledWith({ kind: 'superadmin' }, 's1');
    expect(emitter.verify).toHaveBeenCalledWith({ id: 's1' });
  });

  it('poll passes acks + maxEvents with defaults applied', async () => {
    await expect(controller.poll(admin, 's1', {} as never)).resolves.toEqual({ sets: ['set1'] });
    expect(delivery.poll).toHaveBeenCalledWith('s1', [], 20);
  });

  it('poll forwards explicit acks + maxEvents', async () => {
    await controller.poll(admin, 's1', { acks: ['a1'], maxEvents: 5 } as never);
    expect(delivery.poll).toHaveBeenCalledWith('s1', ['a1'], 5);
  });
});
