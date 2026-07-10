BEGIN;
UPDATE provider_configs SET is_default = false, updated_at = NOW()
  WHERE id = 'bf5d388b-22a9-4351-bcb0-4ab7a5c0bf5e';
UPDATE knowledge_bases SET embedding_provider_id = '', updated_at = NOW()
  WHERE id = '00000000-0000-0000-0000-000000000001';
DELETE FROM embedding_providers WHERE id = 'bf5d388b-22a9-4351-bcb0-4ab7a5c0bf5e';
COMMIT;
