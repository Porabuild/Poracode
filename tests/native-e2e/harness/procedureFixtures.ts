import { matchesImportQuery } from "../../../src/shared/contracts/sessionImport.ts";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";
import type { RemoteProcedureName } from "../../../src/shared/remote/procedures.ts";
import type { BackgroundTaskLab } from "./backgroundTaskLab.ts";
import { loadGeneratedContract } from "./generatedContract.ts";
import { FIXTURE_PROJECT_ID, FIXTURE_THREAD_ID } from "./labFixtures.ts";
import { LabHttpError } from "./labAuth.ts";
import { LabReviewProcedureFixture } from "./procedureReviewFixtures.ts";
import { schemaExample } from "./schemaExamples.ts";
import { VoiceFixture } from "./voiceFixtures.ts";
import { WorkflowFixture } from "./workflowFixtures.ts";
import { AgentDiscoveryFixture } from "./agentDiscoveryFixture.ts";

export const FIXTURE_PROJECT_LOCATION = {
  kind: "posix",
  path: "/tmp/native-e2e-fixture",
} as const;

const REQUEST_OVERRIDES: Partial<Record<RemoteProcedureName, Record<string, unknown>>> = {
  createFileCheckpoint: { label: "Native E2E checkpoint" },
  createProjectEntry: { path: "native-e2e-entry.txt", type: "file", content: "fixture\n" },
  gitAddWorktree: { branch: "fixture-worktree", path: "/tmp/wt", createBranch: true },
  gitStage: { filePath: "README.md" },
  listProjectTree: { directoryPath: "" },
  readProjectFile: { path: "README.md" },
  searchProjectFiles: { query: "README", limit: 20 },
  writeProjectFile: { path: "README.md", content: "# updated fixture\n", baseModifiedAtMs: 1.25 },
  controlMcpApp: {
    app: {
      version: 1,
      sessionId: "00000000-0000-4000-8000-000000000001",
      toolName: "show_deployment",
      resourceUri: "ui://fixture/deployment",
    },
    requestId: "00000000-0000-4000-8000-000000000002",
    action: { type: "listTools" },
  },
  forgeGetPrViewedFiles: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
  },
  forgeSetPrFileViewed: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
    path: "src/a.ts",
    fingerprint: null,
  },
  forgeEditPrComment: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
    commentId: "IC_fixture",
    body: "Updated fixture",
    expectedBody: "Original fixture",
  },
  forgeGetPrReviewGuide: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
  },
  forgeWritePrReviewGuide: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
    agentKind: "fixture",
  },
  forgeGetPrCommitDiff: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
    commit: "c".repeat(40),
  },
  forgeSubmitPrReviewDraft: {
    forgeAccount: { forge: "github", host: "https://github.com", login: "fixture" },
    forgeRepository: "acme/app",
    decision: "comment",
    body: "",
    expectedHeadSha: "a".repeat(40),
    comments: [{ path: "src/a.ts", side: "RIGHT", line: 3, body: "Fixture line comment" }],
  },
  forgeEditPr: { title: "Updated fixture pull request" },
  forgeMergePrAtHead: { expectedHeadSha: "a".repeat(40) },
};

export const PROCEDURE_REQUEST_FIXTURES = Object.fromEntries(
  loadGeneratedContract().ir.procedures.map((procedure) => {
    const name = procedure.name as RemoteProcedureName;
    const generated = schemaExample(procedure.request) as Record<string, unknown>;
    const ownerLocation = ownerFixture(procedure.owner);
    return [name, { ...generated, ...ownerLocation, ...REQUEST_OVERRIDES[name] }];
  }),
) as Record<RemoteProcedureName, unknown>;

export type ConfiguredProcedureName = RemoteProcedureName;

export const CONFIGURED_PROCEDURE_NAMES = loadGeneratedContract().ir.procedures.map(
  (procedure) => procedure.name as ConfiguredProcedureName,
);

export const MUTATING_PROCEDURES = new Set<ConfiguredProcedureName>([
  "writeProjectFile",
  "createProjectEntry",
  "gitStage",
  "gitAddWorktree",
  "createFileCheckpoint",
]);

function ownerFixture(owner: string): Record<string, unknown> {
  switch (owner) {
    case "projectLocation":
      return { projectLocation: FIXTURE_PROJECT_LOCATION };
    case "worktreeLocation":
      return { worktreeLocation: FIXTURE_PROJECT_LOCATION };
    case "location":
      return { location: FIXTURE_PROJECT_LOCATION };
    case "thread":
      return { threadId: FIXTURE_THREAD_ID, projectLocation: FIXTURE_PROJECT_LOCATION };
    default:
      return {};
  }
}

export class LabProcedureWorkspace {
  readonly agentDiscovery = new AgentDiscoveryFixture();
  readonly voice = new VoiceFixture();
  readonly workflows = new WorkflowFixture();
  private readonly review = new LabReviewProcedureFixture();
  private importModelAvailable = false;
  private pullRequestCreationEnabled = false;
  private fileContent = "# hi";
  private fileSaveGate: PromiseWithResolvers<void> | undefined;
  private fileVersion: number | undefined;
  private readonly transcriptFiles = new Map<string, { content: string; modifiedAtMs: number }>();
  private fileSaveGeneration = 0;
  private readonly projectEntries = new Map<string, "file" | "directory">();
  private readonly staged = new Set<string>();
  private readonly worktrees = new Set<string>();
  private checkpointCreated = false;
  private readonly pendingFollowUps = new Set<ConfiguredProcedureName>();

  /** The shared background-task fixture backs the roster/action procedures. */
  constructor(private readonly backgroundTasks?: BackgroundTaskLab) {}

  reset(): void {
    this.transcriptFiles.clear();
    this.agentDiscovery.reset();
    this.voice.reset();
    this.workflows.reset();
    this.review.reset();
    this.importModelAvailable = false;
    this.pullRequestCreationEnabled = false;
    this.fileContent = "# hi";
    this.fileSaveGeneration++;
    this.releaseProjectFileSave();
    this.fileVersion = undefined;
    this.projectEntries.clear();
    this.staged.clear();
    this.worktrees.clear();
    this.checkpointCreated = false;
    this.pendingFollowUps.clear();
  }

  prepareSessionImport(): void {
    this.importModelAvailable = true;
  }

  preparePullRequestCreation(): void {
    this.pullRequestCreationEnabled = true;
  }

  preparePullRequestMetadata(): void {
    this.review.prepareMetadata();
  }

  preparePullRequestGuide(): void {
    this.review.prepareGuide();
  }

  prepareKeyboardWorkspace(): void {
    this.projectEntries.set("README.md", "file");
  }

  prepareTranscriptEditableFiles(): void {
    this.projectEntries.set("reports", "directory");
    for (const [path, content] of [
      ["reports/audit notes.txt", "Notes from the selected desktop.\n"],
      ["reports/activity.csv", "label,value\nopen,3\n"],
      ["reports/activity.tsv", "label\tvalue\nclosed\t5\n"],
    ] as const) {
      this.transcriptFiles.set(path, { content, modifiedAtMs: 1000 });
    }
  }

  private transcriptFile(path: string) {
    const file = this.transcriptFiles.get(path);
    if (!file) throw new LabHttpError("file_not_found", "The fixture file was not found.", 404);
    return file;
  }

  prepareLinkedSourceFile(owner: string): void {
    this.prepareKeyboardWorkspace();
    this.fileContent = Array.from({ length: 75 }, (_, index) =>
      index === 47 ? `${owner} SOURCE LINE 48` : `Fixture line ${index + 1}`,
    ).join("\n");
  }

  holdProjectFileSave(): void {
    this.prepareKeyboardWorkspace();
    this.fileSaveGeneration++;
    this.releaseProjectFileSave();
    this.fileVersion = REMOTE_PROCEDURE_RESULT_FIXTURES.readProjectFile.modifiedAtMs;
    this.fileSaveGate = Promise.withResolvers<void>();
  }

  releaseProjectFileSave(): void {
    this.fileSaveGate?.resolve();
    this.fileSaveGate = undefined;
  }

  invoke(name: ConfiguredProcedureName, payload: unknown): unknown {
    const body = payload as Record<string, unknown>;
    switch (name) {
      case "refreshAgentStatuses":
        return this.agentDiscovery.enabled
          ? this.agentDiscovery.discover(body)
          : REMOTE_PROCEDURE_RESULT_FIXTURES.refreshAgentStatuses;
      case "workflowGetRun":
        return this.workflows.enabled
          ? this.workflows.read(body)
          : REMOTE_PROCEDURE_RESULT_FIXTURES.workflowGetRun;
      case "workflowAgentChat":
        return this.workflows.enabled
          ? this.workflows.readAgent(body)
          : REMOTE_PROCEDURE_RESULT_FIXTURES.workflowAgentChat;
      case "hexVoice":
        return this.voice.enabled
          ? this.voice.call(body)
          : REMOTE_PROCEDURE_RESULT_FIXTURES.hexVoice;
      case "listImportableSessions": {
        const fixture = REMOTE_PROCEDURE_RESULT_FIXTURES.listImportableSessions;
        const query = typeof body.query === "string" ? body.query : undefined;
        return {
          ...fixture,
          sessions: fixture.sessions
            .map((session) =>
              this.importModelAvailable
                ? { ...session, model: "gpt-5", title: "CLI layout review" }
                : session,
            )
            .filter(
              (session) =>
                (!body.agentKind || session.agentKind === body.agentKind) &&
                (!body.cwd || session.cwd === body.cwd) &&
                matchesImportQuery(session, query),
            ),
        };
      }
      case "controlMcpApp": {
        const action = body.action as { type?: string } | undefined;
        if (action?.type === "readResource") {
          const app = body.app as { resourceUri?: string } | undefined;
          return {
            result: {
              contents: [
                {
                  uri: app?.resourceUri ?? "ui://fixture/deployment",
                  mimeType: "text/html;profile=mcp-app",
                  text: '<!doctype html><html><head><style>:root{color-scheme:light dark}</style></head><body><main style="padding:12px;font-family:-apple-system,sans-serif"><h3>Deployment Panel</h3><button id="mcp-ping">Ping MCP App</button><p id="mcp-status">MCP App Idle</p></main><script>document.getElementById("mcp-ping").onclick=()=>{document.getElementById("mcp-status").textContent="MCP App Clicked";};</script></body></html>',
                },
              ],
            },
          };
        }
        return REMOTE_PROCEDURE_RESULT_FIXTURES.controlMcpApp;
      }
      case "listThreadSessionActions":
        return this.backgroundTasks
          ? { actions: this.backgroundTasks.actions() }
          : REMOTE_PROCEDURE_RESULT_FIXTURES.listThreadSessionActions;
      case "invokeThreadSessionAction":
        return this.backgroundTasks
          ? this.backgroundTasks.invoke(body)
          : REMOTE_PROCEDURE_RESULT_FIXTURES.invokeThreadSessionAction;
      case "readThreadBackgroundTasks":
        return this.backgroundTasks
          ? this.backgroundTasks.list()
          : REMOTE_PROCEDURE_RESULT_FIXTURES.readThreadBackgroundTasks;
      case "writeProjectFile": {
        if (this.transcriptFiles.size) {
          const file = this.transcriptFile(String(body.path));
          if (body.baseModifiedAtMs !== file.modifiedAtMs) {
            throw new LabHttpError("file_modified", "The fixture file has changed.", 409);
          }
          file.content = String(body.content);
          file.modifiedAtMs += 1;
          return { modifiedAtMs: file.modifiedAtMs };
        }
        const generation = this.fileSaveGeneration;
        const save = () => {
          if (generation !== this.fileSaveGeneration) {
            throw new LabHttpError("fixture_retired", "The file fixture was reset.", 409);
          }
          if (this.fileVersion !== undefined && body.baseModifiedAtMs !== this.fileVersion) {
            throw new LabHttpError("file_modified", "The fixture file has changed.", 409);
          }
          this.pendingFollowUps.add(name);
          this.fileContent = String(body.content);
          if (this.fileVersion === undefined)
            return REMOTE_PROCEDURE_RESULT_FIXTURES.writeProjectFile;
          this.fileVersion += 1;
          return { modifiedAtMs: this.fileVersion };
        };
        return this.fileSaveGate ? this.fileSaveGate.promise.then(save) : save();
      }
      case "createProjectEntry":
        this.pendingFollowUps.add(name);
        this.projectEntries.set(String(body.path), body.type === "file" ? "file" : "directory");
        return REMOTE_PROCEDURE_RESULT_FIXTURES.createProjectEntry;
      case "gitStage":
        this.pendingFollowUps.add(name);
        this.staged.add(String(body.filePath));
        return REMOTE_PROCEDURE_RESULT_FIXTURES.gitStage;
      case "gitAddWorktree":
        this.pendingFollowUps.add(name);
        this.worktrees.add(String(body.path));
        return REMOTE_PROCEDURE_RESULT_FIXTURES.gitAddWorktree;
      case "createFileCheckpoint":
        this.pendingFollowUps.add(name);
        this.checkpointCreated = true;
        return REMOTE_PROCEDURE_RESULT_FIXTURES.createFileCheckpoint;
      case "readProjectFile": {
        const path = String(body.path);
        const file = this.transcriptFiles.size ? this.transcriptFile(path) : undefined;
        return {
          ...REMOTE_PROCEDURE_RESULT_FIXTURES.readProjectFile,
          path,
          content: file?.content ?? this.fileContent,
          ...(this.fileVersion !== undefined ? { modifiedAtMs: this.fileVersion } : {}),
          ...(file ? { modifiedAtMs: file.modifiedAtMs } : {}),
        };
      }
      case "searchProjectFiles": {
        if (!this.transcriptFiles.size) return REMOTE_PROCEDURE_RESULT_FIXTURES.searchProjectFiles;
        const query = String(body.query).toLowerCase();
        const entries = [...this.transcriptFiles.keys()]
          .map((path) => ({ name: path.slice(path.lastIndexOf("/") + 1), path, type: "file" }))
          .filter((entry) => entry.name.toLowerCase().includes(query));
        return {
          entries: entries.slice(0, Number(body.limit) || entries.length),
          totalIndexed: this.transcriptFiles.size,
        };
      }
      case "listProjectTree":
        return {
          ...REMOTE_PROCEDURE_RESULT_FIXTURES.listProjectTree,
          entries: [...this.projectEntries].map(([path, type]) => ({
            name: path,
            path,
            type,
          })),
        };
      case "getGitStatus": {
        const staged = [...this.staged].map((path) => ({
          path,
          status: "modified",
          staged: true,
          insertions: 1,
          deletions: 0,
        }));
        return {
          ...REMOTE_PROCEDURE_RESULT_FIXTURES.getGitStatus,
          ...(this.pullRequestCreationEnabled
            ? { branch: "feature/native-pr", tracking: "origin/feature/native-pr", behind: 0 }
            : {}),
          staged,
          unstaged: [],
          totalInsertions: staged.length,
          totalDeletions: 0,
        };
      }
      case "ghCreatePr":
        return this.pullRequestCreationEnabled
          ? this.review.createPullRequest(body)
          : REMOTE_PROCEDURE_RESULT_FIXTURES.ghCreatePr;
      case "ghListPullRequests":
        return this.review.listPullRequests();
      case "forgeGetPrDetails":
        return this.review.getDetails();
      case "forgeGetPrDiff":
        return this.review.getDiff();
      case "forgeGetPrReviewGuide":
        return this.review.getGuide();
      case "forgeWritePrReviewGuide":
        return this.review.writeGuide();
      case "forgeListPrLabelCandidates":
        return this.review.listLabels();
      case "forgeListPrReviewerCandidates":
        return this.review.listReviewers(body);
      case "forgeSetPrLabels":
        return this.review.setLabels(body);
      case "forgeRequestPrReviewers":
        return this.review.requestReviewers(body);
      case "gitProjectSnapshot":
        return {
          status: this.invoke("getGitStatus", payload),
          branches: REMOTE_PROCEDURE_RESULT_FIXTURES.gitListBranches,
          worktrees: [...this.worktrees].map((path) => ({
            path,
            branch: "fixture-worktree",
            commit: "abc123",
            isMain: false,
          })),
          ghAvailable: true,
        };
      case "gitListWorktrees":
        return {
          worktrees: [...this.worktrees].map((path) => ({
            path,
            branch: "fixture-worktree",
            commit: "abc123",
            isMain: false,
          })),
        };
      case "listFileCheckpoints":
        return this.checkpointCreated
          ? {
              checkpoints: [REMOTE_PROCEDURE_RESULT_FIXTURES.createFileCheckpoint.checkpoint],
              turns: [],
            }
          : REMOTE_PROCEDURE_RESULT_FIXTURES.listFileCheckpoints;
      default:
        return REMOTE_PROCEDURE_RESULT_FIXTURES[name];
    }
  }

  followUpFor(name: ConfiguredProcedureName): ConfiguredProcedureName | undefined {
    const pairs: Partial<Record<ConfiguredProcedureName, ConfiguredProcedureName>> = {
      writeProjectFile: "readProjectFile",
      createProjectEntry: "listProjectTree",
      gitStage: "getGitStatus",
      gitAddWorktree: "gitListWorktrees",
      createFileCheckpoint: "listFileCheckpoints",
    };
    return pairs[name];
  }

  takeFollowUps(evidenceName: ConfiguredProcedureName): ConfiguredProcedureName[] {
    const matched = [...this.pendingFollowUps].filter(
      (mutation) => this.followUpFor(mutation) === evidenceName,
    );
    for (const mutation of matched) this.pendingFollowUps.delete(mutation);
    return matched;
  }
}

export function fixtureProjectId(): string {
  return FIXTURE_PROJECT_ID;
}
