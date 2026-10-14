import assert from "node:assert/strict";
import { join } from "node:path";

/** Native panel/window transfer regression; real provider delivery is a separate gate. */
export async function mockSideChatGate({
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
  let sideClient;
  const side = (expression) => evaluate(sideClient, expression, true);
  const originalView = await main("window.__poracodeDev.stores.app.getState().view");
  let before;
  let originalStatuses;
  const bootstrap = {
    source: {
      id: "side-chat-smoke-parent",
      projectId: fixture.project.id,
      agentKind: "codex",
      config: { model: "smoke-model" },
      title: "Side chat smoke source",
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    context: {
      summary: "User: context marker smoke-side-42",
      sourceProvider: "codex",
      sourceSessionId: "parent-session",
      extractedAt: new Date().toISOString(),
      contentKind: "transcript",
    },
    title: "Side chat smoke",
    prompt: "",
    autoStart: false,
  };
  async function assertHeader(read, toolbarSelector) {
    const header = await read(`(() => {
      const toolbar = document.querySelector(${JSON.stringify(toolbarSelector)});
      const titleRow = document.querySelector('.poracode-side-chat-title');
      return {
        model: toolbar.textContent,
        title: titleRow.textContent,
        height: getComputedStyle(titleRow).height,
        border: getComputedStyle(titleRow).borderBottomWidth,
        toolbarBottom: toolbar.getBoundingClientRect().bottom,
        titleTop: titleRow.getBoundingClientRect().top,
      };
    })()`);
    assert.match(header.model, /smoke[- ]model/iu);
    assert.equal(header.title, bootstrap.title);
    assert.equal(header.height, "24px");
    assert.equal(header.border, "1px");
    assert.equal(header.titleTop, header.toolbarBottom);
  }
  try {
    originalStatuses = await main("window.__poracodeDev.stores.agentStatuses.getState()");
    await main(`(() => {
      const capabilities = {
        models: [{ id: 'smoke-model', label: 'Smoke Model' }, { id: 'smoke-model-alt', label: 'Smoke Model Alternate' }],
        efforts: [], modelEfforts: {}, modes: ['agent'], approvalPolicies: [], sandboxModes: [],
        supportsResume: true, supportsDirectInput: true, liveInputMode: 'server',
        presentationMode: 'gui', presentationModes: ['gui'],
      };
      window.__poracodeDev.stores.agentStatuses.getState().hydrateFromCache({ windows: [
        { kind: 'codex', label: 'Smoke Agent', installed: true, authState: 'authenticated', capabilities },
        { kind: 'smoke-gui', label: 'Other Smoke Agent', installed: true, authState: 'authenticated', capabilities },
      ], wsl: [] });
    })()`);
    await main(`(() => {
      const store = window.__poracodeDev.stores.app.getState();
      store.createThread({
        threadId: ${JSON.stringify(bootstrap.source.id)},
        projectId: ${JSON.stringify(fixture.project.id)},
        agentKind: ${JSON.stringify(bootstrap.source.agentKind)},
        config: ${JSON.stringify(bootstrap.source.config)},
        title: ${JSON.stringify(bootstrap.source.title)},
        prompt: '', presentationMode: 'gui', focus: true, suppressHostCreateIntent: true,
      });
    })()`);
    await main(`window.poracode.dbUpsertThread(${JSON.stringify(bootstrap.source)})`);
    before = await main("JSON.stringify(window.__poracodeDev.stores.app.getState().view)");
    await main(`window.poracode.openSideChatPanel(${JSON.stringify(bootstrap)})`);
    await waitForValue(
      () => main("Boolean(document.querySelector('[data-side-chat-surface=panel] textarea'))"),
      Boolean,
      "default side chat panel composer",
    );
    assert.equal(
      await main(
        "document.activeElement === document.querySelector('[data-side-chat-surface=panel] textarea')",
      ),
      true,
    );
    assert.equal(
      await main(
        "document.querySelector('[data-side-chat-surface=panel]').textContent.includes('smoke-side-42')",
      ),
      false,
    );
    await assertHeader(main, "[data-active-tab=sideChat]");
    assert.equal(
      await main(
        "Boolean(document.querySelector('[data-side-chat-surface=panel] button[aria-label=\"Select model\"]'))",
      ),
      true,
    );
    assert.equal(
      await main(
        "Boolean(document.querySelector('.poracode-thread-composer-section button[aria-label=\"Side chat\"]'))",
      ),
      true,
    );
    const composerSpacing = await main(`(() => {
      const shell = document.querySelector('[data-side-chat-surface=panel] .poracode-composer-shell');
      const parent = shell.closest('.px-3.pb-2');
      return { padding: getComputedStyle(parent).padding, draft: shell.classList.contains('poracode-composer-shell--draft') };
    })()`);
    assert.equal(composerSpacing.padding, "0px 12px 8px");
    assert.equal(composerSpacing.draft, false);
    await main(
      "document.querySelector('[data-side-chat-surface=panel] button[aria-label=\"Select model\"]').click()",
    );
    await waitForValue(
      () =>
        main(`(() => {
      const row = [...document.querySelectorAll('[role=menuitem], [role=option]')].find(node => node.textContent.includes('Smoke Model Alternate'));
      if (!row) return false;
      row.click();
      return true;
    })()`),
      Boolean,
      "side chat model selection",
    );
    await waitForValue(
      () =>
        main(
          "document.querySelector('[data-active-tab=sideChat]')?.textContent.includes('Smoke Model Alternate')",
        ),
      Boolean,
      "selected side model in panel header",
    );
    await main("document.querySelector('[data-side-chat-surface=panel] textarea').focus()");
    await client.send("Input.insertText", { text: "Unsent side question" });
    await screenshot(client, join(outDir, "mock-side-chat-panel.png"));
    await main("document.querySelector('button[title=\"Hide panel\"]').click()");
    await waitForValue(
      () => main('Boolean(document.querySelector("[data-side-chat-surface=panel]"))'),
      (value) => value === false,
      "side chat hidden without closing its conversation",
    );
    await waitForValue(
      () => main("window.poracode.getSideChatWindowInfo().then(info => info?.prompt)"),
      (value) => value === "Unsent side question",
      "hidden side chat draft checkpoint",
    );
    const retainedId = (await main("window.poracode.getSideChatWindowInfo()")).id;
    await waitForValue(
      () =>
        main(`(() => {
        const button = [...document.querySelectorAll('button[aria-label="Add attachment or capability"]')]
          .find(node => !node.closest('[aria-hidden="true"]'));
        if (!button) return false;
        button.click();
        return true;
      })()`),
      Boolean,
      "parent composer add menu",
    );
    await waitForValue(
      () =>
        main(`(() => {
        const item = document.querySelector('[role="menuitem"][data-key="side-chat"]');
        if (!item) return false;
        item.click();
        return true;
      })()`),
      Boolean,
      "side chat menu action",
    );
    await waitForValue(
      () => main('document.querySelector("[data-side-chat-surface=panel] textarea")?.value'),
      (value) => value === "Unsent side question",
      "hidden side chat draft restored",
    );
    assert.equal((await main("window.poracode.getSideChatWindowInfo()")).id, retainedId);
    await main("document.querySelector('button[aria-label=\"Detach side chat\"]').click()");
    sideClient = await connectTarget(await waitForTarget("sideChat"));
    await sideClient.send("Runtime.enable");
    await sideClient.send("Page.enable");
    await waitForValue(
      () => side("document.querySelector('textarea')?.value"),
      (value) => value === "Unsent side question",
      "detached side chat preserved unsent draft",
    );
    await assertHeader(side, "[data-side-chat-surface=window] .poracode-overlay-header");
    assert.equal(
      await main(
        "Boolean(document.querySelector('.poracode-thread-composer-section button[aria-label=\"Side chat\"]'))",
      ),
      true,
    );
    const info = await side("window.poracode.getSideChatWindowInfo()");
    assert.equal(info.source.id, bootstrap.source.id);
    assert.equal(info.autoStart, false);
    assert.equal(info.selection.config.model, "smoke-model-alt");
    assert.match(info.context.summary, /smoke-side-42/);
    assert.equal(await main("window.poracode.getSideChatWindowInfo()"), null);
    assert.equal(
      await main("JSON.stringify(window.__poracodeDev.stores.app.getState().view)"),
      before,
    );
    assert.deepEqual(await main("window.poracode.getSideChatThreadIds()"), []);
    await screenshot(sideClient, join(outDir, "mock-side-chat-detached.png"));
    await side("window.poracodeHost.reloadRenderer()");
    await waitForValue(
      () => side("document.querySelector('textarea')?.value"),
      (value) => value === "Unsent side question",
      "reloaded side chat draft",
    );
    await side("document.querySelector('button[aria-label=\"Attach side chat\"]').click()");
    sideClient.close();
    sideClient = undefined;
    await waitForValue(
      () => main("document.querySelector('[data-side-chat-surface=panel] textarea')?.value"),
      (value) => value === "Unsent side question",
      "reattached side chat draft",
    );
    assert.equal((await main("window.poracode.getSideChatWindowInfo()")).id, info.id);
    assert.deepEqual(await main("window.poracode.getSideChatThreadIds()"), []);
    await screenshot(client, join(outDir, "mock-side-chat-reattached.png"));
    await main(`(async () => {
      const app = window.__poracodeDev.stores.app;
      const row = app.getState().createThread({ threadId: 'side-chat-smoke-child',
        projectId: ${JSON.stringify(fixture.project.id)}, agentKind: 'codex', config: { model: 'smoke-model-alt' },
        title: 'Disposable smoke child', prompt: '', presentationMode: 'gui', focus: false, suppressHostCreateIntent: true,
        parentThreadId: ${JSON.stringify(bootstrap.source.id)} });
      await window.poracode.dbUpsertThread(row);
      return window.poracode.bindSideChatThread({ id: ${JSON.stringify(retainedId)}, threadId: row.id, thread: row, prompt: '' });
    })()`);
    assert.equal(
      await main(
        "document.querySelector('.poracode-main-sidebar')?.textContent.includes('Disposable smoke child')",
      ),
      false,
    );
    await main(
      "document.querySelector('[data-side-chat-surface=panel] button[aria-label=\"Delete side chat\"]').click()",
    );
    await waitForValue(
      () => main("window.poracode.getSideChatWindowInfo()"),
      (value) => value === null,
      "side chat panel closed",
    );
    await waitForValue(
      () =>
        main(
          "window.poracode.getSideChatThreadIds().then(ids => ids.includes('side-chat-smoke-child'))",
        ),
      (value) => value === false,
      "disposed child no longer owned for launch",
    );
    await waitForValue(
      () =>
        main(
          "window.__poracodeDev.stores.app.getState().threads.some(thread => thread.id === 'side-chat-smoke-child' && !thread.archived)",
        ),
      (value) => value === false,
      "trash disposes child catalog row",
    );
    await waitForValue(
      () =>
        main(`(async () => {
        const { loopback } = await window.__poracodeDev.loadHostDiagnostics();
        const activation = loopback.readManagedLoopbackActivation();
        if (!activation) throw new Error('Side chat fixture requires the managed host');
        const membership = await activation.client.boundedCatalogMembership({ threadIds: ['side-chat-smoke-child'] });
        return membership.existingThreadIds.includes('side-chat-smoke-child');
      })()`),
      (value) => value === false,
      "trash confirms child deletion at its owning host",
    );
    assert.equal(
      await main(
        "Boolean(document.querySelector('.poracode-thread-composer-section button[aria-label=\"Side chat\"]'))",
      ),
      false,
    );
    assert.equal(
      await main("JSON.stringify(window.__poracodeDev.stores.app.getState().view)"),
      before,
    );
    return "side chat opened in the right panel with focus and a shared header, hid inherited context, preserved an unsent draft through detach/reload/attach, and closed without changing the main view or starting a provider";
  } finally {
    if (sideClient) {
      await side("window.close()").catch(() => undefined);
      sideClient.close();
    }
    if (originalStatuses)
      await main(
        `window.__poracodeDev.stores.agentStatuses.setState(${JSON.stringify(originalStatuses)})`,
      );
    await main(`(() => {
      window.__poracodeDev.stores.app.setState({view: ${JSON.stringify(originalView)}});
      window.__poracodeDev.stores.app.getState().deleteThread(${JSON.stringify(bootstrap.source.id)});
    })()`);
  }
}
