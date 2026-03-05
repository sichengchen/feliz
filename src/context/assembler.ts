import type { Database } from "../db/database.ts";
import type { HistoryEntry } from "../domain/types.ts";
import { newId } from "../id.ts";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

export interface MemoryItem {
  path: string;
  content: string;
}

export interface ScratchpadItem {
  path: string;
  content: string;
}

export interface SpecItem {
  path: string;
  content: string;
}

export interface AssembledContext {
  history: HistoryEntry[];
  memory: MemoryItem[];
  scratchpad: ScratchpadItem[];
  specs: SpecItem[];
}

export class ContextAssembler {
  private db: Database;
  private scratchpadRoot: string;

  constructor(db: Database, scratchpadRoot: string) {
    this.db = db;
    this.scratchpadRoot = scratchpadRoot;
  }

  assemble(
    projectId: string,
    workItemId: string,
    workDir: string | null,
    runId?: string | null,
    specDir?: string | null
  ): AssembledContext {
    const history = this.db.getHistory(projectId, workItemId, 50);
    const memory = workDir ? this.readMemory(workDir) : [];
    const scratchpad = runId ? this.readScratchpad(projectId, runId) : [];
    const specs =
      workDir && specDir ? this.readSpecs(workDir, specDir) : [];

    return { history, memory, scratchpad, specs };
  }

  readSpecs(workDir: string, specDir: string): SpecItem[] {
    const specsPath = join(workDir, specDir);
    if (!existsSync(specsPath)) return [];

    const items: SpecItem[] = [];
    this.walkDir(specsPath, (filePath) => {
      const content = readFileSync(filePath, "utf-8");
      items.push({
        path: relative(workDir, filePath),
        content,
      });
    });
    return items;
  }

  readSpecsAsText(workDir: string, specDir: string): string | null {
    const items = this.readSpecs(workDir, specDir);
    if (items.length === 0) return null;

    return items
      .map((item) => `<!-- ${item.path} -->\n${item.content}`)
      .join("\n\n");
  }

  private readMemory(workDir: string): MemoryItem[] {
    const memoryDir = join(workDir, ".feliz", "context", "memory");
    if (!existsSync(memoryDir)) return [];

    const items: MemoryItem[] = [];
    this.walkDir(memoryDir, (filePath) => {
      const content = readFileSync(filePath, "utf-8");
      items.push({
        path: relative(workDir, filePath),
        content,
      });
    });
    return items;
  }

  private readScratchpad(
    projectId: string,
    runId: string
  ): ScratchpadItem[] {
    const project = this.db.getProject(projectId);
    const projectName = project?.name ?? projectId;
    const scratchDir = join(this.scratchpadRoot, projectName, runId);
    if (!existsSync(scratchDir)) return [];

    const items: ScratchpadItem[] = [];
    this.walkDir(scratchDir, (filePath) => {
      const content = readFileSync(filePath, "utf-8");
      items.push({
        path: relative(scratchDir, filePath),
        content,
      });
    });
    return items;
  }

  private walkDir(dir: string, callback: (filePath: string) => void) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkDir(fullPath, callback);
      } else {
        callback(fullPath);
      }
    }
  }

  createSnapshot(
    runId: string,
    workItemId: string,
    context: AssembledContext
  ): string {
    const id = newId();
    const db = this.db as any;
    db.db
      .query(
        `INSERT INTO context_snapshots (id, run_id, work_item_id, artifact_refs, token_budget)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .run(
        id,
        runId,
        workItemId,
        JSON.stringify(
          context.memory.map((m) => ({
            path: m.path,
            purpose: "memory",
          }))
        ),
        JSON.stringify({ max_input: 100000, reserved_system: 5000 })
      );
    return id;
  }

  writeScratchpad(
    projectName: string,
    runId: string,
    filename: string,
    content: string
  ): string {
    const { mkdirSync, writeFileSync } = require("fs");
    const dir = join(this.scratchpadRoot, projectName, runId);
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, filename);
    writeFileSync(filePath, content);
    return filePath;
  }
}
