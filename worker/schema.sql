-- Analytics: one row per event. Visitors are anonymous (random browser id + salted IP hash).
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,            -- unix ms
  type     TEXT    NOT NULL,            -- visit | unit_created | sequence_generated | lesson_generated | blocked | error
  anon_id  TEXT,
  ip_hash  TEXT,
  payload  TEXT                          -- JSON: inputs, prompt, model, latency, guardrail category…
);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);
CREATE INDEX IF NOT EXISTS idx_events_ip_ts   ON events(ip_hash, ts);
CREATE INDEX IF NOT EXISTS idx_events_anon    ON events(anon_id);

-- RAG: chunk text lives here; vectors live in Vectorize under the same id.
CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text        TEXT NOT NULL,
  created     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
