import { LinearClient as SdkLinearClient } from "@linear/sdk";

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

export interface LinearProject {
  id: string;
  name: string;
}

export class LinearClient {
  private sdk: SdkLinearClient;

  constructor(oauthToken: string, sdkClient?: SdkLinearClient) {
    this.sdk = sdkClient ?? new SdkLinearClient({ accessToken: oauthToken });
  }

  async fetchProjects(): Promise<LinearProject[]> {
    const connection = await this.sdk.projects({ first: 50, orderBy: "createdAt" as any });

    while (connection.pageInfo.hasNextPage) {
      await connection.fetchNext();
    }

    return connection.nodes.map((p) => ({ id: p.id, name: p.name }));
  }

  async fetchProjectIssues(projectName: string): Promise<FetchResult> {
    const connection = await this.sdk.issues({
      filter: { project: { name: { eq: projectName } } },
      first: 50,
      orderBy: "createdAt" as any,
    });

    while (connection.pageInfo.hasNextPage) {
      await connection.fetchNext();
    }

    const issues: LinearIssue[] = await Promise.all(
      connection.nodes.map(async (issue) => {
        const [state, labelsConn, relationsConn] = await Promise.all([
          issue.state,
          issue.labels(),
          issue.relations(),
        ]);

        const blockerIds = relationsConn.nodes
          .filter((r) => r.type === "blocks")
          .map((r) => (r as any).relatedIssueId as string);

        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || "",
          priority: issue.priority,
          state: state?.name ?? "",
          labels: labelsConn.nodes.map((l) => l.name),
          blocker_ids: blockerIds,
          branch_name: issue.branchName ?? null,
          url: issue.url,
        };
      })
    );

    return { issues, rateLimitLow: false };
  }

  async updateIssueState(issueId: string, stateId: string): Promise<void> {
    await this.sdk.updateIssue(issueId, { stateId });
  }

  async createComment(issueId: string, body: string): Promise<void> {
    await this.sdk.createComment({ issueId, body });
  }

  async emitThought(sessionId: string, body: string): Promise<void> {
    await this.sdk.createAgentActivity({
      agentSessionId: sessionId,
      content: { type: "thought", body },
    });
  }

  async emitComment(sessionId: string, body: string): Promise<void> {
    await this.sdk.createAgentActivity({
      agentSessionId: sessionId,
      content: { type: "response", body },
    });
  }
}
