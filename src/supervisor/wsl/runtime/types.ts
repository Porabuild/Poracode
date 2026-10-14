import type { NodeTargetTriple as SharedNodeTargetTriple } from "../../runtime/pinnedNode";
import type { WslStagingService } from "../staging";

/**
 * Subset of `NodeTargetTriple` that this WSL resolver actually downloads —
 * always glibc Linux tarballs. The wider native targets (darwin-*, win-*)
 * are handled by `src/supervisor/native/runtime`.
 */
export type NodeTargetTriple = Extract<SharedNodeTargetTriple, "linux-x64" | "linux-arm64">;

export interface ResolvedNode {
  /** Absolute Linux path to the node binary inside the distro. */
  nodePath: string;
  /** Version string, e.g. "22.11.0". */
  nodeVersion: string;
  /** Whether we found the user's node or installed our own. */
  source: "user-installed" | "poracode-managed";
}

export type RuntimeProgressEvent =
  | { kind: "probe-start" }
  | { kind: "probe-result"; resolved: "found" | "missing" | "too-old"; version?: string }
  | {
      kind: "download-start";
      url: string;
      target: NodeTargetTriple;
      sizeBytes?: number;
    }
  | { kind: "download-progress"; bytesReceived: number; bytesTotal: number }
  | { kind: "verify-start" }
  | { kind: "extract-start" }
  | { kind: "ready"; nodePath: string };

export type RuntimeProgressListener = (event: RuntimeProgressEvent) => void;

export interface ResolveNodeOptions {
  /**
   * Optional full semver floor for consumers with a stricter requirement
   * than Poracode's general Node-major gate.
   */
  minimumVersion?: string;
  onProgress?: RuntimeProgressListener;
  useBridge?: boolean;
  /** Cancels probe/install and any staging request in flight. */
  signal?: AbortSignal;
  /** Test seam: replace the shared staging service used for UNC copies. */
  staging?: WslStagingService;
}
