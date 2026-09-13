import type { RunOneShotInput } from "../base";
import { acquireOpenCode2Server, resolveOpenCode2SessionDirectory } from "./client";
import { parseOpenCode2ModelRef } from "./model";

/** Native generation has no tool loop and keeps project-specific model routing. */
export async function runOpenCode2OneShot(input: RunOneShotInput): Promise<string> {
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
    const model = parseOpenCode2ModelRef(input.model, input.effort);
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
