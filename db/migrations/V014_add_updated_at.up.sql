-- V014: Add updated_at column to memories + auto-update trigger
-- Purpose: support recency-based ranking on memories (not just documents)

-- Add updated_at column (default to created_at)
ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill: existing rows use created_at as updated_at
UPDATE memories SET updated_at = created_at WHERE updated_at IS NULL OR updated_at < created_at;

-- Create trigger function: auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_memories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger
DROP TRIGGER IF EXISTS memories_updated_at_trigger ON memories;
CREATE TRIGGER memories_updated_at_trigger
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_memories_updated_at();

-- Add index for recency queries (ORDER BY updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_memories_updated_at
  ON memories(updated_at DESC)
  WHERE invalidated_at IS NULL;

-- DOWN
-- ALTER TABLE memories DROP COLUMN IF EXISTS updated_at;
-- DROP TRIGGER IF EXISTS memories_updated_at_trigger ON memories;
-- DROP INDEX IF EXISTS idx_memories_updated_at;