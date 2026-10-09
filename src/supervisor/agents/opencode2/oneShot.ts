import { assertOneShotControlsMapped, type RunOneShotInput } from "../base";
import { acquireOpenCode2Server, resolveOpenCode2SessionDirectory } from "./client";
import { parseOpenCode2ModelRef } from "./model";

/** Native generation has no tool loop and keeps project-specific model routing. */
export async function runOpenCode2OneShot(input: RunOneShotInput): Promise<string> {
  // Model routing maps model + nonempty effort through the V2 model ref; the
  // V2 SDK has no Fast lane, so false Fast is the declared-inactive legacy
  // carrier while meaningful Fast — and every other present carrier — refuses
  // before the server is acquired.
  const model = parseOpenCode2ModelRef(input.selection.model, input.selection.effort);
  assertOneShotControlsMapped(input.selection, {
    effort: model?.id ? true : { inactive: [""] },
    fast: { inactive: [false] },
  });
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  signal.throwIfAborted();
  const acquired = await acquireOpenCode2Server({ projectLocation: input.location });
  let sessionID: string | undefined;
  try {
    const location = { directory: resolveOpenCode2SessionDirectory(input.location) };
    await acquired.client.plugin.awaitActivation({ location }, { signal });
    const session = await acquired.client.session.create({ location }, { signal });
    sessionID = session.id;
    if (model) await acquired.client.session.switchModel({ sessionID, model }, { signal });
    const result = await acquired.client.session.generate(
      { sessionID, prompt: input.prompt },
      { signal },
    );
    return result.text;
  } finally {
    try {
      if (sessionID)
        await acquired.client.session.remove({ sessionID }, { signal: AbortSignal.timeout(5_000) });
    } catch (error) {
      console.warn("[opencode2] temporary generation cleanup failed:", error);
    } finally {
      await acquired.dispose({ closeServerIfIdle: true });
    }
  }
}
