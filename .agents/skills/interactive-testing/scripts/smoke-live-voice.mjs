import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
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
      const voice = await window.__poracodeDev.loadLiveVoice();
      const stores = window.__poracodeDev.stores;
      const original = stores.agentStatuses.getState();
      const capability = { transport: 'webrtc', dataChannel: 'smoke-events' };
      const saved = window.__liveVoiceSmoke = {
        voice, original, view: stores.app.getState().view,
        capture: navigator.mediaDevices.getUserMedia,
        stopped: 0, capability,
      };
      // Observe before fixture creation: preserve the first membership/view
      // transition that can leave a pane pointing at a missing thread.
      saved.transitions = [];
      saved.unsubscribeTrace = stores.app.subscribe((next, previous) => {
        const before = new Set(previous.threads.map(thread => thread.id));
        const after = new Set(next.threads.map(thread => thread.id));
        const added = [...after].filter(id => !before.has(id));
        const removed = [...before].filter(id => !after.has(id));
        if (!added.length && !removed.length && JSON.stringify(next.view) === JSON.stringify(previous.view)) return;
        if (saved.transitions.length >= 128) return;
        saved.transitions.push({
          at: new Date().toISOString(), added, removed,
          previousView: previous.view, view: next.view,
          fixtureThreadId: saved.threadId ?? null,
          fixturePresent: saved.threadId ? after.has(saved.threadId) : null,
          stack: new Error('voice fixture membership/view transition').stack,
        });
      });
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
      const { loopback } = await window.__poracodeDev.loadHostDiagnostics();
      const activation = loopback.readManagedLoopbackActivation();
      if (!activation) throw new Error('Voice fixture requires the managed host');
      saved.hostClient = activation.client;
      const thread = stores.app.getState().createThread({
        projectId: ${JSON.stringify(fixture.project.id)}, agentKind: candidate.kind,
        config: { model: 'smoke-model' }, prompt: '', presentationMode: 'gui',
        suppressHostCreateIntent: true,
      });
      saved.threadId = thread.id;
      stores.app.getState().updateThreadRuntime(thread.id, {
        status: 'idle', attention: 'none', canResumeWithConfig: true,
        sessionRef: { providerSessionId: 'smoke-session', discoveredAt: new Date().toISOString() },
      });
      // This gate never launches a provider. Persist its inert fixture through
      // the existing host-owned DB seam before leaving the protected open pane.
      const row = stores.app.getState().threads.find(candidate => candidate.id === thread.id);
      if (!row) throw new Error('Voice fixture disappeared before persistence');
      await window.poracode.dbUpsertThread(row);
      const membership = await saved.hostClient.boundedCatalogMembership({ threadIds: [thread.id] });
      if (!membership.existingThreadIds.includes(thread.id)) {
        throw new Error('Voice fixture was not persisted by the host');
      }
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
    assert.equal(
      await run(`document.querySelectorAll('button[aria-label="Cancel voice connection"]').length`),
      1,
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
    await run(`(() => {
      const s = window.__liveVoiceSmoke;
      s.voice.useLiveVoice.setState({ phase: 'connected' });
      const items = [
        ['voice-smoke-user', 'user_message', 'Can you hear me?'],
        ['voice-smoke-assistant', 'assistant_message', 'Yes, I can hear you.'],
      ];
      window.__poracodeDev.stores.app.getState().applyRuntimeEvents(s.threadId,
        items.flatMap(([itemId, itemType, text]) => [
          { type: 'item.started', threadId: s.threadId, itemId, itemType,
            payload: { content: [{ kind: 'text', text }], displayAuthoritative: true, turnIndependent: true } },
          { type: 'item.completed', threadId: s.threadId, itemId },
        ]));
    })()`);
    await waitForValue(
      () => run(`document.querySelectorAll('button[aria-label="End voice chat"]').length`),
      (count) => count === 1,
      "one hang-up control for the active voice session",
    );
    await waitForValue(
      () => run(`document.body.innerText.split('Yes, I can hear you.').length - 1`),
      (count) => count === 1,
      "voice transcript appears once in the chat timeline",
    );
    assert.equal(
      await run(`document.querySelector('[data-live-voice]').innerText.trim()`),
      "Live voice",
    );
    const editor = `[...document.querySelectorAll('[data-composer-input-anchor] [contenteditable="true"]')].find(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')`;
    await run(`${editor}.focus()`);
    await client.send("Input.insertText", { text: "Typed follow-up during voice" });
    await waitForValue(
      () =>
        run(`Boolean(document.querySelector('button[aria-label="Send message"]:not(:disabled)'))`),
      Boolean,
      "typed input restores Send while voice remains active",
    );
    assert.equal(
      await run(`document.querySelectorAll('button[aria-label="End voice chat"]').length`),
      1,
    );
    await screenshot(client, join(outDir, "live-voice-compact.png"));
    await run(
      `(() => { const el = ${editor}; el.textContent = ''; el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' })); })()`,
    );
    await waitForValue(
      () => run(`document.querySelectorAll('button[aria-label="Send message"]').length`),
      (count) => count === 0,
      "empty voice composer keeps only the dedicated voice controls",
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
    return "single compact voice controls, typed Send during voice, start/cancel, late capture cleanup, mute/unmute, hangup, and preservation/reopening of text and attachment drafts edited during pending microphone permission passed with synthetic media; no real microphone or provider used";
  } catch (error) {
    const state = await run(`(() => ({
      view: window.__poracodeDev.stores.app.getState().view,
      controls: [...document.querySelectorAll('button')].filter(el => el.getClientRects().length).map(el => el.getAttribute('aria-label')).filter(Boolean),
      providers: window.__poracodeDev.stores.agentStatuses.getState().agentStatuses.map(status => ({
        kind: status.kind, installed: status.installed, liveVoice: status.capabilities?.liveVoice,
      })),
    }))()`);
    await screenshot(client, join(outDir, "live-voice-failure.png"));
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; fixture state: ${JSON.stringify(state)}`,
      { cause: error },
    );
  } finally {
    try {
      const trace = await run(`window.__liveVoiceSmoke?.transitions ?? []`);
      await writeFile(
        join(outDir, "live-voice-state-transitions.json"),
        JSON.stringify(trace, null, 2) + "\n",
      );
    } finally {
      await run(`(async () => {
      const s = window.__liveVoiceSmoke;
      if (!s) return;
      s.unsubscribeTrace?.();
      await s.voice.liveVoice.stop();
      s.prepared?.();
      navigator.mediaDevices.getUserMedia = s.capture;
      const stores = window.__poracodeDev.stores;
      try {
        if (s.threadId) {
          if (s.hostClient) {
            await s.hostClient.sendThreadCommand({ kind: 'delete', threadId: s.threadId });
            const membership = await s.hostClient.boundedCatalogMembership({ threadIds: [s.threadId] });
            if (membership.existingThreadIds.includes(s.threadId)) {
              throw new Error('Voice fixture remains persisted after cleanup');
            }
          }
        }
      } finally {
        if (s.threadId) stores.app.getState().deleteThread(s.threadId);
        stores.app.setState({ view: s.view });
        stores.agentStatuses.setState(s.original);
        delete window.__liveVoiceSmoke;
      }
      })()`);
    }
  }
}
