import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/feliz-auth-test";

describe("buildAuthorizationUrl", () => {
  test("includes all required params", async () => {
    const { buildAuthorizationUrl } = await import("../../src/cli/auth.ts");
    const url = buildAuthorizationUrl("client_123", 8374);

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://linear.app/oauth/authorize"
    );
    expect(parsed.searchParams.get("client_id")).toBe("client_123");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:8374/auth/callback"
    );
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("actor")).toBe("app");
  });

  test("includes required scopes", async () => {
    const { buildAuthorizationUrl } = await import("../../src/cli/auth.ts");
    const url = buildAuthorizationUrl("client_123", 8374);
    const parsed = new URL(url);
    const scope = parsed.searchParams.get("scope")!;

    expect(scope).toContain("app:mentionable");
    expect(scope).toContain("app:assignable");
    expect(scope).toContain("read");
    expect(scope).toContain("write");
    expect(scope).toContain("issues:create");
  });

  test("uses custom port in redirect_uri", async () => {
    const { buildAuthorizationUrl } = await import("../../src/cli/auth.ts");
    const url = buildAuthorizationUrl("client_123", 9999);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:9999/auth/callback"
    );
  });
});

describe("exchangeCodeForToken", () => {
  test("sends correct POST request and returns token", async () => {
    const { exchangeCodeForToken } = await import("../../src/cli/auth.ts");

    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return new Response(
        JSON.stringify({
          access_token: "lin_oauth_test123",
          token_type: "Bearer",
          expires_in: 315360000,
          scope: ["read", "write"],
        }),
        { status: 200 }
      );
    };

    const result = await exchangeCodeForToken({
      clientId: "cid",
      clientSecret: "csecret",
      code: "auth_code_abc",
      redirectUri: "http://localhost:8374/auth/callback",
      fetchFn: mockFetch as typeof fetch,
    });

    expect(capturedUrl).toBe("https://api.linear.app/oauth/token");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const body = capturedInit?.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("client_id")).toBe("cid");
    expect(params.get("client_secret")).toBe("csecret");
    expect(params.get("code")).toBe("auth_code_abc");
    expect(params.get("redirect_uri")).toBe(
      "http://localhost:8374/auth/callback"
    );

    expect(result.access_token).toBe("lin_oauth_test123");
  });

  test("throws on failed token exchange", async () => {
    const { exchangeCodeForToken } = await import("../../src/cli/auth.ts");

    const mockFetch = async () =>
      new Response(
        JSON.stringify({ error: "invalid_grant" }),
        { status: 400 }
      );

    await expect(
      exchangeCodeForToken({
        clientId: "cid",
        clientSecret: "csecret",
        code: "bad_code",
        redirectUri: "http://localhost:8374/auth/callback",
        fetchFn: mockFetch as typeof fetch,
      })
    ).rejects.toThrow();
  });
});

describe("verifyToken", () => {
  test("queries viewer and returns identity", async () => {
    const { verifyToken } = await import("../../src/cli/auth.ts");

    let capturedAuth = "";
    const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
      return new Response(
        JSON.stringify({
          data: { viewer: { id: "user_1", name: "Feliz Bot" } },
        }),
        { status: 200 }
      );
    };

    const viewer = await verifyToken(
      "lin_oauth_test123",
      mockFetch as typeof fetch
    );

    expect(capturedAuth).toBe("Bearer lin_oauth_test123");
    expect(viewer).toEqual({ id: "user_1", name: "Feliz Bot" });
  });

  test("returns null on verification failure", async () => {
    const { verifyToken } = await import("../../src/cli/auth.ts");

    const mockFetch = async () =>
      new Response(
        JSON.stringify({ errors: [{ message: "Unauthorized" }] }),
        { status: 200 }
      );

    const viewer = await verifyToken(
      "bad_token",
      mockFetch as typeof fetch
    );

    expect(viewer).toBeNull();
  });
});

describe("writeTokenToConfig", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  test("creates new feliz.yml when none exists", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_new_token", false);

    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_new_token");
  });

  test("writes env var reference when useEnvVar is true", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_new_token", true);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("$LINEAR_OAUTH_TOKEN");
    expect(content).not.toContain("lin_oauth_new_token");
  });

  test("updates existing feliz.yml without clobbering other fields", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "feliz.yml");

    writeFileSync(
      configPath,
      `linear:
  oauth_token: old_token
projects:
  - name: my-project
    repo: git@github.com:org/repo.git
    linear_project: My Project
agent:
  default: claude-code
`,
      "utf-8"
    );

    writeTokenToConfig(configPath, "lin_oauth_updated", false);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_updated");
    expect(content).not.toContain("old_token");
    expect(content).toContain("my-project");
    expect(content).toContain("claude-code");
  });

  test("creates nested directories for config path", async () => {
    const { writeTokenToConfig } = await import("../../src/cli/auth.ts");
    const configPath = join(TEST_DIR, "a", "b", "feliz.yml");

    writeTokenToConfig(configPath, "lin_oauth_nested", false);

    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, "utf-8");
    expect(content).toContain("lin_oauth_nested");
  });
});
