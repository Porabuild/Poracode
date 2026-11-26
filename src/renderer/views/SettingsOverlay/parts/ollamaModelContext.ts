import type { Project } from "@/shared/contracts";
import { msg } from "@lingui/core/macro";
import {
  generateOllamaContextAliasId,
  isOllamaContextLength,
  isValidOllamaInstalledModelId,
  OLLAMA_CONTEXT_ALIAS_PREFIX,
} from "@/shared/agents/ollamaContext";
import { i18n } from "@/renderer/i18n/i18n";
import { readBridge } from "@/renderer/bridge";
import {
  disposeRoutedShellSession,
  startShellWithCurrentSettings,
  writeScriptToShellThenExitOnSuccess,
} from "@/renderer/utils/shellUtils";

export const OLLAMA_CONTEXT_HOST = "127.0.0.1:11434";
export const OLLAMA_CONTEXT_BASE_URL = `http://${OLLAMA_CONTEXT_HOST}`;
export const OLLAMA_CONTEXT_BEGIN_MARKER = "PORACODE_OLLAMA_CTX_BEGIN";
export const OLLAMA_CONTEXT_SUCCESS_MARKER = "PORACODE_OLLAMA_CTX_SUCCESS";
export const OLLAMA_CONTEXT_UNREACHABLE_MARKER = "PORACODE_OLLAMA_CTX_UNREACHABLE";
export const OLLAMA_CONTEXT_SOURCE_MISSING_MARKER = "PORACODE_OLLAMA_CTX_SOURCE_MISSING";
export const OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER = "PORACODE_OLLAMA_CTX_SOURCE_UNSUPPORTED";
export const OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER = "PORACODE_OLLAMA_CTX_ALIAS_COLLISION";
export const OLLAMA_CONTEXT_CREATE_FAILED_MARKER = "PORACODE_OLLAMA_CTX_CREATE_FAILED";
export const OLLAMA_CONTEXT_PREPARE_TIMEOUT_MS = 120_000;

export type OllamaContextPreparationFailure =
  | "terminal-unavailable"
  | "timeout"
  | "unreachable"
  | "source-missing"
  | "source-unsupported"
  | "alias-collision"
  | "create-failed";

export type OllamaContextPreparationCompletion =
  | { status: "success"; alias: string }
  | {
      status: "failed";
      reason: OllamaContextPreparationFailure;
      exitCode: number;
      detail?: string;
    };

export interface OllamaContextPreparationHandle {
  shellId: string;
  cancel: () => Promise<void>;
}

function quotePosixShellArg(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function quotePowerShellArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function jsonBody(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

/** Emits a marker so the command's terminal echo never contains it contiguously. */
function posixMarker(marker: string): string {
  const split = marker.lastIndexOf("_");
  return `printf '%s\\n' '${marker.slice(0, split + 1)}'${marker.slice(split + 1)}`;
}

/** Emits a marker so the command's terminal echo never contains it contiguously. */
function powerShellMarker(marker: string): string {
  const split = marker.lastIndexOf("_");
  return `Write-Host ('${marker.slice(0, split + 1)}' + '${marker.slice(split + 1)}')`;
}

/** Builds the exact `/api/show` body for one literal installed model id. */
export function buildOllamaContextShowPayload(model: string): string {
  return jsonBody({ model });
}

/** Builds the exact `/api/create` body for one derived alias. */
export function buildOllamaContextCreatePayload(input: {
  alias: string;
  baseModel: string;
  contextLength: number;
}): string {
  return jsonBody({
    model: input.alias,
    from: input.baseModel,
    parameters: { num_ctx: input.contextLength },
    stream: false,
  });
}

function assertPreparationInput(input: {
  baseModel: string;
  alias: string;
  contextLength: number;
}): void {
  if (!isValidOllamaInstalledModelId(input.baseModel)) {
    throw new Error("Invalid Ollama model id.");
  }
  if (
    !isValidOllamaInstalledModelId(input.alias) ||
    !input.alias.startsWith(OLLAMA_CONTEXT_ALIAS_PREFIX)
  ) {
    throw new Error("Invalid Ollama context model alias.");
  }
  if (!isOllamaContextLength(input.contextLength)) {
    throw new Error("Invalid Ollama context length.");
  }
}

/**
 * Runs on the selected host. It verifies the installed source first (including
 * completion capability), refuses to replace an existing alias with different
 * parameters, then asks Ollama for a derived immutable model. Nothing is
 * pulled, downloaded, or redirected.
 */
export function buildOllamaContextPreparationScript(
  input: {
    baseModel: string;
    alias: string;
    contextLength: number;
  },
  locationKind: Project["location"]["kind"],
): string {
  assertPreparationInput(input);
  const sourcePayload = buildOllamaContextShowPayload(input.baseModel);
  const aliasPayload = buildOllamaContextShowPayload(input.alias);
  const createPayload = buildOllamaContextCreatePayload(input);
  const newlineEscape = String.raw`\\n`;
  const parameterPattern = `("parameters"[[:space:]]*:[[:space:]]*"|${newlineEscape})num_ctx[[:space:]]+${input.contextLength}(${newlineEscape}|")`;

  if (locationKind === "windows") {
    const source = quotePowerShellArg(sourcePayload);
    const alias = quotePowerShellArg(aliasPayload);
    const create = quotePowerShellArg(createPayload);
    const numCtxPattern = quotePowerShellArg(`(?m)^num_ctx\\s+${input.contextLength}$`);
    return [
      powerShellMarker(OLLAMA_CONTEXT_BEGIN_MARKER),
      "$ErrorActionPreference='Stop'",
      "$sourceStatus=0",
      `try { $sourceModel=Invoke-RestMethod -Method Post -Uri '${OLLAMA_CONTEXT_BASE_URL}/api/show' -ContentType 'application/json' -Body ${source} -MaximumRedirection 0 -TimeoutSec 20; $sourceStatus=200 } catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { $sourceStatus=404 } }`,
      `if ($sourceStatus -eq 404) { ${powerShellMarker(OLLAMA_CONTEXT_SOURCE_MISSING_MARKER)}; throw 'Ollama source is missing.' } elseif ($sourceStatus -ne 200) { ${powerShellMarker(OLLAMA_CONTEXT_UNREACHABLE_MARKER)}; throw 'Ollama is unreachable.' }`,
      `if ($sourceModel.remote_host -or $sourceModel.remote_model) { ${powerShellMarker(OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER)}; throw 'Ollama source is remote.' }`,
      `if ($sourceModel.capabilities -notcontains 'completion') { ${powerShellMarker(OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER)}; throw 'Ollama source cannot complete.' }`,
      "$aliasStatus=0",
      `try { $aliasModel=Invoke-RestMethod -Method Post -Uri '${OLLAMA_CONTEXT_BASE_URL}/api/show' -ContentType 'application/json' -Body ${alias} -MaximumRedirection 0 -TimeoutSec 20; $aliasStatus=200 } catch { if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { $aliasStatus=404 } }`,
      `if ($aliasStatus -eq 200) { if ($aliasModel.parameters -notmatch ${numCtxPattern}) { ${powerShellMarker(OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER)}; throw 'Ollama context alias collision.' }; ${powerShellMarker(OLLAMA_CONTEXT_SUCCESS_MARKER)} } elseif ($aliasStatus -ne 404) { ${powerShellMarker(OLLAMA_CONTEXT_UNREACHABLE_MARKER)}; throw 'Ollama is unreachable.' } else { try { $created=Invoke-RestMethod -Method Post -Uri '${OLLAMA_CONTEXT_BASE_URL}/api/create' -ContentType 'application/json' -Body ${create} -MaximumRedirection 0 -TimeoutSec 120 } catch { ${powerShellMarker(OLLAMA_CONTEXT_CREATE_FAILED_MARKER)}; throw 'Ollama context creation failed.' }; if ($created.status -ne 'success') { ${powerShellMarker(OLLAMA_CONTEXT_CREATE_FAILED_MARKER)}; throw 'Ollama context creation failed.' }; ${powerShellMarker(OLLAMA_CONTEXT_SUCCESS_MARKER)} }`,
    ].join("; ");
  }

  const source = quotePosixShellArg(sourcePayload);
  const alias = quotePosixShellArg(aliasPayload);
  const create = quotePosixShellArg(createPayload);
  return [
    posixMarker(OLLAMA_CONTEXT_BEGIN_MARKER),
    `source_status=$(curl -q --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST '${OLLAMA_CONTEXT_BASE_URL}/api/show' -H 'Content-Type: application/json' -d ${source}); [ $? -eq 0 ] || source_status=000`,
    `if [ "$source_status" = "000" ]; then ${posixMarker(OLLAMA_CONTEXT_UNREACHABLE_MARKER)}; exit 1; elif [ "$source_status" != "200" ]; then ${posixMarker(OLLAMA_CONTEXT_SOURCE_MISSING_MARKER)}; exit 1; fi`,
    `source_show=$(curl -q --noproxy '*' -sS --fail --max-time 20 -X POST '${OLLAMA_CONTEXT_BASE_URL}/api/show' -H 'Content-Type: application/json' -d ${source}); [ $? -eq 0 ] || { ${posixMarker(OLLAMA_CONTEXT_SOURCE_MISSING_MARKER)}; exit 1; }`,
    `if printf '%s' "$source_show" | grep -Eq '"remote_(host|model)"[[:space:]]*:[[:space:]]*"[^"]+"'; then ${posixMarker(OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER)}; exit 1; fi`,
    `printf '%s' "$source_show" | grep -Eq '"capabilities":\\[[^]]*"completion"' || { ${posixMarker(OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER)}; exit 1; }`,
    `alias_status=$(curl -q --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST '${OLLAMA_CONTEXT_BASE_URL}/api/show' -H 'Content-Type: application/json' -d ${alias}); [ $? -eq 0 ] || alias_status=000`,
    `if [ "$alias_status" = "200" ]; then alias_show=$(curl -q --noproxy '*' -sS --fail --max-time 20 -X POST '${OLLAMA_CONTEXT_BASE_URL}/api/show' -H 'Content-Type: application/json' -d ${alias}); printf '%s' "$alias_show" | grep -Eq '${parameterPattern}' || { ${posixMarker(OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER)}; exit 1; }; ${posixMarker(OLLAMA_CONTEXT_SUCCESS_MARKER)}; elif [ "$alias_status" != "404" ]; then ${posixMarker(OLLAMA_CONTEXT_UNREACHABLE_MARKER)}; exit 1; else created=$(curl -q --noproxy '*' -sS --fail --max-time 120 -X POST '${OLLAMA_CONTEXT_BASE_URL}/api/create' -H 'Content-Type: application/json' -d ${create}); [ $? -eq 0 ] || { ${posixMarker(OLLAMA_CONTEXT_CREATE_FAILED_MARKER)}; exit 1; }; printf '%s' "$created" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"success"' || { ${posixMarker(OLLAMA_CONTEXT_CREATE_FAILED_MARKER)}; exit 1; }; ${posixMarker(OLLAMA_CONTEXT_SUCCESS_MARKER)}; fi`,
  ].join("; ");
}

/** Arms only after the real begin marker; discards the command's terminal echo. */
function createBeginMarkerGate() {
  let armed = false;
  let pending = "";
  let output = "";
  return {
    push(raw: string) {
      if (armed) {
        output = `${output}${raw}`.slice(-8192);
        return;
      }
      pending = `${pending}${raw}`.slice(-8192);
      const index = pending.indexOf(OLLAMA_CONTEXT_BEGIN_MARKER);
      if (index < 0) return;
      armed = true;
      const rest = pending.slice(index + OLLAMA_CONTEXT_BEGIN_MARKER.length);
      pending = "";
      output = rest.slice(-8192);
    },
    replace(raw: string) {
      armed = false;
      pending = "";
      output = "";
      // A retained reconnect tail can begin after our echoed command, so the
      // begin marker may already be scrolled away. Split markers make a real
      // marker in the snapshot safe to trust even without the begin line.
      if (
        !raw.includes(OLLAMA_CONTEXT_BEGIN_MARKER) &&
        (raw.includes(OLLAMA_CONTEXT_SUCCESS_MARKER) ||
          raw.includes(OLLAMA_CONTEXT_UNREACHABLE_MARKER) ||
          raw.includes(OLLAMA_CONTEXT_SOURCE_MISSING_MARKER) ||
          raw.includes(OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER) ||
          raw.includes(OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER) ||
          raw.includes(OLLAMA_CONTEXT_CREATE_FAILED_MARKER))
      ) {
        armed = true;
        output = raw.slice(-8192);
        return;
      }
      this.push(raw);
    },
    reset() {
      armed = false;
      pending = "";
      output = "";
    },
    current(): string {
      return output;
    },
  };
}

function failureReasonFromOutput(output: string): OllamaContextPreparationFailure {
  if (output.includes(OLLAMA_CONTEXT_ALIAS_COLLISION_MARKER)) return "alias-collision";
  if (output.includes(OLLAMA_CONTEXT_SOURCE_UNSUPPORTED_MARKER)) return "source-unsupported";
  if (output.includes(OLLAMA_CONTEXT_SOURCE_MISSING_MARKER)) return "source-missing";
  if (output.includes(OLLAMA_CONTEXT_CREATE_FAILED_MARKER)) return "create-failed";
  return "unreachable";
}

const FAILURE_MESSAGES: Record<OllamaContextPreparationFailure, () => string> = {
  "terminal-unavailable": () =>
    i18n._(
      msg`The selected host does not allow terminal access, so its Ollama context model cannot be prepared.`,
    ),
  timeout: () =>
    i18n._(
      msg`Ollama did not finish preparing the context model on the selected host. Check Ollama there, then try again.`,
    ),
  unreachable: () =>
    i18n._(msg`Ollama is not reachable on the selected host. Start Ollama there, then try again.`),
  "source-missing": () =>
    i18n._(
      msg`Ollama on the selected host does not have that model installed. Pull the model there first.`,
    ),
  "source-unsupported": () =>
    i18n._(
      msg`That Ollama model on the selected host is not a local completion model, so it cannot be used here.`,
    ),
  "alias-collision": () =>
    i18n._(
      msg`A generated context model with that name already exists on the selected host with different settings. Choose another context length or remove that model there.`,
    ),
  "create-failed": () =>
    i18n._(msg`Ollama could not prepare the context model on the selected host.`),
};

export function ollamaContextPreparationFailureMessage(
  reason: OllamaContextPreparationFailure,
): string {
  return FAILURE_MESSAGES[reason]();
}

export class OllamaContextPreparationError extends Error {
  constructor(
    readonly reason: OllamaContextPreparationFailure,
    readonly baseModel: string,
    readonly contextLength?: number,
    readonly detail?: string,
  ) {
    super(
      `${ollamaContextPreparationFailureMessage(reason)}${baseModel ? ` (${baseModel}${contextLength !== undefined ? `, ${contextLength}` : ""})` : ""}`,
    );
    this.name = "OllamaContextPreparationError";
  }
}

export function startOllamaContextPreparation(input: {
  project: Project;
  baseModel: string;
  alias: string;
  contextLength: number;
  remoteServerId?: string;
  onComplete: (completion: OllamaContextPreparationCompletion) => void;
}): OllamaContextPreparationHandle {
  assertPreparationInput(input);
  const shellId = `ollama-context:${generateOllamaContextAliasId()}`;
  const remoteServerId =
    input.remoteServerId ?? input.project.remoteServerId ?? input.project.location.remoteServerId;
  const projectLocation = remoteServerId
    ? { ...input.project.location, remoteServerId }
    : input.project.location;
  const script = buildOllamaContextPreparationScript(input, projectLocation.kind);
  const gate = createBeginMarkerGate();
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
        reason: "terminal-unavailable",
        exitCode: -1,
        ...(error instanceof Error ? { detail: error.message } : {}),
      });
    },
  );

  async function closeOwnedShell(): Promise<void> {
    await startPromise;
    if (!startSucceeded) return;
    disposeRoutedShellSession(shellId);
    await readBridge().closeThread({ threadId: shellId });
  }

  function finish(completion: OllamaContextPreparationCompletion) {
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
      onOutput: (chunk) => gate.push(chunk),
      onSnapshot: (snapshot) => gate.replace(snapshot.data),
      onReset: () => gate.reset(),
      onCommandCompletion: (exitCode, source) => {
        if (cancelRequested) return;
        const output = gate.current();
        if (
          source === "marker" &&
          exitCode === 0 &&
          output.includes(OLLAMA_CONTEXT_SUCCESS_MARKER)
        ) {
          finish({ status: "success", alias: input.alias });
          return;
        }
        const reason = failureReasonFromOutput(output);
        finish({
          status: "failed",
          reason,
          exitCode,
          ...(output.trim() ? { detail: output.trim().slice(-1000) } : {}),
        });
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

/** Prepares the alias on the selected host and resolves only after its success marker. */
export function prepareOllamaContextModel(input: {
  project: Project;
  baseModel: string;
  alias: string;
  contextLength: number;
  remoteServerId?: string;
  /** Test seam; production always uses the bounded default. */
  timeoutMs?: number;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const { timeoutMs = OLLAMA_CONTEXT_PREPARE_TIMEOUT_MS, ...startInput } = input;
    const handle = startOllamaContextPreparation({
      ...startInput,
      onComplete: (completion) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) globalThis.clearTimeout(timer);
        if (completion.status === "success") {
          resolve(completion.alias);
          return;
        }
        reject(
          new OllamaContextPreparationError(
            completion.reason,
            input.baseModel,
            input.contextLength,
            completion.detail,
          ),
        );
      },
    });
    timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      void handle.cancel().catch(() => undefined);
      reject(
        new OllamaContextPreparationError(
          "timeout",
          input.baseModel,
          input.contextLength,
          "Timed out waiting for the selected host.",
        ),
      );
    }, timeoutMs);
  });
}
