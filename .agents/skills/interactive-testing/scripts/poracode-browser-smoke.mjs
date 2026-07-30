#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? process.env.PORACODE_CDP_PORT ?? 9222);
const appUrl = args.appUrl ?? "http://127.0.0.1:3100/";
const defaultOutDir = `${homedir()}\\.poracode-smoke\\artifacts\\browser-${Date.now()}`;
const outDir = resolvePath(args.outDir ?? process.env.PORACODE_SMOKE_OUT_DIR ?? defaultOutDir);
const waitMs = Number(args.waitMs ?? 10000);
const commandTimeoutMs = Number(args.commandTimeoutMs ?? 8000);

const results = [];
const findings = [];

await mkdir(outDir, { recursive: true });

const appTarget = await waitForAppTarget();
const app = await connectTarget(appTarget);
let externalTabId = null;
let deviceEmulationEnabled = false;
let findActive = false;

try {
  step("connected to Poracode renderer");
  await send(app, "Page.enable");
  await send(app, "Runtime.enable");
  await installConsoleCollector();

  step("checking boot state");
  const initial = await rendererSnapshot();
  assert(initial.url === appUrl, "App target", `expected ${appUrl}, got ${initial.url}`);
  assert(
    initial.text.includes("Poracode") || initial.text.includes("Poracode"),
    "App boot",
    "renderer body contains the app shell text",
  );

  step("opening Browser panel");
  await clickButton("Open browser", { optional: true });
  await wait(500);
  await screenshot(app, "smoke-browser-01-panel.png");

  step("creating Browser tab");
  const runId = Date.now();
  const firstTitle = `Poracode Browser Smoke ${runId}`;
  const secondTitle = `Poracode Browser Smoke ${runId} 2`;
  const firstUrl = smokeDataUrl(firstTitle, "first page");
  const secondUrl = smokeDataUrl(secondTitle, "second page");

  await callBridge("browserCreateTab", { url: firstUrl, activate: true });
  step("waiting for first browser target");
  await waitForBrowserTarget(firstTitle, firstUrl);
  step("waiting for first browser state");
  let state = await waitForBrowserState(
    (s) => activeTab(s)?.title === firstTitle && activeTab(s)?.loading === false,
    "first smoke page title",
  );
  assert(state.tabs.length > 0, "Create tab", "browser state has at least one tab");
  assert(state.activeTabId !== null, "Active tab", "browser state has an active tab");
  assert(activeTab(state)?.url === firstUrl, "Navigate", "active tab reached first smoke URL");
  const tabId = state.activeTabId;
  externalTabId = tabId;
  await screenshot(app, "smoke-browser-02-tab.png");

  await wait(500);
  step("reading first browser DOM");
  const firstPage = await evaluateBrowserTarget(firstUrl, domSummaryExpression());
  assert(
    firstPage.text.includes("first page"),
    "Embedded page DOM",
    "browser target exposes expected page text",
  );
  await screenshotForTarget(firstUrl, "smoke-browser-03-page.png");

  step("checking toolbar state");
  const toolbar = await evaluate(
    `(() => {
      const input = document.querySelector('input[placeholder="Search or enter address"]');
      return { exists: Boolean(input), disabled: input ? input.disabled : null, value: input ? input.value : null };
    })()`,
  );
  assert(toolbar.exists === true, "Toolbar URL input", "URL input exists");
  assert(
    toolbar.disabled === false,
    "Toolbar URL input enabled",
    "URL input is enabled for active tab",
  );

  step("checking browser history controls");
  await navigate(tabId, secondUrl);
  await waitForBrowserTarget(secondTitle, secondUrl);
  state = await waitForBrowserState(
    (s) => activeTab(s)?.title === secondTitle && activeTab(s)?.loading === false,
    "second smoke page title",
  );
  assert(activeTab(state)?.canGoBack === true, "Back availability", "active tab can go back");

  await callBridge("browserBack", { tabId });
  state = await waitForBrowserState(
    (s) => activeTab(s)?.url === firstUrl && activeTab(s)?.loading === false,
    "back navigation",
  );
  assert(
    activeTab(state)?.canGoForward === true,
    "Forward availability",
    "active tab can go forward",
  );

  await callBridge("browserForward", { tabId });
  state = await waitForBrowserState(
    (s) => activeTab(s)?.url === secondUrl && activeTab(s)?.loading === false,
    "forward navigation",
  );
  assert(
    activeTab(state)?.url === secondUrl,
    "Forward navigation",
    "active tab returned to second URL",
  );
  await screenshot(app, "smoke-browser-04-navigation.png");

  step("checking downloads internal page creation and reuse");
  await callBridge("browserOpenInternalPage", { page: "downloads" });
  state = await waitForBrowserState(
    (s) => activeTab(s)?.internalPage === "downloads",
    "downloads internal tab",
  );
  const downloadsTabId = state.activeTabId;
  const downloadsTabCount = state.tabs.filter((tab) => tab.internalPage === "downloads").length;
  const downloadsPage = await waitForInternalPage(downloadsTabId, "Download history");
  assert(downloadsPage.headingVisible, "Downloads heading", "Download history heading is visible");
  assert(
    downloadsPage.activeTabWebview === false,
    "Downloads guest omission",
    "active downloads tab has no webview",
  );
  await screenshot(app, "smoke-browser-05-downloads.png");

  step("checking passwords internal page creation and reuse");
  await callBridge("browserOpenInternalPage", { page: "passwords" });
  state = await waitForBrowserState(
    (s) => activeTab(s)?.internalPage === "passwords",
    "passwords internal tab",
  );
  const passwordsTabId = state.activeTabId;
  const passwordsTabCount = state.tabs.filter((tab) => tab.internalPage === "passwords").length;
  const passwordsPage = await waitForInternalPage(passwordsTabId, "Manage passwords");
  assert(passwordsPage.headingVisible, "Passwords heading", "Manage passwords heading is visible");
  assert(
    passwordsPage.activeTabWebview === false,
    "Passwords guest omission",
    "active passwords tab has no webview",
  );
  await screenshot(app, "smoke-browser-06-passwords.png");

  await callBridge("browserOpenInternalPage", { page: "downloads" });
  state = await waitForBrowserState(
    (s) => s.activeTabId === downloadsTabId,
    "reused downloads internal tab",
  );
  assert(
    state.tabs.filter((tab) => tab.internalPage === "downloads").length === downloadsTabCount,
    "Reuse downloads tab",
    "opening downloads again activates the existing internal tab",
  );

  await callBridge("browserOpenInternalPage", { page: "passwords" });
  state = await waitForBrowserState(
    (s) => s.activeTabId === passwordsTabId,
    "reused passwords internal tab",
  );
  assert(
    state.tabs.filter((tab) => tab.internalPage === "passwords").length === passwordsTabCount,
    "Reuse passwords tab",
    "opening passwords again activates the existing internal tab",
  );

  step("checking device emulation state and toolbar");
  await callBridge("browserActivateTab", { tabId });
  await waitForBrowserState((s) => s.activeTabId === tabId, "reactivated external smoke tab");
  const emulation = {
    width: 833,
    height: 970,
    deviceScaleFactor: 1,
    scale: 1,
    mobile: false,
    touch: false,
    preset: "Responsive",
  };
  await callBridge("browserSetDeviceEmulation", { tabId, emulation });
  deviceEmulationEnabled = true;
  state = await waitForBrowserState((s) => {
    const active = activeTab(s);
    return (
      active?.tabId === tabId &&
      active.deviceEmulation?.width === emulation.width &&
      active.deviceEmulation?.height === emulation.height &&
      active.deviceEmulation?.scale === emulation.scale &&
      active.deviceEmulation?.preset === emulation.preset
    );
  }, "device emulation state");
  assert(
    activeTab(state)?.deviceEmulation?.preset === "Responsive",
    "Device emulation state",
    "active external tab exposes Responsive emulation state",
  );
  const deviceToolbar = await waitForDeviceToolbar(tabId, emulation.width, emulation.height);
  assert(
    deviceToolbar.visible,
    "Device toolbar",
    "device controls are visible with the expected dimensions",
  );
  assert(
    deviceToolbar.activeTabWebview,
    "Emulated guest preserved",
    "active external tab keeps its webview while emulated",
  );
  await screenshot(app, "smoke-browser-07-device-toolbar.png");

  await callBridge("browserSetDeviceEmulation", { tabId, emulation: null });
  deviceEmulationEnabled = false;
  state = await waitForBrowserState(
    (s) => s.activeTabId === tabId && activeTab(s)?.deviceEmulation === undefined,
    "cleared device emulation state",
  );
  assert(
    activeTab(state)?.deviceEmulation === undefined,
    "Clear device emulation",
    "active external tab returns to its normal viewport",
  );
  const toolbarCleared = await evaluate(
    `document.querySelector('[data-poracode-browser] [aria-label="Close device toolbar"]') === null`,
  );
  assert(toolbarCleared, "Hide device toolbar", "device controls disappear after clearing state");

  step("checking Find in page against the generated data page");
  await openFindBar();
  findActive = true;
  await setFindQuery("second page");
  const findResult = await waitForFindResult("1 of 1");
  assert(findResult.visible, "Find in page", "find bar reports one match in the data page");
  await screenshot(app, "smoke-browser-08-find.png");
  await clickButton("Close find");
  findActive = false;
  await waitFor(async () => {
    const closed = await evaluate(
      `document.querySelector('input[placeholder="Find in page"]') === null`,
    );
    return closed ? true : null;
  }, "closed browser find bar");

  step("checking Browser settings");
  let settingsOpened = await settingsOverlayVisible();
  if (!settingsOpened.ok) {
    settingsOpened = await clickButton("Settings", { optional: true });
    if (!settingsOpened.ok) {
      settingsOpened = await clickText("Settings", { optional: true });
    }
    if (settingsOpened.ok) {
      await waitForSettingsOverlay();
    }
  }
  if (settingsOpened.ok) {
    await clickSettingsSidebarItem("Browser", { optional: true });
    const settingsText = await waitForBrowserSettingsPage({
      optional: true,
    });
    if (settingsText.ok) {
      assert(true, "Browser settings", "Browser settings page is reachable");
      await screenshot(app, "smoke-browser-09-settings.png");
    } else {
      findings.push("Settings opened, but Browser settings page was not reachable by text click.");
    }
  } else {
    findings.push("Settings button was not found, so Browser settings was not exercised.");
  }

  const errors = await collectedErrors();
  assert(
    errors.length === 0,
    "Renderer console errors",
    errors.length === 0 ? "no renderer errors collected" : errors.slice(0, 3).join(" | "),
  );
  if (errors.length > 0) {
    findings.push(`Renderer console errors collected: ${errors.slice(0, 3).join(" | ")}`);
  }

  printReport(errors);
  process.exitCode = results.some((result) => result.status === "FAIL") ? 1 : 0;
} finally {
  if (findActive && externalTabId) {
    try {
      await clickButton("Close find", { optional: true });
      await callBridge("browserStopFindInPage", {
        tabId: externalTabId,
        action: "clearSelection",
      });
    } catch (error) {
      findings.push(`Find cleanup failed: ${error.message}`);
    }
  }
  if (deviceEmulationEnabled && externalTabId) {
    try {
      await callBridge("browserSetDeviceEmulation", {
        tabId: externalTabId,
        emulation: null,
      });
    } catch (error) {
      findings.push(`Device emulation cleanup failed: ${error.message}`);
    }
  }
  app.close();
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function step(message) {
  console.log(`STEP: ${message}`);
}

async function waitForAppTarget() {
  return waitFor(async () => {
    const targets = await listTargets();
    return targets.find((target) => target.type === "page" && target.url === appUrl);
  }, `Poracode page target at ${appUrl}`);
}

async function listTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;

  await new Promise((done, reject) => {
    ws.onopen = done;
    ws.onerror = reject;
  });

  ws.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (!payload.id) return;
    const item = pending.get(payload.id);
    if (!item) return;
    pending.delete(payload.id);
    if (payload.error) {
      item.reject(new Error(`${item.method} failed: ${JSON.stringify(payload.error)}`));
    } else {
      item.resolve(payload.result);
    }
  });

  return {
    send(method, params = {}) {
      id += 1;
      const requestId = id;
      ws.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((done, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP command timed out after ${commandTimeoutMs}ms: ${method}`));
        }, commandTimeoutMs);
        pending.set(requestId, {
          method,
          resolve(value) {
            clearTimeout(timeout);
            done(value);
          },
          reject(error) {
            clearTimeout(timeout);
            reject(error);
          },
        });
      });
    },
    close() {
      ws.close();
    },
  };
}

function send(client, method, params = {}) {
  return client.send(method, params);
}

async function evaluate(expression, options = {}) {
  const result = await send(app, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: options.awaitPromise === true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
  }
  return result.result.value;
}

async function installConsoleCollector() {
  await evaluate(
    `(() => {
      if (window.__smokeErrors) return "already-installed";
      window.__smokeErrors = [];
      const originalError = console.error.bind(console);
      console.error = (...args) => {
        window.__smokeErrors.push(args.map(String).join(" "));
        originalError(...args);
      };
      window.addEventListener("error", (event) => {
        window.__smokeErrors.push("window.error: " + event.message);
      });
      window.addEventListener("unhandledrejection", (event) => {
        window.__smokeErrors.push("unhandledrejection: " + String(event.reason));
      });
      return "installed";
    })()`,
  );
}

async function collectedErrors() {
  return evaluate(`window.__smokeErrors ?? []`);
}

async function rendererSnapshot() {
  return evaluate(
    `(() => ({
      url: location.href,
      text: document.body.innerText,
      buttons: [...document.querySelectorAll("button")].map((button) => ({
        label: button.getAttribute("aria-label") || button.title || button.textContent?.trim() || "",
        disabled: button.disabled || button.getAttribute("aria-disabled") === "true",
      })),
    }))()`,
  );
}

async function clickButton(label, options = {}) {
  const clicked = await evaluate(
    `(() => {
      const label = ${JSON.stringify(label)};
      const buttons = [...document.querySelectorAll("button")];
      const button = buttons.find((candidate) => {
        const text = candidate.getAttribute("aria-label") || candidate.title || candidate.textContent?.trim() || "";
        return text === label;
      });
      if (!button) {
        return { ok: false, available: buttons.map((candidate) => candidate.getAttribute("aria-label") || candidate.title || candidate.textContent?.trim() || "") };
      }
      if (button.disabled || button.getAttribute("aria-disabled") === "true") {
        return { ok: false, disabled: true };
      }
      button.click();
      return { ok: true };
    })()`,
  );
  if (!clicked.ok && options.optional !== true) {
    throw new Error(`Button "${label}" was not clickable: ${JSON.stringify(clicked)}`);
  }
  return clicked;
}

async function clickText(text, options = {}) {
  const clicked = await evaluate(
    `(() => {
      const text = ${JSON.stringify(text)};
      const candidates = [...document.querySelectorAll("button,[role=button],a")];
      const element = candidates.find((candidate) => candidate.textContent?.trim() === text || candidate.getAttribute("aria-label") === text);
      if (!element) return { ok: false };
      element.click();
      return { ok: true };
    })()`,
  );
  if (!clicked.ok && options.optional !== true) {
    throw new Error(`Text "${text}" was not clickable`);
  }
  return clicked;
}

async function clickSettingsSidebarItem(text, options = {}) {
  const clicked = await evaluate(
    `(() => {
      const text = ${JSON.stringify(text)};
      const candidates = [...document.querySelectorAll('[role="button"]')].filter((candidate) => candidate.textContent?.trim() === text);
      const element = candidates.find((candidate) => String(candidate.className).includes("group relative")) ?? candidates.at(-1);
      if (!element) return { ok: false };
      element.click();
      return { ok: true };
    })()`,
  );
  if (!clicked.ok && options.optional !== true) {
    throw new Error(`Settings item "${text}" was not clickable`);
  }
  return clicked;
}

async function settingsOverlayVisible() {
  return evaluate(
    `(() => {
      const labels = [...document.querySelectorAll("button,[role=button],a")]
        .map((candidate) => candidate.getAttribute("aria-label") || candidate.title || candidate.textContent?.trim() || "");
      return {
        ok: labels.includes("General") && labels.includes("Agents") && labels.includes("Browser"),
      };
    })()`,
  );
}

async function waitForSettingsOverlay() {
  await waitFor(async () => {
    const state = await settingsOverlayVisible();
    return state.ok ? state : null;
  }, "settings overlay");
}

async function waitForBrowserSettingsPage(options = {}) {
  try {
    await waitFor(async () => {
      return evaluate(
        `(() => {
          const openLinksControl = document.querySelector('button[aria-label="Open links in"]');
          const showOpenedLinksControl = document.querySelector('button[aria-label="Show opened links in"]');
          return openLinksControl && showOpenedLinksControl ? { ok: true } : null;
        })()`,
      );
    }, "Browser settings page");
    return { ok: true };
  } catch (error) {
    if (options.optional === true) return { ok: false, error: error.message };
    throw error;
  }
}

async function browserState() {
  const json = await evaluate(
    `(async () => JSON.stringify(await window.poracode.browserGetState()))()`,
    { awaitPromise: true },
  );
  return JSON.parse(json);
}

async function waitForBrowserState(predicate, label) {
  return waitFor(async () => {
    const state = await browserState();
    return predicate(state) ? state : null;
  }, label);
}

function activeTab(state) {
  return state.tabs.find((tab) => tab.tabId === state.activeTabId);
}

async function waitForInternalPage(tabId, heading) {
  return waitFor(async () => {
    const snapshot = await evaluate(
      `(() => {
        const root = document.querySelector('[data-poracode-browser]');
        const tabId = ${JSON.stringify(tabId)};
        const headingText = ${JSON.stringify(heading)};
        const heading = [...(root?.querySelectorAll('h1') ?? [])].find(
          (candidate) => candidate.textContent?.trim() === headingText,
        );
        return {
          headingVisible: Boolean(heading && heading.getClientRects().length > 0),
          activeTabWebview: Boolean(root?.querySelector('webview[data-tab-id="' + CSS.escape(tabId) + '"]')),
        };
      })()`,
    );
    return snapshot.headingVisible ? snapshot : null;
  }, `${heading} internal page`);
}

async function waitForDeviceToolbar(tabId, width, height) {
  return waitFor(async () => {
    const snapshot = await evaluate(
      `(() => {
        const root = document.querySelector('[data-poracode-browser]');
        const widthInput = root?.querySelector('[aria-label="Viewport width"]');
        const heightInput = root?.querySelector('[aria-label="Viewport height"]');
        const close = root?.querySelector('[aria-label="Close device toolbar"]');
        const tabId = ${JSON.stringify(tabId)};
        return {
          visible: Boolean(close && close.getClientRects().length > 0) &&
            widthInput?.value === ${JSON.stringify(String(width))} &&
            heightInput?.value === ${JSON.stringify(String(height))},
          activeTabWebview: Boolean(root?.querySelector('webview[data-tab-id="' + CSS.escape(tabId) + '"]')),
        };
      })()`,
    );
    return snapshot.visible ? snapshot : null;
  }, "device toolbar dimensions");
}

async function openFindBar() {
  await clickButton("Browser menu");
  await waitFor(async () => {
    const clicked = await evaluate(
      `(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find((candidate) =>
          candidate.querySelector('label')?.textContent?.trim() === "Find in page"
        );
        if (!item || item.getAttribute('aria-disabled') === 'true') return false;
        item.click();
        return true;
      })()`,
    );
    return clicked ? true : null;
  }, "Find in page menu item");
  await waitFor(async () => {
    const visible = await evaluate(
      `Boolean(document.querySelector('input[placeholder="Find in page"]'))`,
    );
    return visible ? true : null;
  }, "browser find bar");
}

async function setFindQuery(query) {
  const focused = await evaluate(
    `(() => {
      const input = document.querySelector('input[placeholder="Find in page"]');
      if (!input) return false;
      input.focus();
      input.select();
      return true;
    })()`,
  );
  if (!focused) throw new Error("Browser find input was not available");
  await send(app, "Input.insertText", { text: query });
  await waitFor(async () => {
    const value = await evaluate(
      `document.querySelector('input[placeholder="Find in page"]')?.value ?? null`,
    );
    return value === query ? true : null;
  }, "browser find query input");
}

async function waitForFindResult(counter) {
  return waitFor(async () => {
    const snapshot = await evaluate(
      `(() => {
        const input = document.querySelector('input[placeholder="Find in page"]');
        const search = input?.closest('[role="search"]');
        return {
          visible: Boolean(search && search.getClientRects().length > 0),
          text: search?.textContent ?? '',
        };
      })()`,
    );
    return snapshot.visible && snapshot.text.includes(counter) ? snapshot : null;
  }, `browser find result ${counter}`);
}

async function callBridge(method, payload) {
  const result = await evaluate(
    `(() => {
      window.__smokeBridgeErrors ??= [];
      return window.poracode[${JSON.stringify(method)}](${JSON.stringify(payload)}).then(
        () => ({ ok: true }),
        (error) => {
          window.__smokeBridgeErrors.push(String(error));
          return { ok: false, error: String(error) };
        },
      );
    })()`,
    { awaitPromise: true },
  );
  if (!result.ok) {
    throw new Error(`Bridge call ${method} failed: ${result.error}`);
  }
  return result;
}

async function navigate(tabId, url) {
  await callBridge("browserNavigate", { tabId, url });
}

async function waitForBrowserTarget(title, url) {
  return waitFor(async () => {
    const targets = await listTargets();
    return targets.find(
      (target) => isBrowserContentTarget(target) && target.title === title && target.url === url,
    );
  }, `browser page target ${title}`);
}

async function evaluateBrowserTarget(url, expression) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const target = await waitFor(
      async () => {
        const targets = await listTargets();
        return targets.find(
          (candidate) => isBrowserContentTarget(candidate) && candidate.url === url,
        );
      },
      `browser target ${url.slice(0, 48)}`,
    );
    const client = await connectTarget(target);
    try {
      const result = await send(client, "Runtime.evaluate", {
        expression,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text ?? "Browser target evaluate failed");
      }
      return result.result.value;
    } catch (error) {
      lastError = error;
      await wait(500);
    } finally {
      client.close();
    }
  }
  throw lastError;
}

async function screenshotForTarget(url, filename) {
  let client;
  try {
    const target = await waitFor(async () => {
      const targets = await listTargets();
      return targets.find(
        (candidate) => isBrowserContentTarget(candidate) && candidate.url === url,
      );
    }, `screenshot target ${filename}`);
    client = await connectTarget(target);
    await send(client, "Page.enable");
    await screenshot(client, filename);
  } catch (error) {
    findings.push(`Screenshot failed for ${filename}: ${error.message}`);
  } finally {
    client?.close();
  }
}

function domSummaryExpression() {
  return `(() => ({
    title: document.title,
    text: document.body.innerText,
    buttons: [...document.querySelectorAll("button")].map((button) => button.textContent?.trim() || "")
  }))()`;
}

async function screenshot(client, filename) {
  try {
    const result = await send(client, "Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    const path = resolvePath(outDir, filename);
    await writeFile(path, Buffer.from(result.data, "base64"));
    results.push({ status: "INFO", label: "Screenshot", detail: path });
  } catch (error) {
    findings.push(`Screenshot failed for ${filename}: ${error.message}`);
  }
}

function smokeDataUrl(title, body) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p><button>Smoke Button</button></main></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function isBrowserContentTarget(target) {
  return target.type === "page" || target.type === "webview";
}

async function waitFor(fn, label) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < waitMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function wait(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

function assert(condition, label, detail) {
  results.push({ status: condition ? "PASS" : "FAIL", label, detail });
}

function printReport(errors) {
  console.log("Poracode Browser Panel Smoke");
  for (const result of results) {
    console.log(`${result.status}: ${result.label} - ${result.detail}`);
  }
  console.log(`Console errors: ${errors.length}`);
  for (const finding of findings) {
    console.log(`FINDING: ${finding}`);
  }
}
