-- Separate ledger read model; never writable through the legacy asset routes.
CREATE TABLE IF NOT EXISTS canton_projection_sources (
  source TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  parties TEXT[] NOT NULL,
  last_offset BIGINT NOT NULL DEFAULT 0 CHECK (last_offset >= 0),
  synced_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS canton_contracts (
  source TEXT NOT NULL REFERENCES canton_projection_sources(source) ON DELETE CASCADE,
  contract_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  witnesses TEXT[] NOT NULL,
  created_offset BIGINT NOT NULL,
  archived_offset BIGINT,
  created_update_id TEXT NOT NULL,
  PRIMARY KEY (source, contract_id)
);
CREATE TABLE IF NOT EXISTS canton_events (
  source TEXT NOT NULL REFERENCES canton_projection_sources(source) ON DELETE CASCADE,
  update_id TEXT NOT NULL,
  node_id INTEGER NOT NULL,
  ledger_offset BIGINT NOT NULL,
  contract_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'archived')),
  witnesses TEXT[] NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (source, update_id, node_id)
);
CREATE INDEX IF NOT EXISTS canton_contracts_active ON canton_contracts(source, created_offset) WHERE archived_offset IS NULL;
CREATE INDEX IF NOT EXISTS canton_events_order ON canton_events(source, ledger_offset, node_id);
