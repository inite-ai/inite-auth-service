-- 0031_password_reset_oauth_params — additive, nullable, no backfill.
--
-- A password reset requested from inside an /authorize flow (an invitee who
-- arrived from a client app and forgot their password) now remembers that
-- flow next to the reset token, the same way magic_links.oauthParams does, so
-- setting the new password resumes /authorize instead of dropping the person
-- on the account page. Existing rows stay NULL = "no flow to resume".
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetOAuthParams" JSONB;
