import { omit, stripUserSecrets, stripClientSecret } from '../sanitize';

describe('sanitize', () => {
  describe('omit', () => {
    it('removes the listed keys and keeps the rest', () => {
      const out = omit({ a: 1, b: 2, c: 3 }, ['b']);
      expect(out).toEqual({ a: 1, c: 3 });
      expect('b' in out).toBe(false);
    });

    it('returns a shallow copy — does not mutate the input', () => {
      const input = { a: 1, secret: 'x' };
      const out = omit(input, ['secret']);
      expect(input).toEqual({ a: 1, secret: 'x' });
      expect(out).not.toBe(input);
    });

    it('drops multiple keys', () => {
      expect(omit({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ b: 2 });
    });
  });

  it('stripUserSecrets removes passwordHash only', () => {
    const out = stripUserSecrets({ id: 'u1', email: 'a@b.com', passwordHash: 'bcrypt' });
    expect(out).toEqual({ id: 'u1', email: 'a@b.com' });
    expect('passwordHash' in out).toBe(false);
  });

  it('stripClientSecret removes clientSecretHash only', () => {
    const out = stripClientSecret({ clientId: 'c1', name: 'app', clientSecretHash: 'bcrypt' });
    expect(out).toEqual({ clientId: 'c1', name: 'app' });
    expect('clientSecretHash' in out).toBe(false);
  });
});
