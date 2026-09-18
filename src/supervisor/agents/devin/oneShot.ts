import { prepareOneShot } from "../../oneShotSpawn";
import type { RunOneShotInput } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildDevinOneShotArgs } from "./argv";
import { cachedDevinModels, loadDevinModels } from "./modelCatalog";
import { resolveDevinModel } from "./models";

/** Utilities can run before detection has warmed the process-local catalog. */
export async function runDevinOneShot(input: RunOneShotInput): Promise<string> {
  const families = cachedDevinModels(input.location).length
    ? cachedDevinModels(input.location)
    : await loadDevinModels(
        input.location,
        resolveAgentBinaryPath(input.location, "devin"),
        input.signal,
      );
  const model = resolveDevinModel(
    { model: input.model, effort: input.effort, fast: input.fast },
    families,
  );
  const { spec, spawn } = prepareOneShot(input.location, {
    command: "devin",
    args: buildDevinOneShotArgs(model, input.prompt),
    isolateCwd: !input.readOnlyWorkspace,
  });
  return spawn(spec, "", 120_000, input.signal);
}
