-- Clear the personal Telegram data kept from the old Pago bot.
--
-- The privacy policy (https://faccio.app/pago/privacy) promises to delete the
-- Telegram username and the first and last name from the Telegram profile.
-- Run this only after the bot is switched off and after a full backup
-- (RUNBOOK.md, Phase 7). It changes no keys: users.tg_id stays the internal
-- account id that every other table points at. Dropping the columns is a
-- separate, optional migration.
--
-- One transaction. It ends with a count that must show zeros.
BEGIN;

-- Display names that are still the Telegram first name or username are
-- replaced by the part of the email before "@", or "Pago user".
UPDATE users
SET name = COALESCE(NULLIF(split_part(email, '@', 1), ''), 'Pago user')
WHERE name IS NOT NULL AND name <> ''
  AND (name = tg_firstname OR name = tg_username);

-- The Telegram profile values.
UPDATE users
SET tg_username = NULL, tg_firstname = NULL, tg_lastname = NULL
WHERE tg_username IS NOT NULL OR tg_firstname IS NOT NULL OR tg_lastname IS NOT NULL;

-- The bot chat state (it could hold the last text typed to the bot).
-- The column is NOT NULL, so it becomes an empty object.
UPDATE users SET session = '{}'::jsonb WHERE session <> '{}'::jsonb;

-- The login codes table only holds short-lived codes, clear it too.
DELETE FROM auth_tokens;

SELECT
  count(*) FILTER (WHERE tg_username IS NOT NULL OR tg_firstname IS NOT NULL OR tg_lastname IS NOT NULL) AS telegram_names_left,
  count(*) FILTER (WHERE session <> '{}'::jsonb) AS bot_sessions_left
FROM users;

COMMIT;
