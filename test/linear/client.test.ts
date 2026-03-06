import { describe, expect, test, mock, beforeEach } from "bun:test";
import { LinearClient, type LinearIssue, type LinearProject } from "../../src/linear/client.ts";

describe("LinearClient", () => {
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    fetchMock = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              issues: {
                nodes: [
                  {
                    id: "lin-1",
                    identifier: "BAC-1",
                    title: "Add login",
                    description: "Implement login flow",
                    priority: 1,
                    state: { name: "Todo" },
                    labels: { nodes: [{ name: "feliz" }] },
                    relations: { nodes: [] },
                    branchName: "bac-1",
                    url: "https://linear.app/org/issue/BAC-1",
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      })
    );
  });

  test("fetches issues for a project", async () => {
    const client = new LinearClient("test-key", fetchMock as unknown as typeof fetch);
    const result = await client.fetchProjectIssues("Backend API");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.id).toBe("lin-1");
    expect(result.issues[0]!.identifier).toBe("BAC-1");
    expect(result.issues[0]!.title).toBe("Add login");
    expect(result.issues[0]!.state).toBe("Todo");
    expect(result.issues[0]!.labels).toEqual(["feliz"]);
    expect(result.issues[0]!.priority).toBe(1);
  });

  test("sends correct GraphQL query", async () => {
    const client = new LinearClient("test-key", fetchMock as unknown as typeof fetch);
    await client.fetchProjectIssues("Backend API");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call![0]).toBe("https://api.linear.app/graphql");
    const body = JSON.parse(call![1].body);
    expect(body.query).toContain("issues");
    expect(body.variables.projectName).toBe("Backend API");
  });

  test("includes auth header with Bearer prefix", async () => {
    const client = new LinearClient("my-oauth-token", fetchMock as unknown as typeof fetch);
    await client.fetchProjectIssues("X");
    const call = fetchMock.mock.calls[0];
    expect(call![1].headers["Authorization"]).toBe("Bearer my-oauth-token");
  });

  test("paginates when hasNextPage is true", async () => {
    let callCount = 0;
    const pageFetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
          json: () =>
            Promise.resolve({
              data: {
                issues: {
                  nodes: [
                    {
                      id: "lin-1",
                      identifier: "B-1",
                      title: "A",
                      description: "",
                      priority: 1,
                      state: { name: "Todo" },
                      labels: { nodes: [] },
                      relations: { nodes: [] },
                      branchName: null,
                      url: "u",
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: "cursor1" },
                },
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              issues: {
                nodes: [
                  {
                    id: "lin-2",
                    identifier: "B-2",
                    title: "B",
                    description: "",
                    priority: 2,
                    state: { name: "Done" },
                    labels: { nodes: [] },
                    relations: { nodes: [] },
                    branchName: null,
                    url: "u2",
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      });
    });

    const client = new LinearClient("key", pageFetch as unknown as typeof fetch);
    const result = await client.fetchProjectIssues("X");
    expect(result.issues).toHaveLength(2);
    expect(pageFetch).toHaveBeenCalledTimes(2);
  });

  test("handles rate limiting", async () => {
    const rateLimitFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "50" }),
        json: () =>
          Promise.resolve({
            data: {
              issues: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      })
    );
    const client = new LinearClient("key", rateLimitFetch as unknown as typeof fetch);
    const result = await client.fetchProjectIssues("X");
    expect(result.rateLimitLow).toBe(true);
  });

  test("parses relations as blocker_ids", async () => {
    const relFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              issues: {
                nodes: [
                  {
                    id: "lin-1",
                    identifier: "B-1",
                    title: "A",
                    description: "",
                    priority: 1,
                    state: { name: "Todo" },
                    labels: { nodes: [] },
                    relations: {
                      nodes: [
                        {
                          type: "blocks",
                          relatedIssue: {
                            id: "lin-2",
                            identifier: "B-2",
                            state: { name: "Todo" },
                          },
                        },
                      ],
                    },
                    branchName: null,
                    url: "u",
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      })
    );
    const client = new LinearClient("key", relFetch as unknown as typeof fetch);
    const result = await client.fetchProjectIssues("X");
    expect(result.issues[0]!.blocker_ids).toEqual(["lin-2"]);
  });

  test("updates issue state", async () => {
    const updateFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: { issueUpdate: { success: true } },
          }),
      })
    );
    const client = new LinearClient("key", updateFetch as unknown as typeof fetch);
    await client.updateIssueState("lin-1", "state-id-123");
    expect(updateFetch).toHaveBeenCalledTimes(1);

    const updateCall = updateFetch.mock.calls[0] as unknown as [
      string,
      { body: string }
    ];
    const body = JSON.parse(updateCall[1].body);
    expect(body.query).toContain("mutation FelizUpdateIssueState");
    expect(body.variables).toEqual({
      issueId: "lin-1",
      stateId: "state-id-123",
    });
  });

  test("creates a comment on an issue", async () => {
    const commentFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: { commentCreate: { success: true } },
          }),
      })
    );
    const client = new LinearClient("key", commentFetch as unknown as typeof fetch);
    await client.createComment("lin-1", "Hello from Feliz");
    expect(commentFetch).toHaveBeenCalledTimes(1);

    const createCommentCall = commentFetch.mock.calls[0] as unknown as [
      string,
      { body: string }
    ];
    const body = JSON.parse(createCommentCall[1].body);
    expect(body.query).toContain("mutation FelizCreateComment");
    expect(body.variables).toEqual({
      issueId: "lin-1",
      body: "Hello from Feliz",
    });
  });

  test("passes comment content via GraphQL variables without manual escaping", async () => {
    const commentFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: { commentCreate: { success: true } },
          }),
      })
    );
    const client = new LinearClient("key", commentFetch as unknown as typeof fetch);
    const rawComment = `Line 1\nHe said "quote"`;
    await client.createComment("lin-escaped", rawComment);

    const escapedCommentCall = commentFetch.mock.calls[0] as unknown as [
      string,
      { body: string }
    ];
    const body = JSON.parse(escapedCommentCall[1].body);
    expect(body.variables.issueId).toBe("lin-escaped");
    expect(body.variables.body).toBe(rawComment);
  });
});

describe("LinearClient.fetchProjects", () => {
  test("returns projects", async () => {
    const projectFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              projects: {
                nodes: [
                  { id: "proj-1", name: "Backend API" },
                  { id: "proj-2", name: "Frontend App" },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      })
    );
    const client = new LinearClient("key", projectFetch as unknown as typeof fetch);
    const projects = await client.fetchProjects();
    expect(projects).toHaveLength(2);
    expect(projects[0]!.id).toBe("proj-1");
    expect(projects[0]!.name).toBe("Backend API");
    expect(projects[1]!.name).toBe("Frontend App");
  });

  test("paginates projects", async () => {
    let callCount = 0;
    const pageFetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
          json: () =>
            Promise.resolve({
              data: {
                projects: {
                  nodes: [{ id: "proj-1", name: "A" }],
                  pageInfo: { hasNextPage: true, endCursor: "cursor1" },
                },
              },
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              projects: {
                nodes: [{ id: "proj-2", name: "B" }],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      });
    });
    const client = new LinearClient("key", pageFetch as unknown as typeof fetch);
    const projects = await client.fetchProjects();
    expect(projects).toHaveLength(2);
    expect(pageFetch).toHaveBeenCalledTimes(2);
  });

  test("handles empty project list", async () => {
    const emptyFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              projects: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      })
    );
    const client = new LinearClient("key", emptyFetch as unknown as typeof fetch);
    const projects = await client.fetchProjects();
    expect(projects).toHaveLength(0);
  });

  test("sends auth header for fetchProjects", async () => {
    const authFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "X-RateLimit-Requests-Remaining": "500" }),
        json: () =>
          Promise.resolve({
            data: {
              projects: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          }),
      })
    );
    const client = new LinearClient("my-secret-key", authFetch as unknown as typeof fetch);
    await client.fetchProjects();
    const call = authFetch.mock.calls[0] as any[];
    expect(call[1].headers["Authorization"]).toBe("Bearer my-secret-key");
  });
});

describe("LinearClient.emitThought", () => {
  test("sends thought agent activity mutation", async () => {
    const activityFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: { agentActivityCreate: { success: true } },
          }),
      })
    );
    const client = new LinearClient("token", activityFetch as unknown as typeof fetch);
    await client.emitThought("session-1", "Looking into this...");
    expect(activityFetch).toHaveBeenCalledTimes(1);

    const call = activityFetch.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.query).toContain("agentActivityCreate");
    expect(body.query).toContain('"thought"');
    expect(body.variables).toEqual({
      sessionId: "session-1",
      content: "Looking into this...",
    });
  });

  test("throws on non-ok response", async () => {
    const failFetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      })
    );
    const client = new LinearClient("token", failFetch as unknown as typeof fetch);
    expect(client.emitThought("s", "t")).rejects.toThrow("emitThought failed: HTTP 500");
  });
});

describe("LinearClient.emitComment", () => {
  test("sends comment agent activity mutation", async () => {
    const activityFetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            data: { agentActivityCreate: { success: true } },
          }),
      })
    );
    const client = new LinearClient("token", activityFetch as unknown as typeof fetch);
    await client.emitComment("session-2", "Done!");
    expect(activityFetch).toHaveBeenCalledTimes(1);

    const call = activityFetch.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.query).toContain("agentActivityCreate");
    expect(body.query).toContain('"comment"');
    expect(body.variables).toEqual({
      sessionId: "session-2",
      content: "Done!",
    });
  });

  test("throws on non-ok response", async () => {
    const failFetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      })
    );
    const client = new LinearClient("token", failFetch as unknown as typeof fetch);
    expect(client.emitComment("s", "t")).rejects.toThrow("emitComment failed: HTTP 502");
  });
});
