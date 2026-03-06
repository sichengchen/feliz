import { existsSync } from "fs";
import { generateConfig, writeConfigFile } from "../config/writer.ts";

type PromptFn = (message?: string) => string | null;

export async function runInit(
  configPath: string,
  promptFn: PromptFn = globalThis.prompt
): Promise<void> {
  if (existsSync(configPath)) {
    console.log(`Config file already exists: ${configPath}`);
    console.log("To reconfigure, delete it first and re-run `feliz init`.");
    return;
  }

  console.log("Feliz Setup");
  console.log("");

  let oauthToken: string;
  const envToken = process.env.LINEAR_OAUTH_TOKEN;
  if (envToken) {
    const useEnv = promptFn("LINEAR_OAUTH_TOKEN is set. Use it? [Y/n]") ?? "Y";
    if (useEnv.toLowerCase() === "n") {
      const entered = promptFn("Enter Linear OAuth token:");
      if (!entered) throw new Error("OAuth token is required");
      oauthToken = entered;
    } else {
      oauthToken = "$LINEAR_OAUTH_TOKEN";
    }
  } else {
    const entered = promptFn("Enter Linear OAuth token:");
    if (!entered) throw new Error("OAuth token is required");
    oauthToken = entered;
  }

  const projectName = promptFn("Project name:");
  if (!projectName) throw new Error("Project name is required");

  const repo = promptFn("Git repo URL:");
  if (!repo) throw new Error("Repo URL is required");

  const linearProject = promptFn("Linear project name:");
  if (!linearProject) throw new Error("Linear project name is required");

  const content = generateConfig({ oauthToken, projectName, repo, linearProject });
  writeConfigFile(configPath, content);

  console.log("");
  console.log(`Config written to ${configPath}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review the config: feliz config show");
  console.log("  2. Start Feliz:       feliz start");
}
