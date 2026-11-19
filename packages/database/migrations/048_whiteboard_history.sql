-- Version snapshots for whiteboards. A snapshot is a cheap, bounded copy of
-- the canvas taken before each meaningful save so a mistaken Clear or a bad
-- collaborator sync can be undone without a database restore.
CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  version INTEGER NOT NULL,
  label TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_whiteboard_snapshots_board
  ON whiteboard_snapshots (whiteboard_id, created_at DESC);
