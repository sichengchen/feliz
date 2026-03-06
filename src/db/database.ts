import { Database as BunSqlite } from "bun:sqlite";
import type {
  Project,
  WorkItem,
  Run,
  StepExecution,
  HistoryEntry,
  ContextSnapshot,
  RunResult,
  StepResult,
} from "../domain/types.ts";

export class Database {
  private db: BunSqlite;

  constructor(dbPath: string) {
    this.db = new BunSqlite(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        repo_url TEXT NOT NULL,
        linear_project_name TEXT NOT NULL,
        base_branch TEXT NOT NULL DEFAULT 'main',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        linear_id TEXT NOT NULL UNIQUE,
        linear_identifier TEXT NOT NULL,
        project_id TEXT NOT NULL,
        parent_work_item_id TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        labels TEXT NOT NULL DEFAULT '[]',
        blocker_ids TEXT NOT NULL DEFAULT '[]',
        orchestration_state TEXT NOT NULL DEFAULT 'unclaimed',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        work_item_id TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        current_phase TEXT NOT NULL,
        current_step TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        result TEXT,
        failure_reason TEXT,
        context_snapshot_id TEXT NOT NULL,
        pr_url TEXT,
        token_usage TEXT,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      );

      CREATE TABLE IF NOT EXISTS step_executions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        phase_name TEXT NOT NULL,
        step_name TEXT NOT NULL,
        cycle INTEGER NOT NULL DEFAULT 1,
        step_attempt INTEGER NOT NULL DEFAULT 1,
        agent_adapter TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        result TEXT,
        exit_code INTEGER,
        failure_reason TEXT,
        token_usage TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        work_item_id TEXT,
        run_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_history_project_item
        ON history(project_id, work_item_id, created_at);

      CREATE TABLE IF NOT EXISTS context_snapshots (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        artifact_refs TEXT NOT NULL DEFAULT '[]',
        token_budget TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS scratchpad (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        step_execution_id TEXT,
        kind TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        file_path TEXT NOT NULL,
        metadata TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        promoted_to_path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scratchpad_run
        ON scratchpad(run_id, status);
    `);
  }

  listTables(): string[] {
    const rows = this.db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  // Projects
  insertProject(p: {
    id: string;
    name: string;
    repo_url: string;
    linear_project_name: string;
    base_branch: string;
  }) {
    this.db
      .query(
        `INSERT INTO projects (id, name, repo_url, linear_project_name, base_branch)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(p.id, p.name, p.repo_url, p.linear_project_name, p.base_branch);
  }

  getProject(id: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      ...row,
      created_at: new Date(row.created_at as string),
    } as unknown as Project;
  }

  getProjectByName(name: string): Project | null {
    const row = this.db
      .query("SELECT * FROM projects WHERE name = ?1")
      .get(name) as Record<string, unknown> | null;
    if (!row) return null;
    return {
      ...row,
      created_at: new Date(row.created_at as string),
    } as unknown as Project;
  }

  listProjects(): Project[] {
    const rows = this.db
      .query("SELECT * FROM projects ORDER BY name")
      .all() as Record<string, unknown>[];
    return rows.map(
      (row) =>
        ({
          ...row,
          created_at: new Date(row.created_at as string),
        }) as unknown as Project
    );
  }

  // WorkItems
  upsertWorkItem(wi: {
    id: string;
    linear_id: string;
    linear_identifier: string;
    project_id: string;
    parent_work_item_id: string | null;
    title: string;
    description: string;
    state: string;
    priority: number;
    labels: string[];
    blocker_ids: string[];
    orchestration_state: string;
  }) {
    this.db
      .query(
        `INSERT INTO work_items (id, linear_id, linear_identifier, project_id,
          parent_work_item_id, title, description, state, priority, labels,
          blocker_ids, orchestration_state)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          state = excluded.state,
          priority = excluded.priority,
          labels = excluded.labels,
          blocker_ids = excluded.blocker_ids,
          orchestration_state = excluded.orchestration_state,
          updated_at = datetime('now')`
      )
      .run(
        wi.id,
        wi.linear_id,
        wi.linear_identifier,
        wi.project_id,
        wi.parent_work_item_id,
        wi.title,
        wi.description,
        wi.state,
        wi.priority,
        JSON.stringify(wi.labels),
        JSON.stringify(wi.blocker_ids),
        wi.orchestration_state
      );
  }

  getWorkItem(id: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorkItem(row);
  }

  getWorkItemByLinearId(linearId: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE linear_id = ?1")
      .get(linearId) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorkItem(row);
  }

  listWorkItemsByProject(projectId: string): WorkItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM work_items WHERE project_id = ?1 ORDER BY priority ASC, created_at ASC"
      )
      .all(projectId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkItem(row));
  }

  listWorkItemsByState(projectId: string, state: string): WorkItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM work_items WHERE project_id = ?1 AND orchestration_state = ?2 ORDER BY priority ASC, created_at ASC"
      )
      .all(projectId, state) as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkItem(row));
  }

  updateWorkItemOrchestrationState(id: string, state: string) {
    this.db
      .query(
        "UPDATE work_items SET orchestration_state = ?1, updated_at = datetime('now') WHERE id = ?2"
      )
      .run(state, id);
  }

  private rowToWorkItem(row: Record<string, unknown>): WorkItem {
    return {
      ...row,
      labels: JSON.parse(row.labels as string),
      blocker_ids: JSON.parse(row.blocker_ids as string),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    } as unknown as WorkItem;
  }

  // History
  appendHistory(entry: {
    id: string;
    project_id: string;
    work_item_id: string | null;
    run_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
  }) {
    this.db
      .query(
        `INSERT INTO history (id, project_id, work_item_id, run_id, event_type, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(
        entry.id,
        entry.project_id,
        entry.work_item_id,
        entry.run_id,
        entry.event_type,
        JSON.stringify(entry.payload)
      );
  }

  getHistory(
    projectId: string,
    workItemId?: string | null,
    limit = 100
  ): HistoryEntry[] {
    let sql = "SELECT * FROM history WHERE project_id = ?1";
    const params: unknown[] = [projectId];
    if (workItemId) {
      sql += " AND work_item_id = ?2";
      params.push(workItemId);
    }
    sql += ` ORDER BY created_at ASC, rowid ASC LIMIT ?${params.length + 1}`;
    params.push(limit);

    const rows = this.db.query(sql).all(...(params as [string, ...string[]])) as Record<
      string,
      unknown
    >[];
    return rows.map(
      (row) =>
        ({
          ...row,
          payload: JSON.parse(row.payload as string),
          created_at: new Date(row.created_at as string),
        }) as unknown as HistoryEntry
    );
  }

  // Runs
  insertRun(run: {
    id: string;
    work_item_id: string;
    attempt: number;
    current_phase: string;
    current_step: string;
    context_snapshot_id: string;
  }) {
    this.db
      .query(
        `INSERT INTO runs (id, work_item_id, attempt, current_phase, current_step, context_snapshot_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .run(
        run.id,
        run.work_item_id,
        run.attempt,
        run.current_phase,
        run.current_step,
        run.context_snapshot_id
      );
  }

  getRun(id: string): Run | null {
    const row = this.db
      .query("SELECT * FROM runs WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToRun(row);
  }

  updateRunResult(
    id: string,
    result: RunResult,
    failureReason: string | null,
    prUrl: string | null
  ) {
    this.db
      .query(
        `UPDATE runs SET result = ?1, failure_reason = ?2, pr_url = ?3,
         finished_at = datetime('now') WHERE id = ?4`
      )
      .run(result, failureReason, prUrl, id);
  }

  updateRunProgress(id: string, phase: string, step: string) {
    this.db
      .query(
        "UPDATE runs SET current_phase = ?1, current_step = ?2 WHERE id = ?3"
      )
      .run(phase, step, id);
  }

  getLatestRunForWorkItem(workItemId: string): Run | null {
    const row = this.db
      .query(
        "SELECT * FROM runs WHERE work_item_id = ?1 ORDER BY attempt DESC LIMIT 1"
      )
      .get(workItemId) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToRun(row);
  }

  private rowToRun(row: Record<string, unknown>): Run {
    return {
      ...row,
      started_at: new Date(row.started_at as string),
      finished_at: row.finished_at
        ? new Date(row.finished_at as string)
        : null,
      token_usage: row.token_usage
        ? JSON.parse(row.token_usage as string)
        : null,
    } as unknown as Run;
  }

  // StepExecutions
  insertStepExecution(se: {
    id: string;
    run_id: string;
    phase_name: string;
    step_name: string;
    cycle: number;
    step_attempt: number;
    agent_adapter: string | null;
  }) {
    this.db
      .query(
        `INSERT INTO step_executions (id, run_id, phase_name, step_name, cycle, step_attempt, agent_adapter)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        se.id,
        se.run_id,
        se.phase_name,
        se.step_name,
        se.cycle,
        se.step_attempt,
        se.agent_adapter
      );
  }

  getStepExecution(id: string): StepExecution | null {
    const row = this.db
      .query("SELECT * FROM step_executions WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToStepExecution(row);
  }

  updateStepResult(
    id: string,
    result: StepResult,
    exitCode: number | null,
    failureReason: string | null
  ) {
    this.db
      .query(
        `UPDATE step_executions SET result = ?1, exit_code = ?2, failure_reason = ?3,
         finished_at = datetime('now') WHERE id = ?4`
      )
      .run(result, exitCode, failureReason, id);
  }

  listStepExecutionsForRun(runId: string): StepExecution[] {
    const rows = this.db
      .query(
        "SELECT * FROM step_executions WHERE run_id = ?1 ORDER BY started_at ASC"
      )
      .all(runId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToStepExecution(row));
  }

  private rowToStepExecution(row: Record<string, unknown>): StepExecution {
    return {
      ...row,
      started_at: new Date(row.started_at as string),
      finished_at: row.finished_at
        ? new Date(row.finished_at as string)
        : null,
      token_usage: row.token_usage
        ? JSON.parse(row.token_usage as string)
        : null,
    } as unknown as StepExecution;
  }

  listChildWorkItems(parentWorkItemId: string): WorkItem[] {
    const rows = this.db
      .query(
        "SELECT * FROM work_items WHERE parent_work_item_id = ?1 ORDER BY priority ASC, created_at ASC"
      )
      .all(parentWorkItemId) as Record<string, unknown>[];
    return rows.map((row) => this.rowToWorkItem(row));
  }

  listRuns(limit = 50): Run[] {
    const rows = this.db
      .query("SELECT * FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?1")
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => this.rowToRun(row));
  }

  getWorkItemByLinearIdentifier(identifier: string): WorkItem | null {
    const row = this.db
      .query("SELECT * FROM work_items WHERE linear_identifier = ?1")
      .get(identifier) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToWorkItem(row);
  }

  // Context snapshots
  insertContextSnapshot(snap: {
    id: string;
    run_id: string;
    work_item_id: string;
    artifact_refs: unknown[];
    token_budget: { max_input: number; reserved_system: number };
  }) {
    this.db
      .query(
        `INSERT INTO context_snapshots (id, run_id, work_item_id, artifact_refs, token_budget)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(
        snap.id,
        snap.run_id,
        snap.work_item_id,
        JSON.stringify(snap.artifact_refs),
        JSON.stringify(snap.token_budget)
      );
  }

  getContextSnapshot(id: string): ContextSnapshot | null {
    const row = this.db
      .query("SELECT * FROM context_snapshots WHERE id = ?1")
      .get(id) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToContextSnapshot(row);
  }

  getLatestSnapshotForWorkItem(workItemId: string): ContextSnapshot | null {
    const row = this.db
      .query(
        "SELECT * FROM context_snapshots WHERE work_item_id = ?1 ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(workItemId) as Record<string, unknown> | null;
    if (!row) return null;
    return this.rowToContextSnapshot(row);
  }

  private rowToContextSnapshot(row: Record<string, unknown>): ContextSnapshot {
    return {
      ...row,
      artifact_refs: JSON.parse(row.artifact_refs as string),
      token_budget: JSON.parse(row.token_budget as string),
      created_at: new Date(row.created_at as string),
    } as unknown as ContextSnapshot;
  }

  // Concurrency helpers
  countRunningItems(): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as count FROM work_items WHERE orchestration_state = 'running'"
      )
      .get() as { count: number };
    return row.count;
  }

  countRunningItemsByProject(projectId: string): number {
    const row = this.db
      .query(
        "SELECT COUNT(*) as count FROM work_items WHERE project_id = ?1 AND orchestration_state = 'running'"
      )
      .get(projectId) as { count: number };
    return row.count;
  }

  close() {
    this.db.close();
  }
}
