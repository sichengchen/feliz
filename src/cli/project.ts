import { readFileSync, writeFileSync } from "fs";
import { parse, stringify } from "yaml";

interface ProjectEntry {
  name: string;
  repo: string;
  linear_project: string;
  branch: string;
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

  const idx = projects.findIndex((p) => p.name === name);
  if (idx === -1) {
    throw new Error(`Project "${name}" not found in config`);
  }

  projects.splice(idx, 1);
  doc.projects = projects;

  writeFileSync(configPath, stringify(doc), "utf-8");
}
