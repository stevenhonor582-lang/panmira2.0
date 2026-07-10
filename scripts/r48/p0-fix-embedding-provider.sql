-- R48-W1 P0 紧急修复:embedding provider 链路断裂
BEGIN;

UPDATE provider_configs
SET is_default = true, updated_at = NOW()
WHERE id = 'bf5d388b-22a9-4351-bcb0-4ab7a5c0bf5e';

INSERT INTO embedding_providers (id, name, base_url, api_key_encrypted, model_name, dimensions, is_default, status)
SELECT
  'bf5d388b-22a9-4351-bcb0-4ab7a5c0bf5e'::text,
  pc.name,
  pc.base_url,
  pc.api_key_encrypted,
  pc.model,
  1024,
  true,
  'active'
FROM provider_configs pc
WHERE pc.id = 'bf5d388b-22a9-4351-bcb0-4ab7a5c0bf5e'
ON CONFLICT (id) DO UPDATE SET
  base_url = EXCLUDED.base_url,
  api_key_encrypted = EXCLUDED.api_key_encrypted,
  model_name = EXCLUDED.model_name,
  is_default = EXCLUDED.is_default,
  updated_at = NOW();

UPDATE knowledge_bases
SET embedding_provider_id = 'bf5d388b-22a9-4351-bcb0-4ab7a5c0bf5e',
    updated_at = NOW()
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE embedding_jobs
SET status = 'pending', attempts = 0, error = NULL
WHERE status IN ('completed', 'failed');

COMMIT;

SELECT 'provider_configs default embedding' AS check, count(*) FILTER (WHERE is_default=true) AS default_count
  FROM provider_configs WHERE type='embedding';
SELECT 'embedding_providers total' AS check, count(*) FROM embedding_providers;
SELECT 'KB provider' AS check, name, embedding_provider_id FROM knowledge_bases;
SELECT 'embedding_jobs status' AS check, status, count(*) FROM embedding_jobs GROUP BY status;
