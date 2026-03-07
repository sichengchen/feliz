import { describe, expect, test, mock } from "bun:test";
import {
  runProjectAddWizard,
  type WizardDeps,
} from "../../src/cli/project-add-wizard.ts";

function makeDeps(overrides: Partial<WizardDeps> = {}): WizardDeps {
  const prompts: string[] = [];
  let promptIdx = 0;

  return {
    prompt: mock((msg: string) => {
      const answers = (overrides as any)._answers ?? [];
      return answers[promptIdx++] ?? null;
    }) as any,
    fetchProjects: mock(async () => [
      { id: "proj-1", name: "Backend API" },
      { id: "proj-2", name: "Frontend App" },
    ]) as any,
    cloneRepo: mock(async (_name: string, _url: string) => "/tmp/repo") as any,
    repoHasFelizConfig: mock((_path: string) => false) as any,
    writeRepoScaffoldWithAgent: mock(async (_path: string, _adapter: string, _answers: any) => ({
      success: false,
      reason: "adapter unavailable",
    })) as any,
    writeRepoScaffold: mock((_path: string, _answers: any) => {}) as any,
    gitCommitAndPush: mock((_path: string, _branch: string) => {}) as any,
    addProjectToConfig: mock((_path: string, _project: any) => {}) as any,
    defaultScaffoldAdapter: "claude-code",
    configPath: "/tmp/feliz.yml",
    ...overrides,
  };
}

describe("runProjectAddWizard", () => {
  test("happy path: fetches projects, selects, falls back to template scaffold, pushes, adds to config", async () => {
    // Answers: select project "1", repo URL, branch default, scaffold answers, push yes
    let promptIdx = 0;
    const answers = [
      "1",                                         // project selection
      "git@github.com:org/backend-api.git",         // repo URL
      "",                                           // branch (default main)
      "claude-code",                                // agent adapter
      "n",                                          // specs enabled
      "npm test",                                   // test command
      "npm run lint",                               // lint command
      "y",                                          // commit & push
    ];
    const promptFn = mock((msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
    });

    await runProjectAddWizard(deps);

    expect(deps.fetchProjects).toHaveBeenCalledTimes(1);
    expect(deps.cloneRepo).toHaveBeenCalledWith("backend-api", "git@github.com:org/backend-api.git");
    expect(deps.repoHasFelizConfig).toHaveBeenCalledWith("/tmp/repo");
    expect(deps.writeRepoScaffoldWithAgent).toHaveBeenCalledTimes(1);
    expect(deps.writeRepoScaffold).toHaveBeenCalledTimes(1);
    expect(deps.gitCommitAndPush).toHaveBeenCalledWith("/tmp/repo", "main");
    expect(deps.addProjectToConfig).toHaveBeenCalledTimes(1);
    const addCall = (deps.addProjectToConfig as any).mock.calls[0];
    expect(addCall[0]).toBe("/tmp/feliz.yml");
    expect(addCall[1].name).toBe("backend-api");
    expect(addCall[1].repo).toBe("git@github.com:org/backend-api.git");
    expect(addCall[1].linear_project).toBe("Backend API");
    expect(addCall[1].branch).toBe("main");
  });

  test("skips scaffold when config already exists", async () => {
    let promptIdx = 0;
    const answers = [
      "2",                                         // project selection (Frontend App)
      "git@github.com:org/frontend-app.git",        // repo URL
      "develop",                                    // branch
    ];
    const promptFn = mock((msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
      repoHasFelizConfig: mock(() => true) as any,
    });

    await runProjectAddWizard(deps);

    expect(deps.writeRepoScaffoldWithAgent).not.toHaveBeenCalled();
    expect(deps.writeRepoScaffold).not.toHaveBeenCalled();
    expect(deps.gitCommitAndPush).not.toHaveBeenCalled();
    expect(deps.addProjectToConfig).toHaveBeenCalledTimes(1);
    const addCall = (deps.addProjectToConfig as any).mock.calls[0];
    expect(addCall[1].linear_project).toBe("Frontend App");
    expect(addCall[1].branch).toBe("develop");
  });

  test("skips push when user declines", async () => {
    let promptIdx = 0;
    const answers = [
      "1",                                         // project selection
      "git@github.com:org/backend-api.git",         // repo URL
      "",                                           // branch (default main)
      "claude-code",                                // agent adapter
      "n",                                          // specs enabled
      "",                                           // test command (none)
      "",                                           // lint command (none)
      "n",                                          // don't push
    ];
    const promptFn = mock((msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
    });

    await runProjectAddWizard(deps);

    expect(deps.writeRepoScaffoldWithAgent).toHaveBeenCalledTimes(1);
    expect(deps.writeRepoScaffold).toHaveBeenCalledTimes(1);
    expect(deps.gitCommitAndPush).not.toHaveBeenCalled();
    expect(deps.addProjectToConfig).toHaveBeenCalledTimes(1);
  });

  test("uses agent scaffold when available and successful", async () => {
    let promptIdx = 0;
    const answers = [
      "1",
      "git@github.com:org/backend-api.git",
      "",
      "claude-code",
      "y",
      "bun test",
      "bun run lint",
      "n",
    ];
    const promptFn = mock((_msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
      writeRepoScaffoldWithAgent: mock(async () => ({ success: true })) as any,
    });

    await runProjectAddWizard(deps);

    expect(deps.writeRepoScaffoldWithAgent).toHaveBeenCalledTimes(1);
    expect(deps.writeRepoScaffold).not.toHaveBeenCalled();
  });

  test("continues adding project when push fails", async () => {
    let promptIdx = 0;
    const answers = [
      "1",
      "git@github.com:org/backend-api.git",
      "",
      "claude-code",
      "n",
      "",
      "",
      "y",  // commit & push
    ];
    const promptFn = mock((msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
      gitCommitAndPush: mock((_path: string, _branch: string) => {
        throw new Error("Failed to push: remote: Write access not granted.");
      }) as any,
    });

    await runProjectAddWizard(deps);

    // Project should still be added despite push failure
    expect(deps.addProjectToConfig).toHaveBeenCalledTimes(1);
  });

  test("throws on invalid project selection", async () => {
    let promptIdx = 0;
    const answers = ["99"];
    const promptFn = mock((msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
    });

    await expect(runProjectAddWizard(deps)).rejects.toThrow("Invalid selection");
  });

  test("uses default branch when empty input", async () => {
    let promptIdx = 0;
    const answers = [
      "1",
      "git@github.com:org/backend-api.git",
      "",   // empty = default main
    ];
    const promptFn = mock((msg: string) => answers[promptIdx++] ?? null);

    const deps = makeDeps({
      prompt: promptFn as any,
      repoHasFelizConfig: mock(() => true) as any,
    });

    await runProjectAddWizard(deps);

    const addCall = (deps.addProjectToConfig as any).mock.calls[0];
    expect(addCall[1].branch).toBe("main");
  });
});
