export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  priority: number;
  state: string;
  labels: string[];
  blocker_ids: string[];
  branch_name: string | null;
  url: string;
}

export interface FetchResult {
  issues: LinearIssue[];
  rateLimitLow: boolean;
}

const ISSUES_QUERY = `
query FelizPollIssues($projectName: String!, $after: String) {
  issues(
    filter: {
      project: { name: { eq: $projectName } }
    }
    after: $after
    first: 50
    orderBy: createdAt
  ) {
    nodes {
      id
      identifier
      title
      description
      priority
      state { name }
      labels { nodes { name } }
      relations {
        nodes {
          type
          relatedIssue { id identifier state { name } }
        }
      }
      branchName
      url
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

export class LinearClient {
  private apiKey: string;
  private fetch: typeof fetch;

  constructor(apiKey: string, fetchFn: typeof fetch = globalThis.fetch) {
    this.apiKey = apiKey;
    this.fetch = fetchFn;
  }

  async fetchProjectIssues(projectName: string): Promise<FetchResult> {
    const allIssues: LinearIssue[] = [];
    let cursor: string | null = null;
    let rateLimitLow = false;

    do {
      const response = await this.fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey,
        },
        body: JSON.stringify({
          query: ISSUES_QUERY,
          variables: { projectName, after: cursor },
        }),
      });

      const remaining = parseInt(
        response.headers.get("X-RateLimit-Requests-Remaining") || "1000",
        10
      );
      if (remaining < 100) {
        rateLimitLow = true;
      }

      const json = (await response.json()) as {
        data: {
          issues: {
            nodes: RawIssue[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        };
      };

      const { nodes, pageInfo } = json.data.issues;

      for (const node of nodes) {
        allIssues.push(parseIssue(node));
      }

      cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (cursor !== null);

    return { issues: allIssues, rateLimitLow };
  }

  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    await this.fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({
        query: `mutation { issueUpdate(id: "${issueId}", input: { stateId: "${stateId}" }) { success } }`,
      }),
    });
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
      body: JSON.stringify({
        query: `mutation { commentCreate(input: { issueId: "${issueId}", body: "${body.replace(/"/g, '\\"')}" }) { success } }`,
      }),
    });
  }
}

interface RawIssue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  priority: number;
  state: { name: string };
  labels: { nodes: { name: string }[] };
  relations: {
    nodes: {
      type: string;
      relatedIssue: { id: string; identifier: string; state: { name: string } };
    }[];
  };
  branchName: string | null;
  url: string;
}

function parseIssue(raw: RawIssue): LinearIssue {
  return {
    id: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    description: raw.description || "",
    priority: raw.priority,
    state: raw.state.name,
    labels: raw.labels.nodes.map((l) => l.name),
    blocker_ids: raw.relations.nodes
      .filter((r) => r.type === "blocks")
      .map((r) => r.relatedIssue.id),
    branch_name: raw.branchName,
    url: raw.url,
  };
}
