import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  loadFelizConfig,
  loadRepoConfig,
  loadPipelineConfig,
} from "../config/loader.ts";
import { WorkspaceManager } from "../workspace/manager.ts";

export interface ConfigValidationResult {
  validated_projects: number;
  checked_repo_configs: number;
  checked_pipelines: number;
}

export function validateAllConfigs(configPath: string): ConfigValidationResult {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const config = loadFelizConfig(readFileSync(configPath, "utf-8"));
  const workspace = new WorkspaceManager(config.storage.workspace_root);

  let checkedRepoConfigs = 0;
  let checkedPipelines = 0;

  for (const project of config.projects) {
    const repoPath = workspace.getRepoPath(project.name);
    if (!existsSync(repoPath)) {
      continue;
    }

    const repoConfigPath = join(repoPath, ".feliz", "config.yml");
    if (existsSync(repoConfigPath)) {
      try {
        loadRepoConfig(readFileSync(repoConfigPath, "utf-8"));
        checkedRepoConfigs += 1;
      } catch (e: any) {
        throw new Error(
          `Invalid repo config for project "${project.name}" at ${repoConfigPath}: ${e.message}`
        );
      }
    }

    const pipelinePath = join(repoPath, ".feliz", "pipeline.yml");
    if (existsSync(pipelinePath)) {
      try {
        loadPipelineConfig(readFileSync(pipelinePath, "utf-8"));
        checkedPipelines += 1;
      } catch (e: any) {
        throw new Error(
          `Invalid pipeline config for project "${project.name}" at ${pipelinePath}: ${e.message}`
        );
      }
    }
  }

  return {
    validated_projects: config.projects.length,
    checked_repo_configs: checkedRepoConfigs,
    checked_pipelines: checkedPipelines,
  };
}
