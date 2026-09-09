import assert from "node:assert/strict";
import { join } from "node:path";
import { mockDraftVoicePermissionGate } from "./smoke-live-voice-draft.mjs";

/** Deterministic composer/media cleanup coverage without microphone or provider access. */
export async function mockLiveVoiceGate({
  client,
  evaluate,
  waitForValue,
  screenshot,
  outDir,
  fixture,
}) {
  const run = (expression) => evaluate(client, expression, true);
  try {
    await run(`(async () => {
      const voice = await import('/src/renderer/speech/liveVoice.ts');
      const stores = window.__poracodeDev.stores;
      const original = stores.agentStatuses.getState();
      const capability = { transport: 'webrtc', dataChannel: 'smoke-events' };
      const saved = window.__liveVoiceSmoke = {
        voice, original, view: stores.app.getState().view,
        capture: navigator.mediaDevices.getUserMedia,
        stopped: 0, capability,
      };
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { saved.grant = resolve; });
      const candidate = {
        kind: 'codex', label: 'Smoke Voice', installed: true, authState: 'authenticated',
        envKind: ${JSON.stringify(fixture.project.location.kind)},
        capabilities: {
          models: [{ id: 'smoke-model', label: 'Smoke Model' }], efforts: [], modelEfforts: {}, modes: ['agent'],
          approvalPolicies: [], sandboxModes: [], supportsResume: true, supportsDirectInput: true,
          liveInputMode: 'server', presentationMode: 'gui', presentationModes: ['gui'],
          liveVoice: capability,
        },
      };
      stores.agentStatuses.getState().hydrateFromCache({ windows: [candidate], wsl: [] });
      const thread = stores.app.getState().createThread({
        projectId: ${JSON.stringify(fixture.project.id)}, agentKind: candidate.kind,
        config: { model: 'smoke-model' }, prompt: '', presentationMode: 'gui',
      });
      saved.threadId = thread.id;
      stores.app.getState().updateThreadRuntime(thread.id, {
        status: 'idle', attention: 'none', canResumeWithConfig: true,
        sessionRef: { providerSessionId: 'smoke-session', discoveredAt: new Date().toISOString() },
      });
    })()`);
    const visible = () =>
      run(`Boolean(document.querySelector('button[aria-label="Start live voice"]'))`);
    await waitForValue(visible, Boolean, "empty composer voice button");
    await run(`document.querySelector('button[aria-label="Start live voice"]').click()`);
    await waitForValue(
      () => run(`Boolean(document.querySelector('button[aria-label="Cancel voice connection"]'))`),
      Boolean,
      "voice cancellation control",
    );
    await run(`document.querySelector('button[aria-label="Cancel voice connection"]').click()`);
    await run(`(() => {
      const s = window.__liveVoiceSmoke;
      const track = { stop: () => s.stopped++ };
      s.grant({ getTracks: () => [track] });
    })()`);
    await waitForValue(
      () => run(`window.__liveVoiceSmoke.stopped`),
      (count) => count === 1,
      "late microphone cleanup",
    );

    await run(`(() => {
      const s = window.__liveVoiceSmoke;
      s.track = { enabled: true, onended: null, stop: () => s.stopped++ };
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [s.track], getAudioTracks: () => [s.track] });
      s.starting = s.voice.liveVoice.start({ threadId: s.threadId, capability: s.capability,
        prepare: () => new Promise(resolve => { s.prepared = resolve; }) });
    })()`);
    await waitForValue(
      () => run(`Boolean(window.__liveVoiceSmoke.prepared)`),
      Boolean,
      "media acquisition",
    );
    await run(`document.querySelector('button[aria-label="Mute microphone"]').click()`);
    await waitForValue(
      () => run(`window.__liveVoiceSmoke.track.enabled`),
      (enabled) => enabled === false,
      "mute disables microphone",
    );
    await screenshot(client, join(outDir, "live-voice-muted.png"));
    await run(`document.querySelector('button[aria-label="Unmute microphone"]').click()`);
    assert.equal(await run(`window.__liveVoiceSmoke.track.enabled`), true);
    await run(
      `document.querySelector('[data-live-voice] button[aria-label="End voice chat"]').click()`,
    );
    await run(
      `(async () => { const s = window.__liveVoiceSmoke; s.prepared(); await s.starting; })()`,
    );
    assert.equal(await run(`window.__liveVoiceSmoke.stopped`), 2);
    assert.equal(await run(`window.__liveVoiceSmoke.voice.useLiveVoice.getState().phase`), "idle");
    await screenshot(client, join(outDir, "live-voice-idle.png"));
    await mockDraftVoicePermissionGate({
      client,
      evaluate,
      waitForValue,
      screenshot,
      outDir,
      fixture,
    });
    return "composer start/cancel, late capture cleanup, mute/unmute, hangup, and preservation/reopening of text and attachment drafts edited during pending microphone permission passed with synthetic media; no real microphone or provider used";
  } finally {
    await run(`(async () => {
      const s = window.__liveVoiceSmoke;
      if (!s) return;
      await s.voice.liveVoice.stop();
      s.prepared?.();
      navigator.mediaDevices.getUserMedia = s.capture;
      const stores = window.__poracodeDev.stores;
      if (s.threadId) stores.app.getState().deleteThread(s.threadId);
      stores.app.setState({ view: s.view });
      stores.agentStatuses.setState(s.original);
      delete window.__liveVoiceSmoke;
    })()`);
  }
}
