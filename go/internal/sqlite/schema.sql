CREATE TABLE IF NOT EXISTS invoices (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL, -- unix ミリ秒
  updated_at INTEGER NOT NULL  -- unix ミリ秒
);

CREATE INDEX IF NOT EXISTS invoices_owner_id_idx ON invoices (owner_id);
CREATE INDEX IF NOT EXISTS invoices_updated_at_idx ON invoices (updated_at);
