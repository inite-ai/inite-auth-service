/**
 * Secret-stripping helpers for the service layer.
 *
 * Records read from Prisma carry secret columns (passwordHash,
 * clientSecretHash, …) that must never leave the service boundary in an
 * API response. Previously every call site did an ad-hoc
 * `const { passwordHash, ...safe } = row` destructure, which trips
 * `no-unused-vars` on the discarded secret and duplicates the intent.
 * These helpers make the strip explicit, typed, and grep-able.
 */

/** Return a shallow copy of `obj` without the given keys. */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/** Strip the bcrypt password hash before a user record leaves a service. */
export function stripUserSecrets<T extends { passwordHash?: unknown }>(
  user: T,
): Omit<T, 'passwordHash'> {
  return omit(user, ['passwordHash']);
}

/** Strip the hashed client secret before an OAuth-client record is returned. */
export function stripClientSecret<T extends { clientSecretHash?: unknown }>(
  client: T,
): Omit<T, 'clientSecretHash'> {
  return omit(client, ['clientSecretHash']);
}
