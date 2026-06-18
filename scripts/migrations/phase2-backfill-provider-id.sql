-- ============================================================================
-- Phase 2 migration: bot config providers via single providerId reference
-- ============================================================================
-- Purpose:  Refactor bot_configs so each bot stores ONLY a providerId reference
--           to provider_configs (instead of duplicating model/baseUrl/apiKey).
--           After this migration, every bot runtime resolves its model/apiKey/
--           baseUrl by looking up provider_configs[providerId].
--
-- When:     Run on existing deployments BEFORE the new code starts. Safe to
--           re-run (idempotent: WHERE clauses exclude already-migrated rows).
--
-- Backups:  Before running, snapshot bot_configs and bot_secrets:
--             pg_dump -t bot_configs -t bot_secrets --data-only --no-owner \
--               metabot > backups/pre-phase2-bot-tables.sql
--
-- Rollback: psql metabot < backups/pre-phase2-bot-tables.sql
--           (then deploy the previous version of the code)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Backfill providerId for bots that have model+baseUrl but no
--         providerId yet. Match by (base_url, model) which is unique enough
--         for the current dataset. If two providers have identical
--         (baseUrl, model), this picks the alphabetically first (ORDER BY
--         name) — operators must resolve ambiguous cases manually.
-- ----------------------------------------------------------------------------
UPDATE bot_configs
SET config_json = config_json || jsonb_build_object(
  'providerId',
  (
    SELECT id
    FROM provider_configs
    WHERE base_url = bot_configs.config_json->>'baseUrl'
      AND model    = bot_configs.config_json->>'model'
    ORDER BY name
    LIMIT 1
  )::text
)
WHERE (config_json->>'providerId') IS NULL
  AND (config_json->>'baseUrl')   IS NOT NULL
  AND (config_json->>'model')     IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Step 2: Strip duplicated fields from config_json for any bot that now has
--         a providerId. apiKey was previously stored here too — remove it
--         since the new architecture owns apiKey inside provider_configs.
--         claude.{model,baseUrl,apiKey} and openaiCompat are also redundant
--         since runtime reads from the resolved provider.
-- ----------------------------------------------------------------------------
UPDATE bot_configs
SET config_json = config_json
  - 'model'
  - 'baseUrl'
  - 'apiKey'
  - 'claude'
  - 'openaiCompat'
WHERE (config_json->>'providerId') IS NOT NULL
  AND (
       (config_json ? 'model')
    OR (config_json ? 'baseUrl')
    OR (config_json ? 'apiKey')
    OR (config_json ? 'claude')
    OR (config_json ? 'openaiCompat')
  );

-- ----------------------------------------------------------------------------
-- Step 3: Remove stale api_key rows from bot_secrets. After Phase 2, apiKey
--         lives only in provider_configs.api_key_encrypted; bot_secrets still
--         holds feishu_app_secret / openai_api_key / telegram_bot_token /
--         wechat_bot_token for platform credentials (untouched).
-- ----------------------------------------------------------------------------
DELETE FROM bot_secrets WHERE key_type = 'api_key';

-- ----------------------------------------------------------------------------
-- Verification queries (read-only, run by operator AFTER migration). Each
-- should return 0 rows / clean state once migration is complete.
-- ----------------------------------------------------------------------------
-- 1. Bots still missing providerId (should be 0)
--    SELECT name FROM bot_configs WHERE (config_json->>'providerId') IS NULL;
-- 2. Bots that still have stale fields (should be 0)
--    SELECT name FROM bot_configs
--     WHERE (config_json->>'providerId') IS NOT NULL
--       AND (config_json ? 'model' OR config_json ? 'baseUrl'
--         OR config_json ? 'apiKey' OR config_json ? 'claude'
--         OR config_json ? 'openaiCompat');
-- 3. Stale api_key rows in bot_secrets (should be 0)
--    SELECT count(*) FROM bot_secrets WHERE key_type = 'api_key';
-- 4. All bots and their resolved providers
--    SELECT b.name, p.name AS provider, p.base_url, p.model
--      FROM bot_configs b
--      LEFT JOIN provider_configs p
--        ON p.id = b.config_json->>'providerId'
--     ORDER BY b.name;
