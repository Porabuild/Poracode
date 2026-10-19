import { join, posix } from "node:path";
import type { ManageModelProvidersPayload, ManageModelProvidersResult } from "@/shared/contracts";
import { manageModelProvidersResultSchema } from "@/shared/contracts";
import { prepareOneShot } from "@/supervisor/oneShotSpawn";
import { detectProbeLocation } from "../base";
import { stageLaunchFiles } from "../base/launchFiles";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { DEEPSEEK_MODEL_PROVIDERS_BRIDGE } from "./modelProvidersBridge";

export async function manageDeepSeekModelProviders(
  input: ManageModelProvidersPayload,
): Promise<ManageModelProvidersResult> {
  const location = detectProbeLocation(
    input.env.kind === "wsl"
      ? { envKind: "wsl", wslDistro: input.env.distro }
      : { envKind: process.platform === "win32" ? "windows" : "posix" },
  );
  const staged = await stageLaunchFiles(location, "deepseek-providers", {
    "bridge.mjs": DEEPSEEK_MODEL_PROVIDERS_BRIDGE,
    "providers.json": JSON.stringify([
      { id: "acp", disabled: true },
      { id: "acp-app-startup", disabled: true },
      { insert: [{ id: "poracode-model-providers", name: "./bridge.mjs" }] },
    ]),
  });
  try {
    const patchPath = (location.kind === "wsl" ? posix.join : join)(
      staged.directory,
      "providers.json",
    );
    const { spec, spawn } = await prepareOneShot(location, {
      command: resolveAgentBinaryPath(location, "dsh") ?? "dsh",
      args: ["--profile", "acp", "--patch", patchPath],
    });
    // Keys travel over stdin, never argv, environment, or staged configuration.
    const output = await spawn(spec, JSON.stringify(input), 60_000);
    const line = output
      .split(/\r?\n/)
      .find((value) => value.startsWith("PORACODE_MODEL_PROVIDERS_V1="));
    if (!line) return { ok: false, reason: "rejected" };
    return manageModelProvidersResultSchema.parse(
      JSON.parse(line.slice("PORACODE_MODEL_PROVIDERS_V1=".length)),
    );
  } catch {
    // Native diagnostics can include user config. Do not return them over IPC.
    return { ok: false, reason: "rejected" };
  } finally {
    await staged.cleanup();
  }
}
