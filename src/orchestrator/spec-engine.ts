import type { Database } from "../db/database.ts";
import type { AgentAdapter } from "../agents/adapter.ts";
import { ContextAssembler } from "../context/assembler.ts";
import { newId } from "../id.ts";

interface SpecDraftParams {
  workItemId: string;
  workDir: string;
  specDir: string;
}

interface SpecDraftResult {
  success: boolean;
  files?: string[];
}

export class SpecEngine {
  private db: Database;
  private adapter: AgentAdapter;

  constructor(db: Database, adapter: AgentAdapter) {
    this.db = db;
    this.adapter = adapter;
  }

  buildSpecDraftPrompt(params: {
    identifier: string;
    title: string;
    description: string;
    specDir: string;
    existingSpecs: string | null;
  }): string {
    const sections: string[] = [];

    sections.push(`You are drafting a specification for issue ${params.identifier}: ${params.title}

## Issue Description

${params.description}`);

    if (params.existingSpecs) {
      sections.push(`## Existing Specs

The following specs already exist in this project. Use them as context to understand
existing design decisions and conventions. Update them if necessary.

${params.existingSpecs}`);
    }

    sections.push(`## Instructions

Draft a specification in markdown format. Store spec files under the "${params.specDir}/" directory.

Each spec must include both **system design** and **behavioral cases**:

### System Design Sections

- **Overview**: What this feature does and why it exists
- **Design**: Technical design including:
  - Data Model (tables, schemas, types)
  - API (endpoints, methods, parameters)
  - Component interactions and invariants

### Behavioral Cases

Enumerate the expected behaviors as structured scenarios in Given/When/Then format:

- **Given** a precondition
- **When** an action occurs
- **Then** the expected outcome
- **And** additional outcomes

Cover both happy paths and error cases.

Output the spec content directly.`);

    return sections.join("\n\n");
  }

  async draftSpec(params: SpecDraftParams): Promise<SpecDraftResult> {
    const wi = this.db.getWorkItem(params.workItemId);
    if (!wi) return { success: false };

    // Read existing specs for context
    const assembler = new ContextAssembler(this.db, "");
    const existingSpecs = assembler.readSpecsAsText(
      params.workDir,
      params.specDir
    );

    const prompt = this.buildSpecDraftPrompt({
      identifier: wi.linear_identifier,
      title: wi.title,
      description: wi.description,
      specDir: params.specDir,
      existingSpecs,
    });

    const result = await this.adapter.execute({
      runId: newId(),
      workDir: params.workDir,
      prompt,
      timeout_ms: 600000,
      maxTurns: 20,
      approvalPolicy: "auto",
      env: {},
    });

    if (result.status !== "succeeded") {
      return { success: false };
    }

    // Record history event
    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: null,
      event_type: "spec.drafted",
      payload: {
        files: result.filesChanged,
        summary: result.summary,
      },
    });

    // Transition to spec_review
    this.db.updateWorkItemOrchestrationState(wi.id, "spec_review");

    return { success: true, files: result.filesChanged };
  }

  approveSpec(workItemId: string): void {
    const wi = this.db.getWorkItem(workItemId);
    if (!wi || wi.orchestration_state !== "spec_review") return;

    this.db.appendHistory({
      id: newId(),
      project_id: wi.project_id,
      work_item_id: wi.id,
      run_id: null,
      event_type: "spec.approved",
      payload: {},
    });

    this.db.updateWorkItemOrchestrationState(wi.id, "queued");
  }
}
