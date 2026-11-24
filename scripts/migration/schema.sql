-- Synthetic trial schema, not a replacement for the live PostgreSQL schema/RLS.
CREATE TABLE accounts (
  uid TEXT PRIMARY KEY NOT NULL,
  trusted_role TEXT NOT NULL CHECK (trusted_role IN ('user', 'admin')),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active', 'deleting', 'deleted'))
);
CREATE TABLE user_profiles (
  uid TEXT PRIMARY KEY NOT NULL REFERENCES accounts(uid),
  display_name TEXT NOT NULL,
  is_public INTEGER NOT NULL CHECK (is_public IN (0, 1)),
  unsubscribe_token TEXT NOT NULL UNIQUE
);
CREATE TABLE posts_raw (
  id TEXT PRIMARY KEY NOT NULL,
  owner_uid TEXT REFERENCES accounts(uid),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  species TEXT NOT NULL,
  count INTEGER CHECK (count IS NULL OR count >= 0),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location_disclosure TEXT NOT NULL CHECK (location_disclosure IN ('precise', 'coarsened', 'hidden')),
  private_locality TEXT,
  private_water_body TEXT,
  metadata_json TEXT NOT NULL,
  source_hash TEXT,
  research_status TEXT NOT NULL CHECK (research_status IN ('unreviewed', 'adopted', 'excluded'))
);
CREATE TABLE posts_public (
  id TEXT PRIMARY KEY NOT NULL REFERENCES posts_raw(id),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  species TEXT NOT NULL,
  count INTEGER CHECK (count IS NULL OR count >= 0),
  location_disclosure TEXT NOT NULL CHECK (location_disclosure IN ('precise', 'coarsened', 'hidden')),
  display_lat REAL,
  display_lng REAL,
  locality TEXT,
  water_body TEXT,
  CHECK ((location_disclosure = 'hidden' AND display_lat IS NULL AND display_lng IS NULL
      AND locality IS NULL AND water_body IS NULL)
    OR (location_disclosure <> 'hidden' AND display_lat IS NOT NULL AND display_lng IS NOT NULL))
);
CREATE TABLE community_water_bodies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80 AND length(name) <= 80),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90 AND lat = round(lat, 3)),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180 AND lng = round(lng, 3)),
  created_at TEXT NOT NULL
);
CREATE TABLE water_reports (
  id TEXT PRIMARY KEY NOT NULL,
  owner_uid TEXT NOT NULL REFERENCES accounts(uid),
  client_id TEXT NOT NULL,
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  private_name TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  photo_paths_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  public_name TEXT CHECK (public_name IS NULL OR length(trim(public_name)) BETWEEN 1 AND 80),
  published_water_body_id TEXT UNIQUE REFERENCES community_water_bodies(id),
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES accounts(uid),
  created_at TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 0),
  UNIQUE (owner_uid, client_id),
  CHECK ((status = 'accepted') = (published_water_body_id IS NOT NULL)),
  CHECK ((status = 'pending') = (reviewed_at IS NULL))
);
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_uid TEXT REFERENCES accounts(uid),
  action TEXT NOT NULL,
  -- Retained audit targets are identifiers, not a dependency on a surviving row.
  target_id TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY NOT NULL,
  target_id TEXT NOT NULL REFERENCES water_reports(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  delivery_state TEXT NOT NULL CHECK (delivery_state IN ('pending', 'delivered', 'quarantined')),
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);
-- Local concurrency-test inputs, not a new production quota/deletion policy.
CREATE TABLE quota_state (
  owner_uid TEXT NOT NULL REFERENCES accounts(uid),
  window_start TEXT NOT NULL,
  used INTEGER NOT NULL CHECK (used >= 0),
  version INTEGER NOT NULL CHECK (version >= 0),
  PRIMARY KEY (owner_uid, window_start)
);
CREATE TABLE deletion_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_uid TEXT NOT NULL UNIQUE REFERENCES accounts(uid),
  state TEXT NOT NULL CHECK (state IN ('requested', 'blocked', 'db-cleaned', 'media-cleaned', 'completed')),
  media_refs_json TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  last_error TEXT
);
-- Server-created operation claims bind every statement of one review batch to its own conditional write.
-- Local operational claims are removed with the report/actor, retained audit rows are independent.
CREATE TABLE review_claims (
  operation_id TEXT PRIMARY KEY NOT NULL,
  report_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL CHECK (expected_version >= 0),
  previous_status TEXT NOT NULL CHECK (previous_status IN ('pending', 'accepted', 'rejected')),
  previous_public_id TEXT,
  public_id TEXT NOT NULL,
  actor_uid TEXT NOT NULL REFERENCES accounts(uid),
  reviewed_at TEXT NOT NULL,
  UNIQUE (report_id, expected_version)
);

-- Durable retry key and payload fingerprint, delete with private report before deleting its owner.
CREATE TABLE submission_receipts (
  owner_uid TEXT NOT NULL REFERENCES accounts(uid),
  client_id TEXT NOT NULL,
  report_id TEXT NOT NULL UNIQUE REFERENCES water_reports(id),
  payload_hash TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (owner_uid, client_id)
);
CREATE INDEX water_reports_owner_received ON water_reports (owner_uid, created_at);
