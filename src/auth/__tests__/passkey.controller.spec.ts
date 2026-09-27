import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PasskeyController } from '../passkey.controller';
import type { AuthService } from '../auth.service';
import type { PasskeyService } from '../passkey.service';
import { establishSession } from '../session/establish-session';

jest.mock('../session/establish-session', () => ({
  establishSession: jest.fn().mockResolvedValue(undefined),
}));

const user = { id: 'user-1', did: 'did:key:z6Mk', email: 'a@example.com', emailVerified: true, name: 'A' };

function build(userVerified: boolean) {
  const passkeyService = {
    generateAuthenticationOptions: jest.fn().mockResolvedValue({ challenge: 'c' }),
    verifyAuthenticationResponse: jest.fn().mockResolvedValue({ verified: true, user, userVerified }),
  } as unknown as PasskeyService;
  const authService = {
    generateTokenForUser: jest.fn().mockReturnValue('token'),
    notifyNewDeviceIfNeeded: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  const config = { get: (k: string) => (k === 'SESSION_SECRET' ? 'secret' : undefined) } as unknown as ConfigService;
  return { controller: new PasskeyController(authService, passkeyService, config), passkeyService };
}

const req = { get: () => 'ua', headers: {}, ip: '127.0.0.1', socket: {} } as unknown as Request;
const res = {} as Response;

describe('PasskeyController', () => {
  beforeEach(() => (establishSession as jest.Mock).mockClear());

  it('has no unauthenticated way to create an account', () => {
    // prepare-registration minted an account with emailVerified: true for any
    // unclaimed address. New passkey accounts start with the email code now.
    expect((PasskeyController.prototype as unknown as Record<string, unknown>).preparePasskeyRegistration).toBeUndefined();
  });

  it('signs in through the shared session contract, regenerating the session', async () => {
    const { controller } = build(true);
    const body = await controller.verifyAuthentication({ response: {} } as never, req, res);
    expect(establishSession).toHaveBeenCalledWith(req, res, expect.objectContaining({ userId: 'user-1' }));
    expect(body).toMatchObject({ verified: true, access_token: 'token' });
  });

  it('records mfa only when the authenticator verified the user', async () => {
    await build(true).controller.verifyAuthentication({ response: {} } as never, req, res);
    expect((establishSession as jest.Mock).mock.calls[0][2].amr).toEqual(['fido', 'mfa']);

    await build(false).controller.verifyAuthentication({ response: {} } as never, req, res);
    expect((establishSession as jest.Mock).mock.calls[1][2].amr).toEqual(['fido']);
  });

  it('does not scope sign-in options to an email', async () => {
    const { controller, passkeyService } = build(true);
    await controller.generateAuthenticationOptions({ email: 'a@example.com' });
    expect(passkeyService.generateAuthenticationOptions).toHaveBeenCalledWith();
  });
});
