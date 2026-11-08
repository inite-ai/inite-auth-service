import { PrismaService } from '../prisma/prisma.service';
import { ConsentService } from './consent.service';
import { TELEGRAM_PROVIDER } from '../auth/telegram/contracts/telegram-provider';

/** The scope that asks for {@link TELEGRAM_ID_CLAIM}; first-party only (oauth-scopes.registry.ts). */
export const TELEGRAM_SCOPE = 'telegram';

/**
 * The person's numeric Telegram id, from their `telegram` OAuthIdentity
 * (subject = the Telegram user id). A string: Telegram ids pass 2^31 and some
 * clients read JSON numbers lossily.
 */
export const TELEGRAM_ID_CLAIM = 'telegram_id';

export interface TelegramClaimQuery {
  userId: string;
  clientId: string | null | undefined;
  /** The granted scope: a space-separated string or the principal's set. */
  scope: string | Iterable<string> | null | undefined;
}

type ClaimPrisma = Pick<PrismaService, 'oAuthClient' | 'oAuthIdentity'>;

function hasScope(scope: TelegramClaimQuery['scope']): boolean {
  if (!scope) return false;
  const list = typeof scope === 'string' ? scope.split(/\s+/) : [...scope];
  return list.includes(TELEGRAM_SCOPE);
}

/**
 * `{ telegram_id }` for the id_token and /userinfo, or `{}`.
 *
 * Present only when all three hold: the grant carries the `telegram` scope,
 * the client is first-party (ConsentService.isFirstParty: never a DCR, CIMD or
 * third-party client, whatever it was granted), and the person has a Telegram
 * identity. The scope check is repeated here, not left to permittedScopes, so a
 * token minted before a client lost first-party status still gets nothing.
 * Family products use it to link rows they keyed by Telegram id to the INITE
 * sub on a sign-in that is not a Mini App's (issue #299).
 */
export async function telegramIdClaim(
  prisma: ClaimPrisma,
  q: TelegramClaimQuery,
): Promise<Record<string, string>> {
  if (!q.clientId || !hasScope(q.scope)) return {};
  const client = await prisma.oAuthClient.findUnique({
    where: { clientId: q.clientId },
    select: { clientId: true, firstParty: true },
  });
  if (!client || !ConsentService.isFirstParty(client)) return {};
  const identity = await prisma.oAuthIdentity.findFirst({
    where: { userId: q.userId, provider: TELEGRAM_PROVIDER },
    select: { providerSubject: true },
    orderBy: { updatedAt: 'desc' },
  });
  return identity ? { [TELEGRAM_ID_CLAIM]: String(identity.providerSubject) } : {};
}
