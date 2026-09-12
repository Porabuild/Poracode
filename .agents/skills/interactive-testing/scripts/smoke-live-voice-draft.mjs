import assert from "node:assert/strict";
import { join } from "node:path";

/** Exercise the real draft editor while microphone permission is unresolved. */
export async function mockDraftVoicePermissionGate({
  client,
  evaluate,
  waitForValue,
  screenshot,
  outDir,
  fixture,
}) {
  const run = (expression) => evaluate(client, expression, true);
  const projectId = JSON.stringify(fixture.project.id);
  const draftText = "Keep this draft while voice permission is pending.";
  const attachmentName = "voice-draft-note.txt";
  const attachmentPath = join(
    fixture.project.location.path ?? fixture.project.location.linuxPath,
    "README.md",
  );
  const button = (label) =>
    `[...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)} && el.getClientRects().length)`;
  const editor = `[...document.querySelectorAll('[data-composer-input-anchor] [contenteditable="true"]')].find(el => el.getClientRects().length)`;

  await run(`(async () => {
    const s = window.__liveVoiceSmoke;
    const app = window.__poracodeDev.stores.app;
    s.draftOriginal = app.getState().draftContents[${projectId}];
    s.createThread = app.getState().createThread;
    s.draftLaunches = 0;
    s.attachInbox = (await import('/src/renderer/state/browserAttachInbox.ts')).useBrowserAttachInbox;
    app.setState({ createThread: () => {
      s.draftLaunches++;
      throw new Error('Unexpected thread launch during pending-permission regression');
    } });
  })()`);
  try {
    for (const kind of ["text", "attachment", "queued-attachment"]) {
      await run(`(() => {
        const s = window.__liveVoiceSmoke;
        const app = window.__poracodeDev.stores.app;
        app.getState().clearDraftContent(${projectId});
        s.draftStopped = 0;
        s.grant = null;
        navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { s.grant = resolve; });
        s.grantDraftMicrophone = () => {
          const track = { enabled: true, onended: null, stop: () => s.draftStopped++ };
          s.grant({ getTracks: () => [track], getAudioTracks: () => [track] });
        };
        app.getState().openDraft(${projectId});
      })()`);
      await waitForValue(
        () => run(`Boolean(${button("Start live voice")})`),
        Boolean,
        `empty ${kind} draft voice button`,
      );
      await run(`${button("Start live voice")}.click()`);
      await waitForValue(
        () => run(`Boolean(window.__liveVoiceSmoke.grant && ${button("Cancel voice connection")})`),
        Boolean,
        `pending ${kind} draft microphone permission and cancellation`,
      );

      if (kind === "text") {
        await run(`${editor}.focus()`);
        await client.send("Input.insertText", { text: draftText });
      } else {
        await run(`(() => { window.__liveVoiceSmoke.attachInbox.getState().enqueue({
          threadId: 'draft:' + ${projectId}, attachmentPath: ${JSON.stringify(attachmentPath)},
          attachmentName: ${JSON.stringify(attachmentName)}, mimeType: 'text/plain',
          selector: '#voice-draft-note', sourceUrl: 'https://example.com/voice-draft',
        });
        ${kind === "queued-attachment" ? "window.__liveVoiceSmoke.grantDraftMicrophone();" : ""}
        })()`);
      }
      await waitForValue(
        () => run(`window.__liveVoiceSmoke.voice.useLiveVoice.getState().phase`),
        (phase) => phase === "idle",
        `${kind} edit cancels the pending voice start`,
      );
      assert.equal(
        await run(`Boolean(${button("Launch thread")} && !${button("Launch thread")}.disabled)`),
        true,
      );
      if (kind !== "queued-attachment") {
        await run(`window.__liveVoiceSmoke.grantDraftMicrophone()`);
      }
      await waitForValue(
        () => run(`window.__liveVoiceSmoke.draftStopped`),
        (count) => count === 1,
        `${kind} draft releases late microphone track`,
      );
      assert.equal(await run(`window.__liveVoiceSmoke.draftLaunches`), 0);
      await run(
        `window.__poracodeDev.stores.app.getState().openThread(window.__liveVoiceSmoke.threadId)`,
      );
      const saved = await waitForValue(
        () => run(`window.__poracodeDev.stores.app.getState().draftContents[${projectId}]`),
        (value) => Boolean(value),
        `${kind} draft persisted after navigation`,
      );
      if (kind === "text") {
        assert(
          saved.segments.some(
            (segment) => segment.kind === "text" && segment.content.includes(draftText),
          ),
        );
      } else {
        assert(
          saved.attachments.some(
            (attachment) =>
              attachment.path === attachmentPath && attachment.name === attachmentName,
          ),
        );
      }
      await run(`window.__poracodeDev.stores.app.getState().openDraft(${projectId})`);
      await waitForValue(
        () => run(kind === "text" ? `(${editor})?.textContent ?? ''` : `document.body.innerText`),
        (text) => text.includes(kind === "text" ? draftText : "#voice-draft-note"),
        `${kind} draft restored after reopening`,
      );
      await screenshot(client, join(outDir, `live-voice-draft-${kind}-preserved.png`));
      await run(
        `window.__poracodeDev.stores.app.getState().openThread(window.__liveVoiceSmoke.threadId)`,
      );
      await waitForValue(
        () => run(`Boolean(${button("Start live voice")})`),
        Boolean,
        "returned to existing thread",
      );
      await waitForValue(
        () => run(`window.__poracodeDev.stores.app.getState().draftContents[${projectId}]`),
        Boolean,
        "restored draft persisted again before the next case",
      );
    }
  } finally {
    await run(`(async () => {
      const s = window.__liveVoiceSmoke;
      await s.voice.liveVoice.stop();
      const app = window.__poracodeDev.stores.app;
      app.setState({ createThread: s.createThread });
      app.getState().clearDraftContent(${projectId});
      if (s.draftOriginal) app.getState().saveDraftContent(${projectId}, s.draftOriginal);
    })()`);
  }
}
