-- Form settings edits and version publishing stamp form_definitions.updated_at.
-- The column was assumed by the API but never created, so every save returned
-- an internal error ("column updated_at of relation form_definitions does not
-- exist"). Add it for existing and newly provisioned databases.
ALTER TABLE form_definitions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
