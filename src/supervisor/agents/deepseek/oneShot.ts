import { join, posix } from "node:path";
import { prepareOneShot } from "@/supervisor/oneShotSpawn";
import {
  assertOneShotControlsMapped,
  prepareAgentLocationEnvironment,
  type RunOneShotInput,
} from "../base";
import { stageLaunchFiles } from "../base/launchFiles";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { DEEPSEEK_GENERATION_POLICY } from "./oneShotPolicy";

/** The ACP model selector is an opaque JSON tuple; only the headless boundary decodes it. */
export function deepSeekOneShotSelection(model: string, effort?: string) {
  let route: unknown;
  try {
    route = JSON.parse(model);
  } catch {
    throw new Error("DeepSeek Harness requires a provider/model route from its model picker.");
  }
  if (
    !Array.isArray(route) ||
    route.length !== 2 ||
    !route.every((part: unknown) => typeof part === "string" && part.trim().length > 0)
  ) {
    throw new Error("DeepSeek Harness requires a provider/model route from its model picker.");
  }
  return {
    provider: route[0] as string,
    model: route[1] as string,
    ...(effort ? { reasoningEffort: effort } : {}),
  };
}

export async function runDeepSeekOneShot(input: RunOneShotInput): Promise<string> {
  assertOneShotControlsMapped(input.selection, {
    effort: true,
    fast: { inactive: [false] },
  });
  const selection = deepSeekOneShotSelection(input.selection.model, input.selection.effort);
  input.signal?.throwIfAborted();
  await prepareAgentLocationEnvironment(input.location);
  // The shipped headless profile ignores GUI credentials. Restore the native
  // credential services for this invocation only; never rewrite the user's
  // profile or copy a key into the overlay. JSON is a YAML patch-list subset.
  const patch = JSON.stringify([
    { id: "agent-default-model", config: selection },
    { id: "session-title-llm", disabled: true },
    { id: "headless-runner", inject: ["headlessStartup", "poracodeGenerationPolicy"] },
    { id: "credentials", disabled: false },
    { id: "authorization", disabled: false },
    { id: "deepseek-account", disabled: false },
    {
      insert: [
        {
          id: "poracode-generation-policy",
          name: "./policy.mjs",
          config: { readOnlyWorkspace: input.readOnlyWorkspace === true },
        },
      ],
    },
  ]);
  const staged = await stageLaunchFiles(input.location, "deepseek-generation", {
    "generation.yml": patch,
    "policy.mjs": DEEPSEEK_GENERATION_POLICY,
  });
  try {
    input.signal?.throwIfAborted();
    const patchPath = (input.location.kind === "wsl" ? posix.join : join)(
      staged.directory,
      "generation.yml",
    );
    const { spec, spawn } = await prepareOneShot(input.location, {
      command: resolveAgentBinaryPath(input.location, "dsh") ?? "dsh",
      args: ["--profile", "headless", "--patch", patchPath, "-"],
      env: { DSH_PERMISSION_MODE: "read-only" },
    });
    const output = await spawn(spec, input.prompt, 120_000, input.signal);
    // Harness rc.2 writes account catalog startup diagnostics to stdout.
    // Strip only that preamble so it cannot become a generated title or commit.
    return output
      .replace(
        /^(?:\[llm-deepseek-account\] model listing from https?:\/\/[^\r\n]+ loaded \d+ model\(s\), skipped \d+ row\(s\)(?:\r?\n|$))+/,
        "",
      )
      .trim();
  } finally {
    await staged.cleanup();
  }
}
