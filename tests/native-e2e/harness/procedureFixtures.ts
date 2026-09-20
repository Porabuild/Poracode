import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";
import type { RemoteProcedureName } from "../../../src/shared/remote/procedures.ts";
import { loadGeneratedContract } from "./generatedContract.ts";
import { FIXTURE_PROJECT_ID, FIXTURE_THREAD_ID } from "./labFixtures.ts";
import { schemaExample } from "./schemaExamples.ts";

export const FIXTURE_PROJECT_LOCATION = {
  kind: "posix",
  path: "/tmp/native-e2e-fixture",
} as const;

const REQUEST_OVERRIDES: Partial<Record<RemoteProcedureName, Record<string, unknown>>> = {
  createFileCheckpoint: { checkpointItemId: "c1" },
  createProjectEntry: { path: "src", type: "directory" },
  gitAddWorktree: { branch: "fixture-worktree", path: "/tmp/wt", createBranch: true },
  gitStage: { filePath: "README.md" },
  listProjectTree: { directoryPath: "" },
  readProjectFile: { path: "README.md" },
  searchProjectFiles: { query: "README", limit: 20 },
  writeProjectFile: { path: "README.md", content: "# updated fixture\n", baseModifiedAtMs: 1.25 },
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
  private fileContent = "# hi";
  private readonly projectEntries = new Set<string>();
  private readonly staged = new Set<string>();
  private readonly worktrees = new Set<string>();
  private checkpointCreated = false;
  private readonly pendingFollowUps = new Set<ConfiguredProcedureName>();

  reset(): void {
    this.fileContent = "# hi";
    this.projectEntries.clear();
    this.staged.clear();
    this.worktrees.clear();
    this.checkpointCreated = false;
    this.pendingFollowUps.clear();
  }

  invoke(name: ConfiguredProcedureName, payload: unknown): unknown {
    const body = payload as Record<string, unknown>;
    switch (name) {
      case "writeProjectFile":
        this.pendingFollowUps.add(name);
        this.fileContent = String(body.content);
        return REMOTE_PROCEDURE_RESULT_FIXTURES.writeProjectFile;
      case "createProjectEntry":
        this.pendingFollowUps.add(name);
        this.projectEntries.add(String(body.path));
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
      case "readProjectFile":
        return { ...REMOTE_PROCEDURE_RESULT_FIXTURES.readProjectFile, content: this.fileContent };
      case "listProjectTree":
        return {
          ...REMOTE_PROCEDURE_RESULT_FIXTURES.listProjectTree,
          entries: [...this.projectEntries].map((path) => ({
            name: path,
            path,
            type: "directory",
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
          staged,
          unstaged: [],
          totalInsertions: staged.length,
          totalDeletions: 0,
        };
      }
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
