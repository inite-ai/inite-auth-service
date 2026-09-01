import { readPendingEmailChange } from '../pending-email-change';
import { generateBackupCodes, countBackupCodes } from '../backup-codes';

describe('readPendingEmailChange', () => {
  const future = () => new Date(Date.now() + 60_000).toISOString();
  const past = () => new Date(Date.now() - 60_000).toISOString();

  it('projects a live pending change', () => {
    const result = readPendingEmailChange({
      pendingEmailChange: { newEmail: 'new@example.com', token: 'secret', expires: future() },
    });

    expect(result).toEqual({
      newEmail: 'new@example.com',
      expiresAt: expect.any(String),
    });
  });

  it('never projects the redemption token', () => {
    const result = readPendingEmailChange({
      pendingEmailChange: { newEmail: 'new@example.com', token: 'secret', expires: future() },
    });

    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('treats a lapsed change as absent', () => {
    expect(
      readPendingEmailChange({
        pendingEmailChange: { newEmail: 'new@example.com', token: 't', expires: past() },
      }),
    ).toBeNull();
  });

  it.each([
    ['null metadata', null],
    ['metadata without the key', { somethingElse: 1 }],
    ['a non-object entry', { pendingEmailChange: 'nope' }],
    ['a missing newEmail', { pendingEmailChange: { expires: new Date().toISOString() } }],
    ['an unparseable expiry', { pendingEmailChange: { newEmail: 'a@b.c', expires: 'soon' } }],
  ])('returns null for %s', (_label, metadata) => {
    expect(readPendingEmailChange(metadata)).toBeNull();
  });
});

describe('backup codes', () => {
  it('mints ten distinct uppercase-hex codes', () => {
    const codes = generateBackupCodes();

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((code) => expect(code).toMatch(/^[0-9A-F]{8}$/));
  });

  it('does not repeat a set across calls', () => {
    expect(generateBackupCodes()).not.toEqual(generateBackupCodes());
  });

  it('counts the remaining stored codes', () => {
    expect(countBackupCodes({ backupCodes: ['a', 'b', 'c'] })).toBe(3);
  });

  it.each([
    ['null metadata', null],
    ['no backupCodes key', { other: true }],
    ['a non-array value', { backupCodes: 'AAAA' }],
  ])('reports zero remaining for %s', (_label, metadata) => {
    expect(countBackupCodes(metadata)).toBe(0);
  });
});
