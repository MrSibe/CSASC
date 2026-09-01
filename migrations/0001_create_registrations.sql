PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  registration_no TEXT NOT NULL UNIQUE,
  campaign_code TEXT NOT NULL,
  registration_type TEXT NOT NULL CHECK (registration_type IN ('individual', 'team')),
  team_name TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (campaign_code, idempotency_key),
  CHECK (
    (registration_type = 'individual' AND team_name IS NULL) OR
    (registration_type = 'team' AND length(team_name) > 0)
  )
);

CREATE TABLE IF NOT EXISTS registration_members (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  campaign_code TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 9),
  is_captain INTEGER NOT NULL CHECK (is_captain IN (0, 1)),
  real_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  qq TEXT NOT NULL,
  organization TEXT,
  FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
  UNIQUE (campaign_code, email_normalized),
  UNIQUE (registration_id, position)
);

CREATE INDEX IF NOT EXISTS idx_registrations_campaign_created
  ON registrations (campaign_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_members_registration
  ON registration_members (registration_id, position);

CREATE INDEX IF NOT EXISTS idx_registration_members_search
  ON registration_members (campaign_code, real_name, qq);
