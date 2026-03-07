import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { parse, stringify } from "yaml";

const SCOPES = "app:mentionable,app:assignable,read,write,issues:create";
const DEFAULT_PORT = 8374;
const TIMEOUT_MS = 5 * 60 * 1000;

export function buildAuthorizationUrl(
  clientId: string,
  callbackPort: number
): string {
  const redirectUri = `http://localhost:${callbackPort}/auth/callback`;
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

  const json = await response.json();

  if (!response.ok || !json.access_token) {
    throw new Error(
      `Token exchange failed: ${json.error || JSON.stringify(json)}`
    );
  }

  return json;
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
  useEnvVar: boolean
): void {
  const tokenValue = useEnvVar ? "$LINEAR_OAUTH_TOKEN" : token;

  if (existsSync(configPath)) {
    const content = readFileSync(configPath, "utf-8");
    const doc = parse(content) as Record<string, unknown>;
    if (!doc.linear) {
      doc.linear = {};
    }
    (doc.linear as Record<string, unknown>).oauth_token = tokenValue;
    writeFileSync(configPath, stringify(doc), "utf-8");
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
    const doc = {
      linear: { oauth_token: tokenValue },
      projects: [],
    };
    writeFileSync(configPath, stringify(doc), "utf-8");
  }
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
  const redirectUri = `http://localhost:${port}/auth/callback`;

  const authUrl = buildAuthorizationUrl(clientId, port);
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

  writeTokenToConfig(configPath, tokenResult.access_token, useEnvVar);
  console.log(`Token saved to ${configPath}`);

  if (useEnvVar) {
    console.log("");
    console.log(
      "Set the LINEAR_OAUTH_TOKEN environment variable to the token value:"
    );
    console.log(`  export LINEAR_OAUTH_TOKEN=${tokenResult.access_token}`);
  }
}

function waitForCallback(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.stop();
      reject(new Error("OAuth callback timed out after 5 minutes"));
    }, TIMEOUT_MS);

    const server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/auth/callback") {
          const code = url.searchParams.get("code");
          if (!code) {
            return new Response("Missing code parameter", { status: 400 });
          }

          clearTimeout(timeout);
          // Defer server stop to after response is sent
          setTimeout(() => server.stop(), 100);

          resolve(code);

          return new Response(
            `<!DOCTYPE html>
<html>
<head><title>Feliz</title></head>
<body>
<h1>Authorization complete</h1>
<p>You can close this tab.</p>
</body>
</html>`,
            {
              headers: { "Content-Type": "text/html" },
            }
          );
        }

        return new Response("Not found", { status: 404 });
      },
      error() {
        clearTimeout(timeout);
        reject(new Error(`Failed to start callback server on port ${port}`));
        return new Response("Internal error", { status: 500 });
      },
    });
  });
}
