import { assertOneShotControlsMapped, type RunOneShotInput } from "../base";
import { awaitOpenCodeActivation } from "./readiness";
import { acquireOpenCodeServer, resolveOpenCodeSessionDirectory } from "./client";
import { parseOpenCodeModelRef } from "./model";
import type { OpenCodeProfileRuntime } from "./profileConfig";

/** Native generation has no tool loop and keeps project-specific model routing. */
export async function runOpenCodeOneShot(
  input: RunOneShotInput,
  profile?: OpenCodeProfileRuntime,
): Promise<string> {
  // Model routing maps model + nonempty effort through the V2 model ref; the
  // V2 SDK has no Fast lane, so false Fast is the declared-inactive legacy
  // carrier while meaningful Fast — and every other present carrier — refuses
  // before the server is acquired.
  const model = parseOpenCodeModelRef(
    profile?.model ?? input.selection.model,
    profile ? undefined : input.selection.effort,
  );
  assertOneShotControlsMapped(input.selection, {
    effort: model?.id ? true : { inactive: [""] },
    fast: { inactive: [false] },
  });
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(120_000)])
    : AbortSignal.timeout(120_000);
  signal.throwIfAborted();
  const acquired = await acquireOpenCodeServer({
    projectLocation: input.location,
    ...(profile ? { profile: { key: profile.key, env: await profile.env(input.location) } } : {}),
  });
  let sessionID: string | undefined;
  try {
    const location = { directory: resolveOpenCodeSessionDirectory(input.location) };
    await awaitOpenCodeActivation(acquired.client, { location }, { signal });
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
      console.warn("[opencode] temporary generation cleanup failed:", error);
    } finally {
      await acquired.dispose({ closeServerIfIdle: true });
    }
  }
}
