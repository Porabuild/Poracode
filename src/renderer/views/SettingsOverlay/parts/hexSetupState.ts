import type { HexVoiceModel, HexVoiceSetup } from "@/shared/contracts/hexVoice";

export type HexSetupStep = "engine" | "model";
export interface HexActionError {
  step: HexSetupStep;
  message: string;
}

export function deriveHexSetup(
  setup: HexVoiceSetup | null,
  models: readonly HexVoiceModel[],
  model: string,
) {
  const engine = setup?.engine;
  const preparation = setup?.preparation ?? null;
  const installing = engine?.state === "installing";
  const engineInstalled = engine?.state === "installed";
  const preparing = preparation?.phase === "preparing";
  const selected = models.find((item) => item.id === model);
  const ready = Boolean(engineInstalled && !preparing && selected?.installed && selected.verified);
  const updateAvailable = Boolean(
    engineInstalled &&
    engine?.source === "managed" &&
    engine.version &&
    engine.version !== engine.availableVersion,
  );
  const preparingName =
    models.find((item) => item.id === preparation?.model)?.name ?? preparation?.model ?? "";
  return {
    engine,
    preparation,
    installing,
    engineInstalled,
    preparing,
    selected,
    ready,
    updateAvailable,
    preparingName,
  };
}
