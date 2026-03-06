export interface PublishParams {
  workDir: string;
  branchName: string;
  identifier: string;
  title: string;
  linearUrl: string;
  summary: string;
  filesChanged: string[];
  testResults: string | null;
}

export interface PublishResult {
  prUrl: string;
}

export interface GateResult {
  passed: boolean;
  exitCode: number;
  output: string;
}

export class Publisher {
  buildPrTitle(identifier: string, title: string): string {
    return `[${identifier}] ${title}`;
  }

  buildPrBody(params: {
    linearUrl: string;
    summary: string;
    filesChanged: string[];
    testResults: string | null;
  }): string {
    const sections: string[] = [];

    sections.push(`## Linear Issue\n\n${params.linearUrl}`);
    sections.push(`## Summary\n\n${params.summary}`);

    if (params.filesChanged.length > 0) {
      sections.push(
        `## Files Changed\n\n${params.filesChanged.map((f) => `- \`${f}\``).join("\n")}`
      );
    }

    if (params.testResults) {
      sections.push(`## Test Results\n\n\`\`\`\n${params.testResults}\n\`\`\``);
    }

    return sections.join("\n\n");
  }

  async pushBranch(workDir: string, branchName: string): Promise<void> {
    const result = Bun.spawnSync(
      ["git", "push", "-u", "origin", branchName],
      { cwd: workDir }
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to push branch: ${result.stderr.toString()}`);
    }
  }

  async createPr(
    workDir: string,
    title: string,
    body: string,
    baseBranch: string
  ): Promise<string> {
    const result = Bun.spawnSync(
      ["gh", "pr", "create", "--title", title, "--body", body, "--base", baseBranch],
      { cwd: workDir }
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create PR: ${result.stderr.toString()}`);
    }
    return result.stdout.toString().trim();
  }

  async publish(params: PublishParams, baseBranch: string): Promise<PublishResult> {
    await this.pushBranch(params.workDir, params.branchName);

    const title = this.buildPrTitle(params.identifier, params.title);
    const body = this.buildPrBody({
      linearUrl: params.linearUrl,
      summary: params.summary,
      filesChanged: params.filesChanged,
      testResults: params.testResults,
    });

    const prUrl = await this.createPr(params.workDir, title, body, baseBranch);
    return { prUrl };
  }

  async runGate(workDir: string, command: string): Promise<GateResult> {
    const result = Bun.spawnSync(["sh", "-c", command], { cwd: workDir });
    return {
      passed: result.exitCode === 0,
      exitCode: result.exitCode,
      output: result.stdout.toString() + result.stderr.toString(),
    };
  }
}
