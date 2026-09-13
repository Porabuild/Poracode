import assert from "node:assert/strict";
import { join } from "node:path";
import { clickCdpElements } from "./poracode-cdp-actions.mjs";

/** Actual native overlay and IPC handoff, with the provider launch intercepted. */
export async function mockQuickComposerGate({
  client,
  evaluate,
  waitForValue,
  waitForTarget,
  connectTarget,
  screenshot,
  outDir,
  fixture,
}) {
  const main = (expression) => evaluate(client, expression, true);
  const nativeState = () => main("window.__poracodeSmokeNative.inspectQuickComposer()");
  const projectId = JSON.stringify(fixture.project.id);
  const prompt = "Quick composer deterministic handoff";
  const errors = [];
  let overlayClient;
  const overlay = (expression) => evaluate(overlayClient, expression, true);
  const button = (label) =>
    `[...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === ${JSON.stringify(label)} && el.getClientRects().length)`;
  const editor = `[...document.querySelectorAll('[data-composer-input-anchor] [contenteditable="true"]')].find(el => el.getClientRects().length)`;
  const click = (expression) =>
    clickCdpElements({
      client: overlayClient,
      evaluate,
      elementsExpression: `[${expression}].filter(Boolean)`,
      label: expression,
    });

  const prepare = `(() => {
    const stores = window.__poracodeDev.stores;
    window.__quickComposerSmoke ??= {
      app: { projects: stores.app.getState().projects, view: stores.app.getState().view,
        createThread: stores.app.getState().createThread },
      statuses: stores.agentStatuses.getState(),
    };
    stores.agentStatuses.getState().hydrateFromCache({ windows: [{
      kind: 'codex', label: 'Smoke Provider', installed: true, authState: 'authenticated',
      envKind: ${JSON.stringify(fixture.project.location.kind)},
      capabilities: {
        models: [{ id: 'smoke-model', label: 'Smoke Model' }, { id: 'smoke-model-alt', label: 'Smoke Alternate Model' }],
        efforts: [], modelEfforts: {}, modes: ['agent'], approvalPolicies: [], sandboxModes: [],
        supportsResume: true, supportsDirectInput: true, liveInputMode: 'server',
        presentationMode: 'gui', presentationModes: ['gui', 'terminal'],
      },
    }], wsl: [] });
    stores.app.getState().openDraft(${projectId});
  })()`;

  try {
    assert.equal(
      await main("window.__poracodeSmokeNative?.version"),
      2,
      "the native gate requires an unpackaged development app in mock mode",
    );
    await main(prepare);
    await main(`(() => {
      const s = window.__quickComposerSmoke;
      const app = window.__poracodeDev.stores.app;
      s.handoffs = [];
      s.nativeSubmissions = [];
      s.unsubscribeSubmissions = window.poracode.onQuickComposerSubmit(input => s.nativeSubmissions.push(input));
      s.threadIds = [];
      app.setState({ createThread: (input) => {
        s.handoffs.push(input);
        const thread = s.app.createThread(input);
        s.threadId = thread.id;
        s.threadIds.push(thread.id);
        app.getState().updateThreadRuntime(thread.id, {
          status: 'idle', attention: 'none', canResumeWithConfig: false,
        });
        // The real submission listener reached thread creation. End this QA
        // continuation before title generation, checkpointing or provider launch.
        throw new Error('Quick composer smoke intercepted provider launch');
      } });
    })()`);
    await main("window.__poracodeSmokeNative.toggleQuickComposer()");
    overlayClient = await connectTarget(await waitForTarget("quickComposer"));
    overlayClient.on("Runtime.exceptionThrown", (event) => {
      errors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text);
    });
    overlayClient.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error" || event.type === "assert") {
        errors.push(event.args?.map((arg) => arg.value ?? arg.description).join(" "));
      }
    });
    await overlayClient.send("Page.enable");
    await overlayClient.send("Runtime.enable");
    const idle = () =>
      waitForValue(
        async () =>
          (await nativeState())?.visible &&
          (await overlay("Boolean(document.querySelector('.quick-composer-root--idle'))")),
        Boolean,
        "visible idle native quick composer",
      );
    await idle();
    await overlay(prepare);
    await waitForValue(() => overlay(`Boolean(${editor})`), Boolean, "quick composer input");
    await screenshot(overlayClient, join(outDir, "quick-composer-open.png"));

    await click(button("Close"));
    await waitForValue(
      nativeState,
      (state) => state?.visible === false,
      "native overlay hidden after the close control",
    );
    await main("window.__poracodeSmokeNative.toggleQuickComposer()");
    await idle();
    await overlay(prepare);
    await waitForValue(() => overlay(`Boolean(${editor})`), Boolean, "reopened composer input");

    await click(button("Switch project"));
    await waitForValue(
      () =>
        overlay("Boolean(document.querySelector('[role=menu][aria-label=\"Switch project\"]'))"),
      Boolean,
      "quick composer project menu",
    );
    await click(
      `[...document.querySelectorAll('[role^="menuitem"]')].find(el => el.textContent.includes(${JSON.stringify(fixture.project.name)}))`,
    );
    await waitForValue(
      () => overlay("!document.querySelector('[role=menu][aria-label=\"Switch project\"]')"),
      Boolean,
      "project menu closes after selection",
    );
    await click(button("Select model"));
    await waitForValue(
      () =>
        overlay(
          "[...document.querySelectorAll('[role=option]')].some(el => el.textContent.includes('Smoke Alternate Model'))",
        ),
      Boolean,
      "quick composer model picker",
    );
    await click(
      "[...document.querySelectorAll('[role=option]')].find(el => el.textContent.includes('Smoke Alternate Model'))",
    );
    for (const mode of ["terminal", "gui"]) {
      await click(
        `document.querySelector('[data-draft-controls] [role="tab"][data-tab-id="${mode}"]')`,
      );
      await waitForValue(
        () =>
          overlay(
            `document.querySelector('[data-draft-controls] [role="tab"][data-tab-id="${mode}"]')?.getAttribute('aria-selected')`,
          ),
        (selected) => selected === "true",
        `quick composer ${mode} presentation control`,
      );
    }
    await overlay(`${editor}.focus()`);
    await overlayClient.send("Input.insertText", { text: prompt });
    await waitForValue(
      () => overlay(`Boolean(${button("Launch thread")} && !${button("Launch thread")}.disabled)`),
      Boolean,
      "enabled quick composer submission",
    );
    await screenshot(overlayClient, join(outDir, "quick-composer-ready-to-submit.png"));
    await click(button("Launch thread"));
    const handoffs = await waitForValue(
      () => main("window.__quickComposerSmoke.handoffs"),
      (items) => items.length > 0,
      "native quick composer submission reaches main thread creation",
    );
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].projectId, fixture.project.id);
    assert.equal(handoffs[0].prompt, prompt);
    assert.equal(handoffs[0].config.model, "smoke-model-alt");
    assert.equal(handoffs[0].presentationMode, "gui");
    await waitForValue(
      nativeState,
      (state) => state?.visible === false,
      "native overlay hidden after submission",
    );
    await waitForValue(
      () =>
        main(`(() => {
      const state = window.__poracodeDev.stores.app.getState();
        return state.view.kind === 'thread'
        && state.view.panes.includes(window.__quickComposerSmoke.threadId);
    })()`),
      Boolean,
      "main window selects the fixture thread after handoff",
    );
    await screenshot(client, join(outDir, "quick-composer-main-handoff.png"));
    assert.deepEqual(errors, [], "quick composer renderer errors");
    return "native toggle, actual overlay close/reopen, project/model/presentation controls, typing, submit IPC and main fixture thread handoff passed; provider launch was intercepted. Real shortcut/tray invocation, OS dragging, visual motion and real provider execution remain manual coverage";
  } catch (error) {
    const native = await nativeState();
    const mainState = await main(
      "({received:window.__quickComposerSmoke?.nativeSubmissions,handoffs:window.__quickComposerSmoke?.handoffs})",
    );
    const renderer = overlayClient
      ? await overlay(
          `({phase:document.querySelector('.quick-composer-root')?.className,body:document.body.innerText,inert:!!document.querySelector('[inert]')})`,
        )
      : null;
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; native=${JSON.stringify(native)}; main=${JSON.stringify(mainState)}; overlay=${JSON.stringify(renderer)}`,
      { cause: error },
    );
  } finally {
    try {
      if (overlayClient) {
        await overlay(`(() => {
          const s = window.__quickComposerSmoke;
          if (s) {
            window.__poracodeDev.stores.app.setState(s.app);
            window.__poracodeDev.stores.agentStatuses.setState(s.statuses);
            delete window.__quickComposerSmoke;
          }
          return window.poracode.dismissQuickComposer();
        })()`);
      }
    } finally {
      overlayClient?.close();
      await main(`(() => {
      const s = window.__quickComposerSmoke;
      if (!s) return;
      const app = window.__poracodeDev.stores.app;
      s.unsubscribeSubmissions?.();
      app.setState({ createThread: s.app.createThread });
      for (const threadId of s.threadIds ?? []) app.getState().deleteThread(threadId);
      app.setState({ projects: s.app.projects, view: s.app.view });
      window.__poracodeDev.stores.agentStatuses.setState(s.statuses);
      delete window.__quickComposerSmoke;
      })()`);
    }
  }
}
