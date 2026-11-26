import type { Project, ProjectLocation } from "@/shared/contracts";
import { stripAnsi } from "@/shared/ansi";
import { isCloudOllamaModelTag } from "@/shared/agents/ollamaModelInventory";
import { readBridge } from "@/renderer/bridge";
import {
  disposeRoutedShellSession,
  startShellWithCurrentSettings,
  writeScriptToShellThenExitOnSuccess,
} from "@/renderer/utils/shellUtils";

export const OLLAMA_PULL_HOST = "127.0.0.1:11434";
export const OLLAMA_PULL_BEGIN_MARKER = "PORACODE_OLLAMA_PULL_BEGIN";

export const OLLAMA_TAG_MAX_LENGTH = 200;
const OLLAMA_COMPONENT = "[a-z0-9]+(?:[._-][a-z0-9]+)*";
const OLLAMA_TAG_PATTERN = new RegExp(
  `^${OLLAMA_COMPONENT}(?:/${OLLAMA_COMPONENT})*(?::[A-Za-z0-9][A-Za-z0-9._-]{0,127})?$`,
);

export function normalizeOllamaLibraryTag(value: string): string {
  return value.trim();
}

export function isValidOllamaLibraryTag(value: string): boolean {
  const tag = normalizeOllamaLibraryTag(value);
  return (
    tag.length > 0 &&
    tag.length <= OLLAMA_TAG_MAX_LENGTH &&
    OLLAMA_TAG_PATTERN.test(tag) &&
    !isCloudOllamaModelTag(tag)
  );
}

function quotePosixShellArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function quotePowerShellArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildOllamaModelPullScript(
  tag: string,
  locationKind: ProjectLocation["kind"],
): string {
  const model = normalizeOllamaLibraryTag(tag);
  if (locationKind === "windows") {
    return [
      `Write-Host ('PORACODE_OLLAMA_PULL_' + 'BEGIN')`,
      `$env:OLLAMA_HOST = ${quotePowerShellArg(OLLAMA_PULL_HOST)}`,
      `ollama pull ${quotePowerShellArg(model)}`,
    ].join("\n");
  }
  return [
    `printf '%s\\n' 'PORACODE_OLLAMA_PULL_'BEGIN`,
    `OLLAMA_HOST=${quotePosixShellArg(OLLAMA_PULL_HOST)} ollama pull ${quotePosixShellArg(model)}`,
  ].join("\n");
}

export type OllamaModelPullCompletion =
  | { status: "success" }
  | { status: "failed"; exitCode: number; error?: string };

export interface OllamaModelPullHandle {
  shellId: string;
  cancel: () => Promise<void>;
}

function createBeginMarkerGate(onOutput: (output: string) => void) {
  let sawBegin = false;
  let pending = "";
  return {
    output(raw: string) {
      const plain = stripAnsi(raw);
      if (sawBegin) {
        if (plain) onOutput(plain);
        return;
      }
      pending = `${pending}${plain}`.slice(-8192);
      const index = pending.indexOf(OLLAMA_PULL_BEGIN_MARKER);
      if (index < 0) return;
      sawBegin = true;
      const rest = pending.slice(index + OLLAMA_PULL_BEGIN_MARKER.length).replace(/^[\r\n]+/, "");
      pending = "";
      if (rest) onOutput(rest);
    },
    reset() {
      sawBegin = false;
      pending = "";
    },
  };
}

export function startOllamaModelPull(input: {
  project: Project;
  tag: string;
  remoteServerId?: string;
  onOutput: (output: string) => void;
  onOutputReset?: () => void;
  onComplete: (completion: OllamaModelPullCompletion) => void;
}): OllamaModelPullHandle {
  const tag = normalizeOllamaLibraryTag(input.tag);
  if (!isValidOllamaLibraryTag(tag)) throw new Error("Invalid Ollama model tag.");
  const shellId = `ollama-pull:${crypto.randomUUID()}`;
  const remoteServerId =
    input.remoteServerId ?? input.project.remoteServerId ?? input.project.location.remoteServerId;
  const projectLocation = remoteServerId
    ? { ...input.project.location, remoteServerId }
    : input.project.location;
  const script = buildOllamaModelPullScript(tag, projectLocation.kind);
  const gate = createBeginMarkerGate(input.onOutput);
  let settled = false;
  let cancelRequested = false;
  let startSucceeded = false;
  let detach: () => void = () => undefined;
  let cancelPromise: Promise<void> | undefined;

  const startPromise = startShellWithCurrentSettings({
    shellId,
    projectLocation,
    startInHome: true,
    ...(projectLocation.kind === "windows" ? { windowsShellRuntime: "powershell" as const } : {}),
  }).then(
    () => {
      startSucceeded = true;
    },
    (error: unknown) => {
      finish({
        status: "failed",
        exitCode: -1,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );

  async function closeOwnedShell(): Promise<void> {
    await startPromise;
    if (!startSucceeded) return;
    disposeRoutedShellSession(shellId);
    await readBridge().closeThread({ threadId: shellId });
  }

  function finish(completion: OllamaModelPullCompletion) {
    if (settled) return;
    settled = true;
    detach();
    input.onComplete(completion);
    void closeOwnedShell().catch(() => undefined);
  }

  detach = writeScriptToShellThenExitOnSuccess(
    shellId,
    script,
    projectLocation.kind,
    () => undefined,
    undefined,
    remoteServerId,
    {
      onOutput: (output) => gate.output(output),
      onReset: () => {
        gate.reset();
        input.onOutputReset?.();
      },
      onCommandCompletion: (exitCode, source) => {
        if (cancelRequested) return;
        if (source === "marker" && exitCode === 0) {
          finish({ status: "success" });
        } else {
          finish({ status: "failed", exitCode });
        }
      },
    },
  );

  return {
    shellId,
    cancel: () => {
      if (settled) return Promise.resolve();
      if (cancelPromise) return cancelPromise;
      cancelRequested = true;
      detach();
      cancelPromise = closeOwnedShell().catch((error: unknown) => {
        cancelPromise = undefined;
        throw error;
      });
      return cancelPromise;
    },
  };
}

export function appendOllamaPullOutput(current: string, chunk: string): string {
  const normalized = chunk.replace(/\r\n?/g, "\n");
  return `${current}${normalized}`.slice(-4096);
}

export function ollamaPullPercent(output: string): number | undefined {
  let percent: number | undefined;
  for (const match of output.matchAll(/(?:^|\s)(\d{1,3})%(?=\s|$)/g)) {
    const value = Number(match[1]);
    if (value <= 100) percent = value;
  }
  return percent;
}
