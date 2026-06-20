-- V007: Add CHECK constraints on memories.layer and memories.type
-- Purpose: Prevent invalid data writes (defense against bad code paths)
-- UP
ALTER TABLE memories
  ADD CONSTRAINT memories_layer_check CHECK (layer BETWEEN 1 AND 3);

ALTER TABLE memories
  ADD CONSTRAINT memories_type_check CHECK (type IN ('event', 'fact', 'entity', 'preference', 'decision'));

-- DOWN
-- ALTER TABLE memories DROP CONSTRAINT memories_layer_check;
-- ALTER TABLE memories DROP CONSTRAINT memories_type_check;