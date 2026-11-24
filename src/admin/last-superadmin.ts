import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { hasSuperadminRole, SUPERADMIN_ROLE } from './admin-scope';

/**
 * Refuse a change that would leave no verified account with the superadmin
 * role: nobody could undo it from the console. `next` is the metadata after
 * the change, null when the account is being deleted.
 */
export async function assertNotLastSuperadmin(
  prisma: PrismaService,
  user: { id: string; metadata?: unknown },
  next: Record<string, unknown> | null,
): Promise<void> {
  const current = (user.metadata ?? {}) as Record<string, unknown>;
  if (!hasSuperadminRole(current) || hasSuperadminRole(next ?? {})) return;
  const others = await prisma.user.count({
    where: {
      id: { not: user.id },
      emailVerified: true,
      metadata: { path: ['roles'], array_contains: [SUPERADMIN_ROLE] },
    },
  });
  if (others === 0) {
    throw new ConflictException(
      'This is the last superadmin. Give the role to another verified account first.',
    );
  }
}
