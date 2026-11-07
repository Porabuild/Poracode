import type { StartThreadPayload } from "@/shared/contracts";
import { startThreadPayloadSchema } from "@/shared/contracts/thread";
import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import {
  THREAD_WORKSPACE_RUNTIME_VERSION,
  CONTROLLED_WORKSPACE_RUNTIME_VERSION,
  controlledWorkspaceRuntimeSupportSchema,
  controlledWorkspaceRuntimePayloadSchema,
  approvedThreadWorkspaceScopeSchema,
  threadWorkspaceRuntimeSupportSchema,
  type ThreadWorkspaceRuntimePayload,
  type ThreadWorkspaceRuntimeScope,
  type ControlledWorkspaceRuntimePayload,
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
  private readonly supports = {
    1: new WeakMap<object, Promise<{ version: 1 | 2; incarnation: string }>>(),
    2: new WeakMap<object, Promise<{ version: 1 | 2; incarnation: string }>>(),
  };

  async prepare(
    input: {
      child: object;
      launch: StartThreadPayload;
      selection: WorkspaceLaunchSelection;
      readSelection(): WorkspaceLaunchSelection | undefined;
      isCurrent(): boolean;
      requestSupport(
        payload: ThreadWorkspaceRuntimePayload | ControlledWorkspaceRuntimePayload,
      ): Promise<unknown>;
    } & (
      | { procedure: "startThread" | "ensureThreadRunning"; operationId?: never }
      | { procedure: "controlThreadExecution"; operationId: string }
    ),
  ): Promise<ThreadWorkspaceRuntimePayload | ControlledWorkspaceRuntimePayload> {
    const selection = snapshot(input.selection);
    const launch = startThreadPayloadSchema.parse(input.launch);
    const version =
      input.procedure === "controlThreadExecution"
        ? CONTROLLED_WORKSPACE_RUNTIME_VERSION
        : THREAD_WORKSPACE_RUNTIME_VERSION;
    const supports = this.supports[version];
    let support = supports.get(input.child);
    if (!support) {
      support = input
        .requestSupport({ action: "support", version })
        .then((result) =>
          version === CONTROLLED_WORKSPACE_RUNTIME_VERSION
            ? controlledWorkspaceRuntimeSupportSchema.parse(result)
            : threadWorkspaceRuntimeSupportSchema.parse(result),
        );
      supports.set(input.child, support);
      const captured = support;
      void support.catch(() => {
        if (supports.get(input.child) === captured) supports.delete(input.child);
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
    if (input.procedure === "controlThreadExecution")
      return controlledWorkspaceRuntimePayloadSchema.parse({
        action: "launch",
        version: CONTROLLED_WORKSPACE_RUNTIME_VERSION,
        incarnation: peer.incarnation,
        operationId: input.operationId,
        launch,
        scope: selection.scope,
      });
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
