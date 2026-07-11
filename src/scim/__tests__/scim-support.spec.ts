import { ForbiddenException } from '@nestjs/common';
import { User, Membership } from '@prisma/client';
import {
  resolveScimTenant,
  parseEqFilter,
  toScimUser,
  activeFromPatch,
  formatName,
} from '../scim-support';

describe('scim-support', () => {
  describe('resolveScimTenant', () => {
    it('returns the companyId for a tenant-scoped token', () => {
      expect(resolveScimTenant({ kind: 'machine', companyId: 'co-1' })).toBe('co-1');
    });
    it('throws when the token has no companyId', () => {
      expect(() => resolveScimTenant({ kind: 'machine' })).toThrow(ForbiddenException);
      expect(() => resolveScimTenant(undefined)).toThrow(ForbiddenException);
    });
  });

  describe('parseEqFilter', () => {
    it('parses userName eq', () => {
      expect(parseEqFilter('userName eq "a@b.com"')).toEqual({
        attribute: 'username',
        value: 'a@b.com',
      });
    });
    it('parses externalId eq', () => {
      expect(parseEqFilter('externalId eq "ext-9"')).toEqual({
        attribute: 'externalid',
        value: 'ext-9',
      });
    });
    it('returns null for unsupported or absent filters', () => {
      expect(parseEqFilter(undefined)).toBeNull();
      expect(parseEqFilter('displayName co "x"')).toBeNull();
    });
  });

  describe('activeFromPatch', () => {
    it('reads a targeted active replace', () => {
      expect(activeFromPatch([{ op: 'replace', path: 'active', value: false }])).toBe(false);
    });
    it('reads an untargeted active replace (Okta shape)', () => {
      expect(activeFromPatch([{ op: 'replace', value: { active: true } }])).toBe(true);
    });
    it('coerces the string "false" Okta sometimes sends', () => {
      expect(activeFromPatch([{ op: 'replace', path: 'active', value: 'false' }])).toBe(false);
    });
    it('returns undefined when no op touches active', () => {
      expect(activeFromPatch([{ op: 'replace', path: 'displayName', value: 'x' }])).toBeUndefined();
      expect(activeFromPatch(undefined)).toBeUndefined();
    });
  });

  describe('formatName', () => {
    it('prefers formatted, then displayName, then given+family', () => {
      expect(formatName({ name: { formatted: 'Ada L' } })).toBe('Ada L');
      expect(formatName({ displayName: 'Ada' })).toBe('Ada');
      expect(formatName({ name: { givenName: 'Ada', familyName: 'Lovelace' } })).toBe('Ada Lovelace');
      expect(formatName({})).toBeUndefined();
    });
  });

  describe('toScimUser', () => {
    const user = {
      id: 'u1',
      did: 'did:key:abc',
      email: 'a@b.com',
      name: 'Ada',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    } as unknown as User;

    it('maps a user + active membership to the SCIM shape', () => {
      const scim = toScimUser(
        user,
        { status: 'active', externalId: 'ext-1' } as Membership,
        'https://auth.example.com',
      );
      expect(scim.id).toBe('u1');
      expect(scim.userName).toBe('a@b.com');
      expect(scim.externalId).toBe('ext-1');
      expect(scim.active).toBe(true);
      expect(scim.emails).toEqual([{ value: 'a@b.com', primary: true }]);
      expect(scim.meta.location).toBe('https://auth.example.com/scim/v2/Users/u1');
    });

    it('reports active=false for an inactive membership', () => {
      const scim = toScimUser(user, { status: 'inactive', externalId: null } as Membership, 'https://x');
      expect(scim.active).toBe(false);
      expect(scim.externalId).toBeUndefined();
    });
  });
});
