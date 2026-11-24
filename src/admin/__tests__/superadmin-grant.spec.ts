import { planGrant, preflight, type SuperadminRow } from '../superadmin-grant';

const row = (over: Partial<SuperadminRow> = {}): SuperadminRow => ({
  id: 'u1',
  email: 'owner@example.com',
  emailVerified: true,
  metadata: { roles: ['user', 'admin'], isAdmin: true, theme: 'dark' },
  ...over,
});

/**
 * The superadmin grant is the way in when nobody can reach the console, so it
 * must name one account exactly and never invent one.
 */
describe('planGrant', () => {
  it('adds the role and keeps everything else in metadata', () => {
    expect(planGrant([row()], { id: 'u1', email: 'owner@example.com' })).toEqual({
      kind: 'grant',
      id: 'u1',
      metadata: { roles: ['user', 'admin', 'superadmin'], isAdmin: true, theme: 'dark' },
    });
  });

  it('is idempotent', () => {
    const held = row({ metadata: { roles: ['superadmin'] } });
    expect(planGrant([held], { id: 'u1', email: 'owner@example.com' }).kind).toBe('already');
  });

  it.each([
    ['no such id', [row()], { id: 'u2', email: 'owner@example.com' }],
    ['an email that is not that account', [row()], { id: 'u1', email: 'other@example.com' }],
    ['an unverified email', [row({ emailVerified: false })], { id: 'u1', email: 'owner@example.com' }],
    ['no email given', [row()], { id: 'u1', email: '' }],
    ['no id given', [row()], { id: '', email: 'owner@example.com' }],
    ['an account with no email', [row({ email: null })], { id: 'u1', email: '' }],
  ])('refuses %s', (_name, rows, target) => {
    expect(planGrant(rows, target).kind).toBe('refuse');
  });

  it('makes a roles array when the account has none', () => {
    expect(planGrant([row({ metadata: null })], { id: 'u1', email: 'owner@example.com' })).toMatchObject({
      metadata: { roles: ['superadmin'] },
    });
  });
});

describe('preflight', () => {
  it('fails while admins exist and nobody verified holds the role', () => {
    expect(preflight([row()]).ok).toBe(false);
    expect(preflight([row(), row({ id: 'u2', emailVerified: false, metadata: { roles: ['superadmin'] } })]).ok).toBe(false);
  });

  it('passes once a verified account holds the role, and lists who loses access', () => {
    const result = preflight([row(), row({ id: 'u2', metadata: { roles: ['superadmin'] } })]);
    expect(result.ok).toBe(true);
    expect(result.holders.map((r) => r.id)).toEqual(['u2']);
    expect(result.losing.map((r) => r.id)).toEqual(['u1']);
  });

  it('passes on a fresh database, where create-admin has not run yet', () => {
    expect(preflight([]).ok).toBe(true);
    expect(preflight([row({ metadata: { roles: ['user'] } })]).ok).toBe(true);
  });
});
