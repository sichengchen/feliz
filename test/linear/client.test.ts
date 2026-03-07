import { describe, expect, test, mock } from "bun:test";
import { LinearClient, type LinearIssue, type LinearProject } from "../../src/linear/client.ts";

function makeConnection<T>(nodes: T[], hasNextPage = false) {
  return {
    nodes,
    pageInfo: { hasNextPage, endCursor: hasNextPage ? "cursor1" : null },
    fetchNext: mock(async function (this: any) {
      this.nodes = [...this.nodes, ...nodes];
      this.pageInfo = { hasNextPage: false, endCursor: null };
      return this;
    }),
  };
}

function makeSdkIssue(overrides: Record<string, any> = {}) {
  return {
    id: "lin-1",
    identifier: "BAC-1",
    title: "Add login",
    description: "Implement login flow",
    priority: 1,
    branchName: "bac-1",
    url: "https://linear.app/org/issue/BAC-1",
    state: Promise.resolve({ name: "Todo" }),
    labels: mock(() => Promise.resolve({ nodes: [{ name: "feliz" }] })),
    relations: mock(() => Promise.resolve({ nodes: [] })),
    ...overrides,
  };
}

function makeSdkClient(overrides: Record<string, any> = {}) {
  return {
    projects: mock(() => Promise.resolve(makeConnection([
      { id: "proj-1", name: "Backend API" },
      { id: "proj-2", name: "Frontend App" },
    ]))),
    issues: mock(() => Promise.resolve(makeConnection([makeSdkIssue()]))),
    updateIssue: mock(() => Promise.resolve({ success: true })),
    createComment: mock(() => Promise.resolve({ success: true })),
    createAgentActivity: mock(() => Promise.resolve({ success: true })),
    ...overrides,
  };
}

describe("LinearClient", () => {
  test("fetches issues for a project", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("test-key", sdk as any);
    const result = await client.fetchProjectIssues("Backend API");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.id).toBe("lin-1");
    expect(result.issues[0]!.identifier).toBe("BAC-1");
    expect(result.issues[0]!.title).toBe("Add login");
    expect(result.issues[0]!.state).toBe("Todo");
    expect(result.issues[0]!.labels).toEqual(["feliz"]);
    expect(result.issues[0]!.priority).toBe(1);
  });

  test("passes correct filter to SDK issues query", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("test-key", sdk as any);
    await client.fetchProjectIssues("Backend API");
    expect(sdk.issues).toHaveBeenCalledTimes(1);
    const call = sdk.issues.mock.calls[0] as any[];
    expect(call[0]).toEqual({
      filter: { project: { name: { eq: "Backend API" } } },
      first: 50,
      orderBy: "createdAt",
    });
  });

  test("paginates when hasNextPage is true", async () => {
    const issue1 = makeSdkIssue({ id: "lin-1", identifier: "B-1", title: "A" });
    const issue2 = makeSdkIssue({ id: "lin-2", identifier: "B-2", title: "B" });

    const connection = {
      nodes: [issue1],
      pageInfo: { hasNextPage: true, endCursor: "cursor1" },
      fetchNext: mock(async function (this: any) {
        this.nodes = [issue1, issue2];
        this.pageInfo = { hasNextPage: false, endCursor: null };
        return this;
      }),
    };

    const sdk = makeSdkClient({
      issues: mock(() => Promise.resolve(connection)),
    });
    const client = new LinearClient("key", sdk as any);
    const result = await client.fetchProjectIssues("X");
    expect(result.issues).toHaveLength(2);
    expect(connection.fetchNext).toHaveBeenCalledTimes(1);
  });

  test("rateLimitLow is always false", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("key", sdk as any);
    const result = await client.fetchProjectIssues("X");
    expect(result.rateLimitLow).toBe(false);
  });

  test("parses relations as blocker_ids", async () => {
    const issue = makeSdkIssue({
      relations: mock(() =>
        Promise.resolve({
          nodes: [
            {
              type: "blocks",
              relatedIssueId: "lin-2",
            },
          ],
        })
      ),
    });
    const sdk = makeSdkClient({
      issues: mock(() => Promise.resolve(makeConnection([issue]))),
    });
    const client = new LinearClient("key", sdk as any);
    const result = await client.fetchProjectIssues("X");
    expect(result.issues[0]!.blocker_ids).toEqual(["lin-2"]);
  });

  test("handles null description", async () => {
    const issue = makeSdkIssue({ description: null });
    const sdk = makeSdkClient({
      issues: mock(() => Promise.resolve(makeConnection([issue]))),
    });
    const client = new LinearClient("key", sdk as any);
    const result = await client.fetchProjectIssues("X");
    expect(result.issues[0]!.description).toBe("");
  });

  test("updates issue state", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("key", sdk as any);
    await client.updateIssueState("lin-1", "state-id-123");
    expect(sdk.updateIssue).toHaveBeenCalledTimes(1);
    expect(sdk.updateIssue).toHaveBeenCalledWith("lin-1", {
      stateId: "state-id-123",
    });
  });

  test("creates a comment on an issue", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("key", sdk as any);
    await client.createComment("lin-1", "Hello from Feliz");
    expect(sdk.createComment).toHaveBeenCalledTimes(1);
    expect(sdk.createComment).toHaveBeenCalledWith({
      issueId: "lin-1",
      body: "Hello from Feliz",
    });
  });

  test("passes comment content without manual escaping", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("key", sdk as any);
    const rawComment = `Line 1\nHe said "quote"`;
    await client.createComment("lin-escaped", rawComment);
    expect(sdk.createComment).toHaveBeenCalledWith({
      issueId: "lin-escaped",
      body: rawComment,
    });
  });
});

describe("LinearClient.fetchProjects", () => {
  test("returns projects", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("key", sdk as any);
    const projects = await client.fetchProjects();
    expect(projects).toHaveLength(2);
    expect(projects[0]!.id).toBe("proj-1");
    expect(projects[0]!.name).toBe("Backend API");
    expect(projects[1]!.name).toBe("Frontend App");
  });

  test("paginates projects", async () => {
    const connection = {
      nodes: [{ id: "proj-1", name: "A" }],
      pageInfo: { hasNextPage: true, endCursor: "cursor1" },
      fetchNext: mock(async function (this: any) {
        this.nodes = [
          { id: "proj-1", name: "A" },
          { id: "proj-2", name: "B" },
        ];
        this.pageInfo = { hasNextPage: false, endCursor: null };
        return this;
      }),
    };
    const sdk = makeSdkClient({
      projects: mock(() => Promise.resolve(connection)),
    });
    const client = new LinearClient("key", sdk as any);
    const projects = await client.fetchProjects();
    expect(projects).toHaveLength(2);
    expect(connection.fetchNext).toHaveBeenCalledTimes(1);
  });

  test("handles empty project list", async () => {
    const sdk = makeSdkClient({
      projects: mock(() => Promise.resolve(makeConnection([]))),
    });
    const client = new LinearClient("key", sdk as any);
    const projects = await client.fetchProjects();
    expect(projects).toHaveLength(0);
  });
});

describe("LinearClient.emitThought", () => {
  test("sends thought agent activity with content object", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("token", sdk as any);
    await client.emitThought("session-1", "Looking into this...");
    expect(sdk.createAgentActivity).toHaveBeenCalledTimes(1);
    expect(sdk.createAgentActivity).toHaveBeenCalledWith({
      agentSessionId: "session-1",
      content: { type: "thought", body: "Looking into this..." },
    });
  });

  test("throws on failure", async () => {
    const sdk = makeSdkClient({
      createAgentActivity: mock(() => Promise.reject(new Error("API error"))),
    });
    const client = new LinearClient("token", sdk as any);
    expect(client.emitThought("s", "t")).rejects.toThrow();
  });
});

describe("LinearClient.emitComment", () => {
  test("sends response agent activity with content object", async () => {
    const sdk = makeSdkClient();
    const client = new LinearClient("token", sdk as any);
    await client.emitComment("session-2", "Done!");
    expect(sdk.createAgentActivity).toHaveBeenCalledTimes(1);
    expect(sdk.createAgentActivity).toHaveBeenCalledWith({
      agentSessionId: "session-2",
      content: { type: "response", body: "Done!" },
    });
  });

  test("throws on failure", async () => {
    const sdk = makeSdkClient({
      createAgentActivity: mock(() => Promise.reject(new Error("API error"))),
    });
    const client = new LinearClient("token", sdk as any);
    expect(client.emitComment("s", "t")).rejects.toThrow();
  });
});
