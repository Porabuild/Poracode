import type { StartThreadPayload } from "@/shared/contracts";
import { startThreadPayloadSchema } from "@/shared/contracts/thread";
import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import {
  THREAD_WORKSPACE_RUNTIME_VERSION,
  approvedThreadWorkspaceScopeSchema,
  threadWorkspaceRuntimeSupportSchema,
  type ThreadWorkspaceRuntimePayload,
  type ThreadWorkspaceRuntimeScope,
} from "@/shared/threadWorkspaceRuntimeProtocol";

export interface WorkspaceLaunchSelection {
  /** Host SQL owner fingerprint. Read projection or client payload is not authority. */
  readonly owner: string;
  readonly scope: ThreadWorkspaceRuntimeScope;
}

function snapshot(selection: WorkspaceLaunchSelection): WorkspaceLaunchSelection {
  if (!selection.owner || selection.owner.length > 32_768)
    throw new WorkspaceLaunchUnavailableError("Invalid workspace launch owner.");
  const scope = approvedThreadWorkspaceScopeSchema.parse(selection.scope);
  Object.freeze(scope.primaryLocation);
  scope.additionalDirectories.forEach(Object.freeze);
  Object.freeze(scope.additionalDirectories);
  return Object.freeze({ owner: selection.owner, scope: Object.freeze(scope) });
}

/** Support is scoped to the actual transport object, not a status cache or saved capability. */
export class WorkspaceLaunchBridge {
  private readonly supports = new WeakMap<
    object,
    Promise<{
      version: 1;
      incarnation: string;
    }>
  >();

  async prepare(input: {
    child: object;
    procedure: "startThread" | "ensureThreadRunning";
    launch: StartThreadPayload;
    selection: WorkspaceLaunchSelection;
    readSelection(): WorkspaceLaunchSelection | undefined;
    isCurrent(): boolean;
    requestSupport(payload: ThreadWorkspaceRuntimePayload): Promise<unknown>;
  }): Promise<ThreadWorkspaceRuntimePayload> {
    const selection = snapshot(input.selection);
    const launch = startThreadPayloadSchema.parse(input.launch);
    let support = this.supports.get(input.child);
    if (!support) {
      support = input
        .requestSupport({ action: "support", version: THREAD_WORKSPACE_RUNTIME_VERSION })
        .then((result) => threadWorkspaceRuntimeSupportSchema.parse(result));
      this.supports.set(input.child, support);
      const captured = support;
      void support.catch(() => {
        if (this.supports.get(input.child) === captured) this.supports.delete(input.child);
      });
    }
    const peer = await support.catch((cause: unknown) => {
      throw new WorkspaceLaunchUnavailableError("Workspace runtime support unavailable.", cause);
    });
    if (!input.isCurrent())
      throw new WorkspaceLaunchUnavailableError("Workspace supervisor changed before launch.");
    // No external effect has happened. Re-read authoritative ownership after the await.
    const fresh = input.readSelection();
    if (!fresh || JSON.stringify(snapshot(fresh)) !== JSON.stringify(selection)) {
      throw new WorkspaceLaunchUnavailableError(
        "Workspace launch owner or revision changed during support negotiation.",
      );
    }
    return {
      action: "launch",
      version: THREAD_WORKSPACE_RUNTIME_VERSION,
      incarnation: peer.incarnation,
      procedure: input.procedure,
      launch,
      scope: selection.scope,
    };
  }
}
