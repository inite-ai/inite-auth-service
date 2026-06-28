import { StepUpService } from '../step-up.service';

/**
 * Coverage for acr/AAL math + the RFC 9470 resource-server challenge.
 */
describe('StepUpService', () => {
  const svc = new StepUpService();

  describe('sessionRank', () => {
    it('ranks a passkey session as phishing-resistant (3)', () => {
      expect(svc.sessionRank(['fido'])).toBe(3);
    });
    it('ranks two distinct factors as AAL2', () => {
      expect(svc.sessionRank(['pwd', 'otp'])).toBe(2);
    });
    it('ranks a single weak factor as AAL1', () => {
      expect(svc.sessionRank(['pwd'])).toBe(1);
      expect(svc.sessionRank(['magic-link'])).toBe(1);
      expect(svc.sessionRank(['otp'])).toBe(1);
    });
    it('ranks an empty amr as 0', () => {
      expect(svc.sessionRank([])).toBe(0);
    });
  });

  describe('isSatisfied', () => {
    it('passes when no enforceable acr is requested', () => {
      expect(svc.isSatisfied(['pwd'], undefined)).toBe(true);
      expect(svc.isSatisfied(['pwd'], 'some-custom-rp-value')).toBe(true);
    });
    it('fails when a single-factor session is asked for mfa/aal2', () => {
      expect(svc.isSatisfied(['pwd'], 'aal2')).toBe(false);
      expect(svc.isSatisfied(['pwd'], 'mfa')).toBe(false);
    });
    it('passes when the session meets or exceeds the requested rank', () => {
      expect(svc.isSatisfied(['pwd', 'otp'], 'aal2')).toBe(true);
      expect(svc.isSatisfied(['fido'], 'aal2')).toBe(true); // phr exceeds aal2
      expect(svc.isSatisfied(['fido'], 'phr')).toBe(true);
    });
    it('fails when a multifactor session is asked for phishing-resistant', () => {
      expect(svc.isSatisfied(['pwd', 'otp'], 'phr')).toBe(false);
    });
    it('honours the max rank across a space-separated acr_values list', () => {
      // contains aal2 → required rank 2
      expect(svc.isSatisfied(['pwd'], 'unknown aal2')).toBe(false);
      expect(svc.isSatisfied(['pwd', 'otp'], 'unknown aal2')).toBe(true);
    });
  });

  describe('achievedAcr', () => {
    it('maps session factors to a canonical acr', () => {
      expect(svc.achievedAcr(['fido'])).toBe('phr');
      expect(svc.achievedAcr(['pwd', 'otp'])).toBe('aal2');
      expect(svc.achievedAcr(['pwd'])).toBe('aal1');
      expect(svc.achievedAcr([])).toBeUndefined();
    });
  });

  describe('challengeHeader (RFC 9470)', () => {
    it('builds an insufficient_user_authentication Bearer challenge', () => {
      const header = svc.challengeHeader({ acrValues: 'aal2', maxAge: 0 });
      expect(header).toContain('Bearer');
      expect(header).toContain('error="insufficient_user_authentication"');
      expect(header).toContain('acr_values="aal2"');
      expect(header).toContain('max_age=0');
    });
  });
});
