import { readFileSync, writeFileSync, rmSync } from "fs";
import { homedir } from "os";
import { join, resolve, sep } from "path";
import { parse, stringify } from "yaml";

export function projectNameFromRepoUrl(url: string): string {
  if (!url) return "";
  const stripped = url.replace(/\.git$/, "");
  const sshMatch = stripped.match(/[:/]([^/]+)$/);
  if (sshMatch) return sshMatch[1]!;
  return stripped;
}

interface ProjectEntry {
  name: string;
  repo: string;
  linear_project: string;
  branch: string;
}

function resolveWorkspaceRoot(doc: Record<string, unknown>): string {
  const storage = (doc.storage as Record<string, unknown>) || {};
  const defaultDataDir = join(homedir(), ".feliz");
  return (
    (storage.workspace_root as string) ||
    join((storage.data_dir as string) || defaultDataDir, "workspaces")
  );
}

function resolveProjectWorkspacePath(workspaceRoot: string, projectName: string): string {
  const normalizedRoot = resolve(workspaceRoot);
  const normalizedProjectPath = resolve(normalizedRoot, projectName);
  if (
    normalizedProjectPath !== normalizedRoot &&
    !normalizedProjectPath.startsWith(`${normalizedRoot}${sep}`)
  ) {
    throw new Error(`Invalid project name: ${projectName}`);
  }
  return normalizedProjectPath;
}

export function addProjectToConfig(
  configPath: string,
  project: ProjectEntry
): void {
  const content = readFileSync(configPath, "utf-8");
  const doc = parse(content) as Record<string, unknown>;
  const projects = (doc.projects as Record<string, unknown>[]) || [];

  if (projects.some((p) => p.name === project.name)) {
    throw new Error(`Project "${project.name}" already exists in config`);
  }

  const entry: Record<string, string> = {
    name: project.name,
    repo: project.repo,
    linear_project: project.linear_project,
  };
  if (project.branch !== "main") {
    entry.branch = project.branch;
  }
  projects.push(entry);
  doc.projects = projects;

  writeFileSync(configPath, stringify(doc), "utf-8");
}

export function removeProjectFromConfig(
  configPath: string,
  name: string
): void {
  const content = readFileSync(configPath, "utf-8");
  const doc = parse(content) as Record<string, unknown>;
  const projects = (doc.projects as Record<string, unknown>[]) || [];
  const workspaceRoot = resolveWorkspaceRoot(doc);

  const idx = projects.findIndex((p) => p.name === name);
  if (idx === -1) {
    throw new Error(`Project "${name}" not found in config`);
  }

  projects.splice(idx, 1);
  doc.projects = projects;

  writeFileSync(configPath, stringify(doc), "utf-8");

  const projectWorkspacePath = resolveProjectWorkspacePath(workspaceRoot, name);
  rmSync(projectWorkspacePath, { recursive: true, force: true });
}
