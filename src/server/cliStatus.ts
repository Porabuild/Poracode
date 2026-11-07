import {
  requestHostStatusDetailsFromRunningServer,
  requestHostStatusFromRunningServer,
  type HostStatusDetailsResponse,
  type HostStatusResponse,
} from "./pairingControl";
import { terminalText } from "./cliPrompts";

// The new detailed script view is independent from host-control and the
// unchanged basic status --json response. It contains no credential values.
export const CLI_STATUS_DETAILS_FORMAT_VERSION = 1;

export function parseStatusCliOptions(args: readonly string[]) {
  const flags = new Set<string>();
  for (const argument of args) {
    if ((argument !== "--json" && argument !== "--details") || flags.has(argument))
      throw new Error("Usage: poracode status [--details] [--json]");
    flags.add(argument);
  }
  return { json: flags.has("--json"), details: flags.has("--details") };
}

export function renderServerStatus(
  response: HostStatusResponse | HostStatusDetailsResponse,
): string {
  const info = response.description;
  const details = "status" in response ? response.status : undefined;
  const state = details?.state ?? info.state;
  const endpoint = details ? details.endpoint : info.endpoint;
  const lines = [
    `State: ${state} (${info.mode})`,
    `Profile: ${info.profileNamespace}`,
    `Data: ${info.dataRoot}`,
    `Endpoint (reported): ${endpoint ?? "not listening"}`,
    `Owner generation: ${response.ownerGeneration}`,
  ];
  if (details) {
    lines.push(
      `Admission: ${details.admission}`,
      `Version: ${details.build.version}`,
      `Layout: ${details.build.layoutKind}`,
      `Running bundle: ${details.build.root}`,
      `Source revision: ${details.build.sourceRevision ?? "unavailable"}`,
      `Entrypoint SHA256: ${details.build.entrypointSha256 ?? "unavailable"}`,
      `Remote protocol: ${info.remoteProtocolVersion}`,
      `Advertised services: ${
        Object.entries(info.capabilities)
          .filter(([, enabled]) => enabled)
          .map(([name]) => name)
          .join(", ") || "none"
      }`,
    );
  }
  if (state === "stopping")
    lines.push("The owner is draining. Wait for retirement; run doctor if it does not finish.");
  else if (details?.admission === "held")
    lines.push(
      "Admission is held for staged upgrade/recovery. Inspect upgrade recovery and doctor before connecting clients.",
    );
  else if (state === "starting")
    lines.push("The owner is starting. Retry status; run doctor if startup does not finish.");
  else if (endpoint && info.operations.includes("issue-pairing"))
    lines.push(
      "Use pair with the same --base-dir to connect a client; doctor provides diagnostics.",
    );
  else lines.push("No client pairing endpoint was reported. Run doctor with the same --base-dir.");
  if (!details)
    lines.push(
      "Use status --details for the running build and admission state when supported by this owner.",
    );
  return lines.map(terminalText).join("\n") + "\n";
}

export async function runServerStatus(
  profileNamespace: string,
  options: ReturnType<typeof parseStatusCliOptions>,
) {
  const response = options.details
    ? await requestHostStatusDetailsFromRunningServer(profileNamespace)
    : await requestHostStatusFromRunningServer(profileNamespace);
  if (!options.json) {
    process.stdout.write(renderServerStatus(response));
    return;
  }
  const value =
    "status" in response
      ? {
          formatVersion: CLI_STATUS_DETAILS_FORMAT_VERSION,
          view: "running-owner",
          requestId: response.requestId,
          ownerGeneration: response.ownerGeneration,
          status: response.status,
          capabilities: response.description.capabilities,
          remoteProtocolVersion: response.description.remoteProtocolVersion,
        }
      : response;
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
