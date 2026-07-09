import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendMagicLinkDto } from '../send-magic-link.dto';
import { LoginWithPasswordDto } from '../login-with-password.dto';
import { RegisterWithPasswordDto } from '../register-with-password.dto';
import { PasskeyResponseDto } from '../passkey-response.dto';
import { LinkWalletDto } from '../../../identity/dto/link-wallet.dto';
import { ChangePasswordDto } from '../../../identity/dto/change-password.dto';

/**
 * Regression guard for the phase-2b DTO conversion. The global ValidationPipe
 * runs whitelist + forbidNonWhitelisted, so a DTO that omits a field a real
 * client sends would 400 live traffic. Each case is the EXACT payload the
 * frontend posts — it must validate clean AND keep every field after whitelist.
 */
const PIPE = { whitelist: true, forbidNonWhitelisted: true } as const;

function check<T extends object>(cls: new () => T, payload: object): T {
  const instance = plainToInstance(cls, payload);
  const errors = validateSync(instance as object, PIPE);
  expect(errors).toHaveLength(0);
  return instance;
}

describe('phase-2b DTOs accept real frontend payloads', () => {
  it('SendMagicLinkDto — full OAuth flow (9 oauthParams keys)', () => {
    const dto = check(SendMagicLinkDto, {
      email: 'a@b.com',
      oauthParams: {
        clientId: 'c',
        redirectUri: 'https://rp/cb',
        scope: 'openid',
        state: 's',
        codeChallenge: 'cc',
        codeChallengeMethod: 'S256',
        acrValues: 'urn:mfa',
        prompt: 'login',
        resource: 'https://api',
      },
    });
    // whitelist must not strip the nested params.
    expect(Object.keys(dto.oauthParams ?? {})).toHaveLength(9);
  });

  it('SendMagicLinkDto — embed form (top-level clientId, no oauthParams)', () => {
    check(SendMagicLinkDto, { email: 'a@b.com', clientId: 'embed-client' });
  });

  it('LoginWithPasswordDto / RegisterWithPasswordDto', () => {
    check(LoginWithPasswordDto, { email: 'a@b.com', password: 'pw' });
    check(RegisterWithPasswordDto, { email: 'a@b.com', password: 'pw', name: 'A' });
    check(RegisterWithPasswordDto, { email: 'a@b.com', password: 'pw' });
  });

  it('PasskeyResponseDto — opaque WebAuthn blob survives whitelist', () => {
    const dto = check(PasskeyResponseDto, {
      response: { id: 'x', rawId: 'y', type: 'public-key', response: { clientDataJSON: 'z' } },
    });
    expect(dto.response).toHaveProperty('rawId', 'y');
  });

  it('LinkWalletDto — EVM (no publicKey) and TON (with publicKey)', () => {
    check(LinkWalletDto, { address: '0x1', chain: 'ethereum', message: 'm', signature: 's' });
    check(LinkWalletDto, { address: 'EQ', chain: 'ton', message: 'm', signature: 's', publicKey: 'pk' });
  });

  it('ChangePasswordDto', () => {
    check(ChangePasswordDto, { currentPassword: 'a', newPassword: 'b' });
  });

  it('rejects an unknown extra field (forbidNonWhitelisted works)', () => {
    const errors = validateSync(
      plainToInstance(LoginWithPasswordDto, { email: 'a@b.com', password: 'pw', evil: 1 }) as object,
      PIPE,
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
