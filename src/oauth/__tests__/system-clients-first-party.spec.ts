import { SystemClientsSeeder } from '../system-clients.seeder';

describe('SystemClientsSeeder.applyFirstParty', () => {
  function prisma() {
    return {
      oAuthClient: { updateMany: jest.fn().mockImplementation((args) => args) },
      $transaction: jest.fn().mockResolvedValue([{ count: 2 }, { count: 1 }]),
    };
  }

  it('leaves everything as it is when the variable is unset', async () => {
    const p = prisma();
    await new SystemClientsSeeder(p as never).applyFirstParty(undefined);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it('marks the listed clients and unmarks the rest, never a dcr_ client', async () => {
    const p = prisma();
    await new SystemClientsSeeder(p as never).applyFirstParty(
      ' inite-billing, inite-rent ,dcr_evil,',
    );
    const [on, off] = p.oAuthClient.updateMany.mock.calls.map((c) => c[0]);
    expect(on.where.clientId.in).toEqual(['inite-billing', 'inite-rent']);
    expect(on.data).toEqual({ firstParty: true });
    expect(off.where.clientId.notIn).toEqual(['inite-billing', 'inite-rent']);
    expect(off.data).toEqual({ firstParty: false });
  });
});
