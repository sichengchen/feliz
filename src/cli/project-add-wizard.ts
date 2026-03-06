import type { LinearProject } from "../linear/client.ts";
import type { RepoScaffoldAnswers } from "../config/writer.ts";
import { projectNameFromRepoUrl } from "./project.ts";

type PromptFn = (msg: string) => string | null;

export interface WizardDeps {
  prompt: PromptFn;
  fetchProjects: () => Promise<LinearProject[]>;
  cloneRepo: (projectName: string, repoUrl: string) => Promise<string>;
  repoHasFelizConfig: (repoPath: string) => boolean;
  writeRepoScaffold: (repoPath: string, answers: RepoScaffoldAnswers) => void;
  gitCommitAndPush: (repoPath: string, branch: string) => void;
  addProjectToConfig: (
    configPath: string,
    project: {
      name: string;
      repo: string;
      linear_project: string;
      branch: string;
    }
  ) => void;
  configPath: string;
}

export async function runProjectAddWizard(deps: WizardDeps): Promise<void> {
  console.log("Fetching Linear projects...");
  const projects = await deps.fetchProjects();

  if (projects.length === 0) {
    throw new Error("No projects found in Linear.");
  }

  console.log("");
  for (let i = 0; i < projects.length; i++) {
    console.log(`  ${i + 1}. ${projects[i]!.name}`);
  }
  console.log("");

  const selectionStr = deps.prompt("Select a project (number):");
  const selection = parseInt(selectionStr || "", 10);
  if (isNaN(selection) || selection < 1 || selection > projects.length) {
    throw new Error("Invalid selection");
  }

  const linearProject = projects[selection - 1]!;

  const repoUrl = deps.prompt("Git repo URL:");
  if (!repoUrl) throw new Error("Repo URL is required");

  const branchInput = deps.prompt("Base branch (main):");
  const branch = branchInput || "main";

  const projectName = projectNameFromRepoUrl(repoUrl);

  console.log(`Cloning ${repoUrl}...`);
  const repoPath = await deps.cloneRepo(projectName, repoUrl);

  if (deps.repoHasFelizConfig(repoPath)) {
    console.log("Found existing .feliz/ config, skipping scaffold.");
  } else {
    const agentAdapter = deps.prompt("Agent adapter (claude-code):") || "claude-code";
    const specsInput = deps.prompt("Enable specs? [y/N]:");
    const specsEnabled = specsInput?.toLowerCase() === "y";
    const testCommand = deps.prompt("Test command (optional):") || undefined;
    const lintCommand = deps.prompt("Lint command (optional):") || undefined;

    const scaffoldAnswers: RepoScaffoldAnswers = {
      agentAdapter,
      specsEnabled,
      testCommand,
      lintCommand,
    };

    deps.writeRepoScaffold(repoPath, scaffoldAnswers);
    console.log("Created .feliz/ config and WORKFLOW.md");

    const pushInput = deps.prompt("Commit and push .feliz/ config? [Y/n]:");
    if (pushInput?.toLowerCase() !== "n") {
      deps.gitCommitAndPush(repoPath, branch);
      console.log("Pushed config to remote.");
    }
  }

  deps.addProjectToConfig(deps.configPath, {
    name: projectName,
    repo: repoUrl,
    linear_project: linearProject.name,
    branch,
  });

  console.log(`Added project "${projectName}".`);
}
