/**
 * Naming and gating for first-use workspace provisioning.
 *
 * The identifier shape is load-bearing rather than cosmetic: it becomes
 * the `org` claim, and resource servers validate that claim against a
 * narrow charset (brain: `^[A-Za-z0-9_-]{1,64}$`). A raw user id — a DID,
 * with colons — fails it, which is the whole reason this derivation
 * exists.
 */
import {
  isPersonalWorkspace,
  personalWorkspaceCompanyId,
  personalWorkspaceSlug,
  requestsProvisioningVertical,
} from '../personal-workspace';

const DID = 'did:inite:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';

describe('personalWorkspaceCompanyId', () => {
  it('produces an identifier a resource server will accept', () => {
    const companyId = personalWorkspaceCompanyId(DID);
    expect(companyId).toMatch(/^co_u_[0-9a-f]{16}$/);
    // The charset brain enforces on the org claim.
    expect(companyId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('is deterministic, so a race re-reads instead of forking the tenant', () => {
    expect(personalWorkspaceCompanyId(DID)).toBe(personalWorkspaceCompanyId(DID));
    expect(personalWorkspaceCompanyId(DID)).not.toBe(personalWorkspaceCompanyId(`${DID}-other`));
  });

  it('keeps the slug in lockstep and slug-shaped', () => {
    const slug = personalWorkspaceSlug(DID);
    expect(slug).toBe(personalWorkspaceCompanyId(DID).replace(/_/g, '-'));
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('recognises its own workspaces', () => {
    expect(isPersonalWorkspace(personalWorkspaceCompanyId(DID))).toBe(true);
    expect(isPersonalWorkspace('acme')).toBe(false);
  });
});

describe('requestsProvisioningVertical', () => {
  it('only fires for a vertical that provisions', () => {
    expect(requestsProvisioningVertical('openid profile brain:read')).toBe(true);
    expect(requestsProvisioningVertical('brain:write')).toBe(true);
  });

  it('leaves every other product unchanged', () => {
    expect(requestsProvisioningVertical('openid profile email')).toBe(false);
    expect(requestsProvisioningVertical('club:read')).toBe(false);
    expect(requestsProvisioningVertical(undefined)).toBe(false);
    expect(requestsProvisioningVertical('')).toBe(false);
    // Not a prefix match on the whole string — the scope itself must be ours.
    expect(requestsProvisioningVertical('notbrain:read')).toBe(false);
  });
});
