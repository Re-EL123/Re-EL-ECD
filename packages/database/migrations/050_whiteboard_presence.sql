-- Live co-presence for whiteboards: one heartbeat row per teacher per board.
CREATE TABLE IF NOT EXISTS whiteboard_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cursor_x NUMERIC(10,2) NOT NULL DEFAULT 0,
  cursor_y NUMERIC(10,2) NOT NULL DEFAULT 0,
  colour VARCHAR(20) NOT NULL DEFAULT '#3D8FAE',
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (whiteboard_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_whiteboard_presence_board
  ON whiteboard_presence (whiteboard_id, seen_at DESC);
