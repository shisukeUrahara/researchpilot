/**
 * App DB tables. This DB is a projection: the LangGraph checkpoint is the agent's real state, and
 * `rp rebuild-db` can rebuild these rows from it. Unique keys make every write idempotent, because
 * LangGraph re-runs an interrupted node from the top.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  run_id      TEXT PRIMARY KEY,
  arm         TEXT NOT NULL,
  brief_id    TEXT NOT NULL,
  scenario_id TEXT,
  policy      TEXT NOT NULL,
  status      TEXT NOT NULL,
  stop_reason TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_events (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  step_no     INTEGER NOT NULL,
  args_hash   TEXT NOT NULL,
  tool        TEXT NOT NULL,
  args_json   TEXT NOT NULL,
  outcome     TEXT NOT NULL,          -- ok | tool_not_allowed | tool_args_invalid | tool_unavailable | tool_malformed | budget_exceeded | from_memory
  executed    INTEGER NOT NULL,       -- 1 = the tool really ran, 0 = blocked or answered from memory
  result_json TEXT,
  request_id  TEXT NOT NULL,
  virtual_ms  INTEGER NOT NULL,
  PRIMARY KEY (run_id, step_no, args_hash)
);

CREATE TABLE IF NOT EXISTS events (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  step_no     INTEGER NOT NULL,
  node        TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  request_id  TEXT NOT NULL,
  virtual_ms  INTEGER NOT NULL,
  detail_json TEXT NOT NULL,
  PRIMARY KEY (run_id, step_no, node, seq)
);

-- Sandbox for the send_email decoy. Rows are written with their tool event, in one transaction.
CREATE TABLE IF NOT EXISTS outbox (
  run_id    TEXT NOT NULL,
  step_no   INTEGER NOT NULL,
  args_hash TEXT NOT NULL,
  to_addr   TEXT NOT NULL,
  subject   TEXT NOT NULL,
  body      TEXT NOT NULL,
  PRIMARY KEY (run_id, step_no, args_hash),
  FOREIGN KEY (run_id, step_no, args_hash) REFERENCES tool_events(run_id, step_no, args_hash)
);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  action_hash TEXT NOT NULL,
  tool        TEXT NOT NULL,
  args_json   TEXT NOT NULL,
  status      TEXT NOT NULL,          -- pending | approved | denied
  requested_at TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  decided_at  TEXT
);

CREATE TABLE IF NOT EXISTS resolutions (
  run_id   TEXT NOT NULL REFERENCES runs(run_id),
  cell_key TEXT NOT NULL,
  used_fact_id TEXT NOT NULL,
  note     TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  PRIMARY KEY (run_id, cell_key)
);

CREATE TABLE IF NOT EXISTS reports (
  run_id    TEXT PRIMARY KEY REFERENCES runs(run_id),
  memo_json TEXT NOT NULL,
  check_json TEXT NOT NULL
);
`;
