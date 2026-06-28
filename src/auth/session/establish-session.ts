import { Request, Response } from 'express';
import * as signature from 'cookie-signature';

/**
 * Regenerate the session, bind the user + amr, and set the signed `inite.sid`
 * cookie. Shared by every login controller that establishes a first-party
 * session (OTP, SIWE wallet, …) so the cookie/session contract lives in one
 * place (avoids duplicate-function drift between controllers).
 */
export async function establishSession(
  req: Request,
  res: Response,
  bind: { sessionSecret: string; userId: string; amr: string[] },
): Promise<void> {
  const session = (req as any).session;
  if (!session) return;
  await new Promise<void>((resolve, reject) => {
    session.regenerate((err: any) => {
      if (err) return reject(err);
      session.userId = bind.userId;
      session.amr = bind.amr;
      session.save((saveErr: any) => {
        if (saveErr) return reject(saveErr);
        const signed = 's:' + signature.sign(session.id, bind.sessionSecret);
        res.cookie('inite.sid', signed, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: '/',
        });
        resolve();
      });
    });
  });
}
