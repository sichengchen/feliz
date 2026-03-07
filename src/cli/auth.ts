import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { parse, stringify } from "yaml";

const SCOPES = "app:mentionable,app:assignable,read,write,issues:create";
export const DEFAULT_PORT = 3421;
const TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 500;

export const AUTH_CODE_FILE = join(tmpdir(), "feliz-auth-code");

export function writeAuthCode(code: string): void {
  writeFileSync(AUTH_CODE_FILE, code, "utf-8");
}

export function clearAuthCode(): void {
  if (existsSync(AUTH_CODE_FILE)) unlinkSync(AUTH_CODE_FILE);
}

export const AUTH_CALLBACK_HTML = `<!DOCTYPE html>
<html>
<head><title>Feliz</title></head>
<body>
<h1>Authorization complete</h1>
<p>You can close this tab.</p>
</body>
</html>`;

export function buildAuthorizationUrl(
  clientId: string,
  redirectUri: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    actor: "app",
  });
  return `https://linear.app/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<{ access_token: string; token_type: string; expires_in: number; scope: string[] }> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });

  const response = await fetchFn("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string[];
    error?: string;
  };

  if (!response.ok || !json.access_token) {
    throw new Error(
      `Token exchange failed: ${json.error || JSON.stringify(json)}`
    );
  }

  return json as { access_token: string; token_type: string; expires_in: number; scope: string[] };
}

export async function verifyToken(
  token: string,
  fetchFn?: typeof fetch
): Promise<{ id: string; name: string } | null> {
  const fn = fetchFn ?? globalThis.fetch;
  try {
    const response = await fn("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: "{ viewer { id name } }" }),
    });

    const json = (await response.json()) as {
      data?: { viewer?: { id: string; name: string } };
    };

    if (!json.data?.viewer) return null;
    return json.data.viewer;
  } catch {
    return null;
  }
}

export function writeTokenToConfig(
  configPath: string,
  token: string,
  useEnvVar: boolean,
  viewerId?: string
): void {
  const tokenValue = useEnvVar ? "$LINEAR_OAUTH_TOKEN" : token;

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    const doc = parse(content) as Record<string, unknown>;
    if (!doc.linear) {
      doc.linear = {};
    }
    const linear = doc.linear as Record<string, unknown>;
    linear.oauth_token = tokenValue;
    if (viewerId) {
      linear.app_user_id = viewerId;
    }
    writeFileSync(configPath, stringify(doc), "utf-8");
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
    const linear: Record<string, string> = { oauth_token: tokenValue };
    if (viewerId) {
      linear.app_user_id = viewerId;
    }
    const doc = { linear, projects: [] as unknown[] };
    writeFileSync(configPath, stringify(doc), "utf-8");
  }
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "..." + token.slice(-4);
}

function tryOpenBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    Bun.spawn([cmd, url], { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    // Browser open is best-effort
  }
}

export async function runAuth(
  configPath: string,
  flags: Record<string, string> = {},
  promptFn: (msg?: string) => string | null = globalThis.prompt
): Promise<void> {
  const clientId =
    flags["client-id"] ?? promptFn("Linear OAuth App Client ID:");
  if (!clientId) throw new Error("Client ID is required");

  const clientSecret =
    flags["client-secret"] ?? promptFn("Linear OAuth App Client Secret:");
  if (!clientSecret) throw new Error("Client Secret is required");

  const port = parseInt(flags.port ?? String(DEFAULT_PORT), 10);
  const redirectUri = flags["callback-url"] ?? `http://localhost:${port}/auth/callback`;

  const authUrl = buildAuthorizationUrl(clientId, redirectUri);
  console.log("");
  console.log("Open this URL to authorize Feliz with Linear:");
  console.log("");
  console.log(`  ${authUrl}`);
  console.log("");

  tryOpenBrowser(authUrl);

  const code = await waitForCallback(port);

  console.log("Exchanging code for access token...");
  const tokenResult = await exchangeCodeForToken({
    clientId,
    clientSecret,
    code,
    redirectUri,
  });

  console.log("Verifying token...");
  const viewer = await verifyToken(tokenResult.access_token);
  if (viewer) {
    console.log(`Authenticated as: ${viewer.name} (${viewer.id})`);
  } else {
    console.warn(
      "Warning: Could not verify token via viewer query. Saving token anyway."
    );
  }

  const storeChoice =
    promptFn(
      "Store as $LINEAR_OAUTH_TOKEN env var reference? [Y/n]"
    ) ?? "Y";
  const useEnvVar = storeChoice.toLowerCase() !== "n";

  writeTokenToConfig(configPath, tokenResult.access_token, useEnvVar, viewer?.id);
  console.log(`Token saved to ${configPath}`);

  if (useEnvVar) {
    const masked = maskToken(tokenResult.access_token);
    console.log("");
    console.log(
      `Set the LINEAR_OAUTH_TOKEN environment variable to your token (${masked}).`
    );
    console.log("Add to your .env file or shell profile. The full token was");
    console.log("shown only during the OAuth redirect — it is not stored in logs.");
  }

  console.log("");
  console.log("Next steps:");
  console.log("  1. Configure Linear webhooks:");
  console.log("     - Go to your Linear OAuth app settings");
  console.log("     - Enable webhooks and select 'Agent session events'");
  console.log(`     - Set webhook URL to: https://<your-host>:${port}/webhook/linear`);
  console.log("  2. Add a project: feliz project add");
  console.log("  3. Start Feliz:   feliz start");
}

export function waitForCallback(port: number, timeoutMs: number = TIMEOUT_MS): Promise<string> {
  clearAuthCode();

  try {
    return waitViaServer(port, timeoutMs);
  } catch (e: any) {
    if (e?.code === "EADDRINUSE") {
      console.log(`Port ${port} is in use (Feliz server running). Waiting for callback via server...`);
      return waitViaPolling(timeoutMs);
    }
    throw e;
  }
}

function waitViaServer(port: number, timeoutMs: number): Promise<string> {
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        if (!code) {
          return new Response("Missing code parameter", { status: 400 });
        }

        setTimeout(() => server.stop(), 100);
        resolveCallback(code);

        return new Response(AUTH_CALLBACK_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  let resolveCallback: (code: string) => void;
  let rejectCallback: (err: Error) => void;

  const promise = new Promise<string>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });

  const timeout = setTimeout(() => {
    server.stop();
    rejectCallback(new Error("OAuth callback timed out after 5 minutes"));
  }, timeoutMs);

  return promise.finally(() => clearTimeout(timeout));
}

function waitViaPolling(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const poll = setInterval(() => {
      if (existsSync(AUTH_CODE_FILE)) {
        const code = readFileSync(AUTH_CODE_FILE, "utf-8").trim();
        if (code) {
          clearInterval(poll);
          clearAuthCode();
          resolve(code);
        }
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        reject(new Error("OAuth callback timed out after 5 minutes"));
      }
    }, POLL_INTERVAL_MS);
  });
}
