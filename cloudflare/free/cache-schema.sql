-- Apply explicitly to the dedicated incremental-cache database, never per request.
-- At most 1 MiB JSON + 4 KiB key + timestamp, below D1's 2,000,000-byte row limit.
CREATE TABLE IF NOT EXISTS opennext_cache (
  cache_key TEXT PRIMARY KEY NOT NULL
    CHECK (length(CAST(cache_key AS BLOB)) BETWEEN 1 AND 4096),
  value_json TEXT NOT NULL
    CHECK (length(CAST(value_json AS BLOB)) <= 1048576),
  last_modified INTEGER NOT NULL
    CHECK (typeof(last_modified) = 'integer' AND last_modified >= 0)
) WITHOUT ROWID;
