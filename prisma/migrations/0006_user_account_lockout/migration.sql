-- Account-lockout columns for password-login backoff.
-- failedLoginCount increments on each invalid attempt and resets to 0
-- on success. lockoutUntil is set when the threshold is crossed and is
-- consulted before bcrypt.compare on subsequent attempts.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lockoutUntil" TIMESTAMP(3);
