import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA } from "./schema";

export interface RunRow {
  run_id: string;
  arm: string;
  brief_id: string;
  scenario_id: string | null;
  policy: string;
  status: string;
  stop_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolEventRow {
  run_id: string;
  step_no: number;
  args_hash: string;
  tool: string;
  args_json: string;
  outcome: string;
  executed: number;
  result_json: string | null;
  request_id: string;
  virtual_ms: number;
}

export interface EventRow {
  run_id: string;
  step_no: number;
  node: string;
  seq: number;
  kind: string;
  request_id: string;
  virtual_ms: number;
  detail_json: string;
}

export interface OutboxRow {
  run_id: string;
  step_no: number;
  args_hash: string;
  to_addr: string;
  subject: string;
  body: string;
}

/** The app DB. Every insert is insert-or-ignore on a natural key, so a re-run node writes nothing twice. */
export class Store {
  readonly db: Database.Database;

  constructor(file = ":memory:") {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  /** Runs fn in a transaction. Nested calls become savepoints, so an inner throw rolls back only if it escapes. */
  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  upsertRun(r: RunRow): void {
    this.db
      .prepare(
        `INSERT INTO runs VALUES (@run_id, @arm, @brief_id, @scenario_id, @policy, @status, @stop_reason, @created_at, @updated_at)
         ON CONFLICT(run_id) DO UPDATE SET status = excluded.status, stop_reason = excluded.stop_reason, updated_at = excluded.updated_at`,
      )
      .run(r);
  }

  getRun(runId: string): RunRow | undefined {
    return this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as RunRow | undefined;
  }

  /** Returns true when the row is new, false when the same key was already stored. */
  insertToolEvent(e: ToolEventRow): boolean {
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO tool_events VALUES (@run_id, @step_no, @args_hash, @tool, @args_json, @outcome, @executed, @result_json, @request_id, @virtual_ms)`,
      )
      .run(e);
    return res.changes === 1;
  }

  getToolEvent(runId: string, stepNo: number, argsHash: string): ToolEventRow | undefined {
    return this.db
      .prepare("SELECT * FROM tool_events WHERE run_id = ? AND step_no = ? AND args_hash = ?")
      .get(runId, stepNo, argsHash) as ToolEventRow | undefined;
  }

  toolEvents(runId: string): ToolEventRow[] {
    return this.db.prepare("SELECT * FROM tool_events WHERE run_id = ? ORDER BY step_no, args_hash").all(runId) as ToolEventRow[];
  }

  insertEvent(e: EventRow): boolean {
    const res = this.db
      .prepare(`INSERT OR IGNORE INTO events VALUES (@run_id, @step_no, @node, @seq, @kind, @request_id, @virtual_ms, @detail_json)`)
      .run(e);
    return res.changes === 1;
  }

  events(runId: string): EventRow[] {
    return this.db.prepare("SELECT * FROM events WHERE run_id = ? ORDER BY virtual_ms, step_no, node, seq").all(runId) as EventRow[];
  }

  /** The decoy's sandbox write: the tool event and its outbox row land together or not at all. */
  insertToolEventWithOutbox(e: ToolEventRow, mail: Omit<OutboxRow, "run_id" | "step_no" | "args_hash">): boolean {
    return this.tx(() => {
      const fresh = this.insertToolEvent(e);
      if (fresh) {
        this.db
          .prepare(`INSERT INTO outbox VALUES (?, ?, ?, ?, ?, ?)`)
          .run(e.run_id, e.step_no, e.args_hash, mail.to_addr, mail.subject, mail.body);
      }
      return fresh;
    });
  }

  outbox(runId: string): OutboxRow[] {
    return this.db.prepare("SELECT * FROM outbox WHERE run_id = ? ORDER BY step_no").all(runId) as OutboxRow[];
  }

  close(): void {
    this.db.close();
  }
}

/** Opens the app DB inside the state dir. */
export function openStore(stateDir: string): Store {
  return new Store(path.join(stateDir, "researchpilot.db"));
}
