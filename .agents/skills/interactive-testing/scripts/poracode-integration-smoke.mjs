#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  areasForFile,
  functionalAreas,
  isProductionFile,
  manualGates,
  productionRoots,
} from "./smoke-scenarios.mjs";
import { inspectCdpWindowTargets } from "./poracode-cdp-target.mjs";
import { resolveDebugConnection } from "./poracode-debug-session.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../../");
const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? "plan";
const scope = String(args.scope ?? "changed");
const mode = String(args.mode ?? "mock");
let port;
let appUrl;
let sessionFile;
const timeoutMs = Number(args.timeoutMs ?? 12_000);
const outDir = resolve(
  String(
    args.outDir ??
      process.env.PORACODE_SMOKE_OUT_DIR ??
      join(homedir(), ".poracode-smoke", `integration-${Date.now()}`),
  ),
);

try {
  if (command === "audit") {
    auditCoverage();
  } else if (command === "plan") {
    printPlan(buildPlan(scope));
  } else if (command === "run") {
    const connection = await resolveDebugConnection({
      session: args.session ?? process.env.PORACODE_DEBUG_SESSION,
      port: args.port ?? process.env.PORACODE_CDP_PORT,
      appUrl: args.appUrl ?? process.env.PORACODE_APP_URL,
      repoRoot,
      allowedPurposes: ["debug", "smoke"],
    });
    if (connection.mode && connection.mode !== mode) {
      throw new Error(
        `managed debug session mode is ${connection.mode}, but this run requested ${mode}; stop it and launch the matching mode`,
      );
    }
    port = connection.port;
    appUrl = connection.appUrl;
    sessionFile = connection.sessionFile;
    await runSmoke(buildPlan(scope));
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function usage() {
  console.error(`Usage:
  node poracode-integration-smoke.mjs audit
  node poracode-integration-smoke.mjs plan [--scope changed|full]
  node poracode-integration-smoke.mjs run [--scope changed|full] [--mode mock|real] [--session <session.json>] [--port <cdp port> --appUrl <dev server url>] [--outDir <dir>] [--ack-manual gate,gate]

Run resolves --session / $PORACODE_DEBUG_SESSION, one active managed debug session for this repo, or a complete explicit port + URL pair. It never guesses ports.`);
}

function trackedFiles() {
  return lines(runGit(["ls-files", ...productionRoots]));
}

function changedFiles() {
  const tracked = lines(runGit(["diff", "--name-only", "HEAD", "--", ...productionRoots]));
  const untracked = lines(
    runGit(["ls-files", "--others", "--exclude-standard", "--", ...productionRoots]),
  );
  return [...new Set([...tracked, ...untracked])].filter(isProductionFile).sort();
}

function runGit(argv) {
  return execFileSync("git", argv, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: process.platform === "win32",
  });
}

function lines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function auditCoverage() {
  const files = trackedFiles().filter(isProductionFile);
  const unmapped = files.filter((file) => areasForFile(file).length === 0);
  console.log(`Coverage audit: ${files.length} production files, ${functionalAreas.length} areas`);
  if (unmapped.length > 0) {
    for (const file of unmapped) console.log(`UNMAPPED: ${file}`);
    throw new Error(`${unmapped.length} production files are missing from the smoke inventory`);
  }
  console.log("PASS: every tracked production file maps to at least one functional area");
}

function buildPlan(selectedScope) {
  if (!new Set(["changed", "full"]).has(selectedScope)) {
    throw new Error(`invalid scope: ${selectedScope}`);
  }
  const files = selectedScope === "changed" ? changedFiles() : [];
  const unmapped = files.filter((file) => areasForFile(file).length === 0);
  if (unmapped.length > 0) {
    throw new Error(`changed production paths are unmapped:\n${unmapped.join("\n")}`);
  }
  const areas =
    selectedScope === "full"
      ? functionalAreas
      : functionalAreas.filter((area) => files.some((file) => areasForFile(file).includes(area)));
  const automated = new Set(["baseline"]);
  const manual = new Set();
  for (const area of areas) {
    for (const scenario of area.automated) automated.add(scenario);
    for (const gate of area.manual) manual.add(gate);
  }
  return {
    scope: selectedScope,
    files,
    areas,
    automated: [...automated].sort(),
    manual: [...manual].sort(),
  };
}

function printPlan(plan) {
  console.log(`Poracode smoke plan (${plan.scope})`);
  console.log(`Execution mode: ${mode}`);
  if (plan.files.length > 0) {
    console.log(`Changed production files: ${plan.files.length}`);
  }
  console.log(
    `Functional areas: ${plan.areas.map((area) => area.id).join(", ") || "baseline only"}`,
  );
  console.log(`Automated scenarios: ${plan.automated.join(", ")}`);
  if (plan.manual.length === 0) {
    console.log(`${mode === "mock" ? "Mock gates" : "Manual gates"}: none`);
  } else {
    console.log(`${mode === "mock" ? "Mock gates" : "Manual gates"}:`);
    for (const gate of plan.manual) console.log(`- ${gate}: ${manualGates[gate]}`);
  }
}

async function runSmoke(plan) {
  if (!new Set(["mock", "real"]).has(mode)) {
    throw new Error(`invalid mode: ${mode}; use mock or real`);
  }
  await mkdir(outDir, { recursive: true });
  printPlan(plan);
  const report = {
    startedAt: new Date().toISOString(),
    scope: plan.scope,
    outDir,
    files: plan.files,
    areas: plan.areas.map((area) => area.id),
    automated: [],
    manual: plan.manual.map((gate) => ({ gate, status: "required", detail: manualGates[gate] })),
    errors: [],
  };

  const target = await waitForTarget();
  const client = await connectTarget(target);
  const runtimeErrors = [];
  client.on("Runtime.exceptionThrown", (event) => {
    runtimeErrors.push(
      event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text,
    );
  });
  client.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error" || event.type === "assert") {
      runtimeErrors.push(event.args?.map((arg) => arg.value ?? arg.description).join(" "));
    }
  });

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await runScenario(report, "welcome-dismissal", () => welcomeDismissalScenario(client));
    await installWindowErrorCollector(client);
    await runScenario(report, "baseline", () => baselineScenario(client));
    if (plan.automated.includes("settings")) {
      await runScenario(report, "settings", () => settingsScenario(client));
      await runScenario(report, "control-geometry", () => controlGeometryScenario(client));
    }
    if (plan.automated.includes("schedules")) {
      await runScenario(report, "schedules", () => schedulesScenario(client));
    }
    if (plan.automated.includes("github-actions")) {
      await runScenario(report, "github-actions", () => githubActionsScenario(client));
    }
    if (plan.automated.includes("thread-search")) {
      await runScenario(report, "thread-search", () => threadSearchScenario(client));
    }
    if (plan.automated.includes("browser")) {
      await runScenario(report, "browser", () => browserScenario(client));
      await evaluate(
        client,
        "window.__poracodeDev.closeSettings(); new Promise((resolve) => setTimeout(resolve, 300))",
        true,
      ).catch(() => undefined);
    }
    if (mode === "mock" && plan.manual.length > 0) {
      await runMockIntegrations(report, client, plan.manual);
    }
    const collected = await evaluate(client, "window.__smokeErrors ?? []");
    report.errors = [...new Set([...runtimeErrors, ...collected].filter(Boolean))];
    if (report.errors.length > 0) {
      report.automated.push({
        id: "console-errors",
        status: "fail",
        detail: report.errors.slice(0, 5),
      });
    }
  } finally {
    await resetDrivenState(client).catch(() => undefined);
    client.close();
  }

  const acknowledged = new Set(
    String(args["ack-manual"] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const item of report.manual) {
    if (mode === "mock") item.status = "mocked";
    else if (acknowledged.has(item.gate)) item.status = "acknowledged";
  }
  report.finishedAt = new Date().toISOString();
  const reportPath = join(outDir, "smoke-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  printReport(report, reportPath);

  const automatedFailed = report.automated.some((item) => item.status === "fail");
  const manualPending = mode === "real" && report.manual.some((item) => item.status === "required");
  if (automatedFailed) process.exitCode = 1;
  else if (manualPending) process.exitCode = 2;
}

async function runScenario(report, id, fn) {
  try {
    const detail = await fn();
    report.automated.push({ id, status: "pass", detail });
    console.log(`PASS: ${id}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    report.automated.push({ id, status: "fail", detail });
    console.log(`FAIL: ${id} - ${detail}`);
  }
}

async function baselineScenario(client) {
  const state = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => ({
          url: location.href,
          title: document.title,
          bodyText: document.body?.innerText ?? "",
          rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
          poracodeBridge: typeof window.poracode,
          devBridge: typeof window.__poracodeDev,
          crash: /renderer crash|rendered more hooks/i.test(document.body?.innerText ?? ""),
          welcomeVisible: Boolean(document.querySelector(".poracode-welcome-page")),
          draftComposer: Boolean(document.querySelector('textarea[placeholder], [contenteditable="true"], [data-composer-input-anchor]')),
          modelPicker: Boolean(document.querySelector('[aria-label="Select model"], [aria-label="Models"]')),
        }))()`,
      ),
    (candidate) =>
      candidate.rootChildren > 0 &&
      candidate.bodyText.trim().length > 0 &&
      candidate.poracodeBridge === "object" &&
      candidate.devBridge === "object",
    "renderer initialization",
  );
  assert(state.url === appUrl, `expected ${appUrl}, got ${state.url}`);
  assert(state.rootChildren > 0 && state.bodyText.trim().length > 0, "renderer root is blank");
  assert(state.poracodeBridge === "object", "typed preload bridge is missing");
  assert(state.devBridge === "object", "DEV testing bridge is missing");
  assert(!state.crash, "renderer crash screen or hook-order failure detected");
  assert(!state.welcomeVisible, "welcome screen still blocks the smoke test surface");
  const screenshotPath = join(outDir, "smoke-01-baseline.png");
  await screenshot(client, screenshotPath);
  return { ...state, screenshotPath };
}

async function welcomeDismissalScenario(client) {
  const initial = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => ({
          devBridge: typeof window.__poracodeDev,
          rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
          bodyTextLength: document.body?.innerText.length ?? 0,
          welcomeVisible: Boolean(document.querySelector(".poracode-welcome-page")),
        }))()`,
      ),
    (state) => state.devBridge === "object" && state.rootChildren > 0 && state.bodyTextLength > 0,
    "welcome dismissal bridge",
  );
  if (!initial.welcomeVisible) {
    return { dismissed: false, detail: "welcome screen was already dismissed" };
  }

  const clicked = await evaluate(
    client,
    `(() => {
      const button = document.querySelector(".poracode-welcome-page button");
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      localStorage.setItem("poracode-welcome-seen-v16", "true");
      return true;
    })()`,
  );
  assert(clicked, "welcome screen primary action was not clickable");
  const final = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => ({
          ready: document.readyState === "complete",
          devBridge: typeof window.__poracodeDev,
          rootChildren: document.querySelector("#root")?.childElementCount ?? 0,
          bodyTextLength: document.body?.innerText.length ?? 0,
          welcomeVisible: Boolean(document.querySelector(".poracode-welcome-page")),
        }))()`,
      ),
    (state) =>
      state.ready &&
      state.devBridge === "object" &&
      state.rootChildren > 0 &&
      state.bodyTextLength > 0 &&
      !state.welcomeVisible,
    "welcome screen dismissal",
  );
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  const stable = await evaluate(
    client,
    `({ welcomeVisible: Boolean(document.querySelector(".poracode-welcome-page")) })`,
  );
  assert(!final.welcomeVisible, "welcome screen remained visible after dismissal");
  assert(!stable.welcomeVisible, "welcome screen returned after dismissal verification");
  await evaluate(
    client,
    `(() => {
      const app = window.__poracodeDev.stores.app.getState();
      const project = app.projects.find((candidate) => candidate.id === "smoke-project");
      if (project) app.openDraft(project.id);
    })()`,
  );
  return { dismissed: true, detail: "welcome screen dismissed through its primary action" };
}

async function settingsScenario(client) {
  const mcpFixture = await startMcpProbeFixture();
  const configuredMcpServers = [
    {
      id: "smoke-mcp-connected",
      name: "smoke-connected",
      description: "Deterministic MCP probe fixture",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "http", url: `${mcpFixture.origin}/mcp`, headers: {} },
    },
    {
      id: "smoke-mcp-auth",
      name: "smoke-auth",
      description: "Deterministic OAuth challenge fixture",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "http", url: `${mcpFixture.origin}/auth`, headers: {} },
    },
  ];
  await evaluate(
    client,
    `window.__poracodeDev.stores.sharedSettings.getState().setMcpServers(${JSON.stringify(configuredMcpServers)})`,
  );
  const sections = [
    "profile",
    "general",
    "audio",
    "appearance",
    "terminal",
    "threads",
    "git",
    "worktrees",
    "notifications",
    "ai",
    "search",
    "shortcuts",
    "remoteAccess",
    "remoteServers",
    "agentsGeneral",
    "skills",
    "mcpServers",
    "browser",
    "usage",
    "archived",
    "changelog",
    "about",
  ];
  let mcpListScreenshotPath;
  let mcpScreenshotPath;
  let mcpImportScreenshotPath;
  let skillsScreenshotPath;
  let skillsImportScreenshotPath;
  let skillsImportDestinationsScreenshotPath;
  let skillsMarketplaceScreenshotPath;
  let skillsTargetsScreenshotPath;
  for (const section of sections) {
    await evaluate(
      client,
      `window.__poracodeDev.openSettings(${JSON.stringify(section)}); new Promise((resolve) => setTimeout(resolve, 200))`,
      true,
    );
    const state = await waitForValue(
      () =>
        evaluate(
          client,
          `(() => ({
            hasContent: Boolean(document.querySelector('[data-settings-scroll-area="true"]')),
            textLength: document.body.innerText.length,
            crash: /renderer crash|rendered more hooks/i.test(document.body.innerText),
          }))()`,
        ),
      (candidate) => candidate.hasContent && candidate.textLength > 0,
      `settings section ${section}`,
    );
    assert(state.hasContent && state.textLength > 0, `settings section ${section} did not render`);
    assert(!state.crash, `settings section ${section} rendered a crash screen`);
    if (section === "skills") {
      await waitForValue(
        () =>
          evaluate(
            client,
            `(() => ({
              hasSearch: Boolean(document.querySelector('[aria-label="Search skills"]')),
              text: document.body.innerText,
            }))()`,
          ),
        (result) => result.hasSearch && (mode === "real" || result.text.includes("smoke-global")),
        "skills settings fixture",
      );
      if (mode === "mock") {
        ({
          skillsImportScreenshotPath,
          skillsImportDestinationsScreenshotPath,
          skillsMarketplaceScreenshotPath,
          skillsTargetsScreenshotPath,
        } = await skillsSectionDeepDive(client));
      }
      skillsScreenshotPath = join(outDir, "smoke-02-skills.png");
      await screenshot(client, skillsScreenshotPath);
    }
    if (section === "mcpServers") {
      if (mode === "mock") {
        ({ mcpListScreenshotPath, mcpScreenshotPath, mcpImportScreenshotPath } =
          await mcpServersSectionDeepDive(client, mcpFixture));
      }
    }
  }
  const screenshotPath = join(outDir, "smoke-02-settings.png");
  await screenshot(client, screenshotPath);
  await evaluate(client, "window.__poracodeDev.closeSettings()");
  await evaluate(client, "window.__poracodeDev.stores.sharedSettings.getState().setMcpServers([])");
  await mcpFixture.close();
  return {
    sections,
    screenshotPath,
    ...(mcpListScreenshotPath ? { mcpListScreenshotPath } : {}),
    ...(mcpScreenshotPath ? { mcpScreenshotPath } : {}),
    ...(mcpImportScreenshotPath ? { mcpImportScreenshotPath } : {}),
    ...(skillsScreenshotPath ? { skillsScreenshotPath } : {}),
    ...(skillsImportScreenshotPath ? { skillsImportScreenshotPath } : {}),
    ...(skillsImportDestinationsScreenshotPath ? { skillsImportDestinationsScreenshotPath } : {}),
    ...(skillsMarketplaceScreenshotPath ? { skillsMarketplaceScreenshotPath } : {}),
    ...(skillsTargetsScreenshotPath ? { skillsTargetsScreenshotPath } : {}),
  };
}

async function skillsSectionDeepDive(client) {
  const toolbarState = await evaluate(
    client,
    `(() => {
      const marketplace = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Marketplace",
      );
      const add = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Add skill",
      );
      return {
        marketplaceTertiary: marketplace?.classList.contains("button--tertiary") ?? false,
        addTertiary: add?.classList.contains("button--tertiary") ?? false,
      };
    })()`,
  );
  assert(toolbarState.marketplaceTertiary, "skills marketplace action is not tertiary");
  assert(toolbarState.addTertiary, "skills add action is not tertiary");
  await evaluate(client, `document.querySelector('[aria-label="Skills location"]')?.click()`);
  await waitForValue(
    () =>
      evaluate(
        client,
        `(() => { const text = document.body.innerText; return text.includes("Global") && text.includes("Projects") && text.includes("project"); })()`,
      ),
    Boolean,
    "skills target menu",
  );
  const skillsTargetsScreenshotPath = join(outDir, "smoke-02-skills-targets.png");
  await screenshot(client, skillsTargetsScreenshotPath);
  await evaluate(
    client,
    `[...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent?.trim().startsWith("Global"))?.click()`,
  );
  const opened = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('button[aria-label="Import external skills"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert(opened, "skills import modal trigger was unavailable");
  await waitForValue(
    () => evaluate(client, `document.body.innerText.includes("Import external agent skills")`),
    Boolean,
    "skills import modal",
  );
  const importDestinationIsGhost = await evaluate(
    client,
    `(() => { const trigger = document.querySelector('button[aria-label="Import destination"]'); return Boolean(trigger?.classList.contains("button--ghost") && trigger.classList.contains("select__trigger")); })()`,
  );
  assert(importDestinationIsGhost, "skills import destination does not match select styling");
  await evaluate(
    client,
    `document.querySelector('button[aria-label="Import destination"]')?.click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `(() => { const text = document.body.innerText; return text.includes("Global") && text.includes("Projects") && text.includes("project"); })()`,
      ),
    Boolean,
    "skills import destination menu",
  );
  const skillsImportDestinationsScreenshotPath = join(
    outDir,
    "smoke-02-skills-import-destinations.png",
  );
  await screenshot(client, skillsImportDestinationsScreenshotPath);
  await evaluate(
    client,
    `[...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent?.trim().startsWith("Global"))?.click()`,
  );
  const expanded = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        candidate.getAttribute("aria-label")?.startsWith("Show skills from "),
      );
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert(expanded, "skills import provider group was unavailable");
  const selected = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => {
          const checkbox = document.querySelector('[aria-label^="Select smoke-global-external from "]');
          if (!(checkbox instanceof HTMLElement)) return false;
          checkbox.click();
          return true;
        })()`,
      ),
    Boolean,
    "skills import candidate",
  );
  assert(selected, "skills import candidate could not be selected");
  await waitForValue(
    () =>
      evaluate(
        client,
        `(() => { const button = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === "Import selected"); return Boolean(button && !button.disabled); })()`,
      ),
    Boolean,
    "skills import selection",
  );
  const skillsImportScreenshotPath = join(outDir, "smoke-02-skills-import.png");
  await screenshot(client, skillsImportScreenshotPath);
  const closed = await evaluate(
    client,
    `(() => {
      const button = document.querySelector('[role="dialog"] button[aria-label="Close"]');
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert(closed, "skills import modal close button was unavailable");
  await waitForValue(
    () =>
      evaluate(
        client,
        `({ modalClosed: !document.body.innerText.includes("Import external agent skills"), settingsOpen: Boolean(document.querySelector('[aria-label="Search skills"]')) })`,
      ),
    (state) => state.modalClosed && state.settingsOpen,
    "skills import modal close",
  );
  const marketplaceOpened = await evaluate(
    client,
    `(() => {
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Marketplace",
      );
      if (!(button instanceof HTMLElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert(marketplaceOpened, "skills marketplace trigger was unavailable");
  await waitForValue(
    () => evaluate(client, `document.body.innerText.includes("Skills marketplace")`),
    Boolean,
    "skills marketplace modal",
  );
  const sourceOpened = await evaluate(
    client,
    `(() => {
      const control = document.querySelector('[aria-label="Skill marketplace source"]');
      if (!(control instanceof HTMLElement)) return false;
      control.click();
      return true;
    })()`,
  );
  assert(sourceOpened, "skills marketplace source selector was unavailable");
  const marketplaceSources = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => {
          const options = [...document.querySelectorAll('[role="option"]')].map(
            (candidate) => candidate.textContent?.trim(),
          );
          return { options, hasSkillsSh: options.includes("Skills.sh"), hasSkillsDirectory: options.includes("Skills Directory") };
        })()`,
      ),
    (result) => result.hasSkillsSh && result.hasSkillsDirectory,
    "skill marketplace source options",
  );
  assert(!marketplaceSources.options.includes("MCP Market"), "MCP Market source is still visible");
  const skillsMarketplaceScreenshotPath = join(outDir, "smoke-02-skills-marketplace.png");
  await screenshot(client, skillsMarketplaceScreenshotPath);
  return {
    skillsImportScreenshotPath,
    skillsImportDestinationsScreenshotPath,
    skillsMarketplaceScreenshotPath,
    skillsTargetsScreenshotPath,
  };
}

// Runs while the settings overlay is showing the mcpServers section: asserts
// probe results against the fixture, round-trips the built-in disable switch,
// and walks the add-server editor. Returns the captured screenshot paths.
async function mcpServersSectionDeepDive(client, mcpFixture) {
  const mcpState = await evaluate(
    client,
    `(() => {
      const browserRow = document.querySelector('[data-built-in-mcp-server="browser"]');
      return {
        builtInsVisible: document.body.innerText.includes("Built-in MCP servers"),
        builtInToolCount: /\\b\\d+ tools?\\b/.test(browserRow?.textContent ?? ""),
        addButton: Boolean([...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Add MCP server")),
        browserSwitch: Boolean(document.querySelector('[role="switch"][aria-label="Disable Browser"]')),
      };
    })()`,
  );
  assert(mcpState.builtInsVisible, "MCP settings did not render built-in servers");
  assert(mcpState.builtInToolCount, "MCP settings did not render built-in tool counts");
  assert(mcpState.addButton, "MCP settings add control is missing");
  assert(mcpState.browserSwitch, "MCP settings built-in disable control is missing");
  try {
    await waitForValue(
      () =>
        evaluate(
          client,
          `(() => ({
            connected: document.body.innerText.includes("Connected"),
            toolCount: document.body.innerText.includes("1 tool"),
            authRequired: document.body.innerText.includes("Authentication required"),
            statuses: [...document.querySelectorAll('[role="status"]')].map((status) => status.textContent?.trim()),
          }))()`,
        ),
      (candidate) => candidate.connected && candidate.toolCount && candidate.authRequired,
      "MCP connection probes",
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; fixture requests: ${JSON.stringify(mcpFixture.requests)}`,
      { cause: error },
    );
  }
  const mcpListScreenshotPath = join(outDir, "smoke-02-mcp-servers-list.png");
  await screenshot(client, mcpListScreenshotPath);

  await evaluate(
    client,
    `document.querySelector('[role="switch"][aria-label="Disable Browser"]').click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `window.__poracodeDev.stores.sharedSettings.getState().disabledBuiltInMcpServers.browser === true`,
      ),
    Boolean,
    "MCP built-in disable persistence",
  );
  await evaluate(
    client,
    `document.querySelector('[role="switch"][aria-label="Enable Browser"]').click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `window.__poracodeDev.stores.sharedSettings.getState().disabledBuiltInMcpServers.browser !== true`,
      ),
    Boolean,
    "MCP built-in re-enable persistence",
  );

  await evaluate(
    client,
    `[...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Add MCP server").click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `({
          editor: document.body.innerText.includes("New MCP server"),
          formTab: Boolean([...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.trim() === "Form")),
        })`,
      ),
    (candidate) => candidate.editor && candidate.formTab,
    "MCP form editor",
  );
  await evaluate(
    client,
    `[...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent?.trim() === "JSON").click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `Boolean(document.querySelector('textarea[aria-label="MCP server JSON configuration"]'))`,
      ),
    Boolean,
    "MCP JSON editor",
  );
  const mcpScreenshotPath = join(outDir, "smoke-02-mcp-servers.png");
  await screenshot(client, mcpScreenshotPath);
  await evaluate(
    client,
    `[...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancel").click()`,
  );

  await evaluate(
    client,
    `document.querySelector('button[aria-label="Import MCP servers"]').click()`,
  );
  await waitForValue(
    () => evaluate(client, `document.body.innerText.includes("Import external agent MCP servers")`),
    Boolean,
    "MCP external import modal",
  );
  await evaluate(
    client,
    `document.querySelector('button[aria-label="MCP server source scope"]').click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `Boolean([...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent?.trim().startsWith("project")))`,
      ),
    Boolean,
    "MCP project source option",
  );
  await evaluate(
    client,
    `[...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent?.trim().startsWith("project")).click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `document.body.innerText.includes("smoke_external") || Boolean(document.querySelector('button[aria-label="Show MCP servers from .mcp.json"]'))`,
      ),
    Boolean,
    "MCP project source discovery",
  );
  await evaluate(
    client,
    `document.querySelector('button[aria-label="Show MCP servers from .mcp.json"]')?.click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `Boolean(document.querySelector('[aria-label="Select smoke_external from .mcp.json"]'))`,
      ),
    Boolean,
    "MCP project candidate",
  );
  const mcpImportScreenshotPath = join(outDir, "smoke-02-mcp-import.png");
  await screenshot(client, mcpImportScreenshotPath);
  const candidateCheckbox = await evaluate(
    client,
    `(() => {
      const checkbox = document.querySelector('[aria-label="Select smoke_external from .mcp.json"]');
      const control = checkbox
        ?.closest('[data-slot="checkbox"]')
        ?.querySelector('[data-slot="checkbox-control"]');
      if (!control) return null;
      const rect = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return { width: rect.width, height: rect.height, borderWidth: parseFloat(style.borderLeftWidth) };
    })()`,
  );
  assert(
    candidateCheckbox?.width >= 14 &&
      candidateCheckbox.height >= 14 &&
      candidateCheckbox.borderWidth >= 1,
    `MCP import checkbox is not visibly styled: ${JSON.stringify(candidateCheckbox)}`,
  );
  await evaluate(
    client,
    `document.querySelector('[aria-label="Select smoke_external from .mcp.json"]').click()`,
  );
  await evaluate(
    client,
    `document.querySelector('button[aria-label="Choose import destination"]').click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `Boolean([...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent?.trim().startsWith("project")))`,
      ),
    Boolean,
    "MCP project import destination",
  );
  await evaluate(
    client,
    `[...document.querySelectorAll('[role="menuitemradio"]')].find((item) => item.textContent?.trim().startsWith("project")).click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `(() => { const button = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Import to project"); return Boolean(button && !button.disabled); })()`,
      ),
    Boolean,
    "MCP project import selection",
  );
  await evaluate(
    client,
    `[...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Import to project").click()`,
  );
  await waitForValue(
    () =>
      evaluate(
        client,
        `document.body.innerText.includes("smoke_external") && document.body.innerText.includes("Workspace")`,
      ),
    Boolean,
    "MCP project import persistence",
  );
  await evaluate(
    client,
    `document.querySelector('button[aria-label="Delete smoke_external"]')?.click()`,
  );
  return { mcpListScreenshotPath, mcpScreenshotPath, mcpImportScreenshotPath };
}

async function startMcpProbeFixture() {
  let origin = "";
  const requests = [];
  const server = createServer((request, response) => {
    void (async () => {
      const receivedAt = Date.now();
      if (request.url === "/auth") {
        requests.push({ receivedAt, method: request.method, path: request.url });
        response.writeHead(401, {
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        });
        response.end();
        return;
      }

      let body = "";
      request.setEncoding("utf8");
      for await (const chunk of request) body += chunk;
      requests.push({ receivedAt, method: request.method, path: request.url, body });

      let message;
      try {
        message = JSON.parse(body);
      } catch {
        response.writeHead(400).end();
        return;
      }

      if (message.method === "notifications/initialized") {
        response.writeHead(202).end();
        return;
      }

      let result;
      if (message.method === "initialize") {
        result = {
          protocolVersion: "2025-11-25",
          capabilities: { tools: {} },
          serverInfo: { name: "poracode-smoke-mcp", version: "1.0.0" },
        };
      } else if (message.method === "tools/list") {
        result = {
          tools: [
            {
              name: "smoke_read",
              description: "Read-only smoke fixture tool",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        };
      } else {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  server.unref();
  const address = server.address();
  assert(address && typeof address !== "string", "MCP probe fixture did not bind a TCP port");
  origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    requests,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

async function schedulesScenario(client) {
  const name = `Smoke schedule ${Date.now()}`;
  const input = {
    name,
    prompt: "Deterministic future smoke task. Do not run yet.",
    agentKind: "codex",
    config: { model: "smoke-model", effort: "medium" },
    recurrence: {
      kind: "once",
      runAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    enabled: true,
  };
  let created;
  try {
    created = await bridgeInvoke(client, "createSchedule", input);
    assert(created?.id, "schedule create IPC returned no id");
    assert(created.name === name, "created schedule did not preserve its name");
    assert(!("projectId" in created), "device schedule unexpectedly carries a project id");

    const opened = await evaluate(
      client,
      `(() => {
        const button = [...document.querySelectorAll('button, [role="button"]')].find(
          (candidate) => candidate.getAttribute("aria-label") === "Schedules" || candidate.textContent?.trim() === "Schedules",
        );
        if (!(button instanceof HTMLElement)) return false;
        button.click();
        return true;
      })()`,
    );
    assert(opened, "Schedules was not available in the main sidebar");
    const rendered = await waitForValue(
      () =>
        evaluate(
          client,
          `(() => ({
            text: document.body.innerText,
            viewKind: window.__poracodeDev.stores.app.getState().view.kind,
            settingsOpen: window.__poracodeDev.stores.panel.getState().settingsOpen,
            runNow: Boolean(document.querySelector('[aria-label="Run now"]')),
            pause: Boolean(document.querySelector('[aria-label="Pause"]')),
          }))()`,
        ),
      (state) =>
        state.viewKind === "schedules" &&
        !state.settingsOpen &&
        state.text.includes(name) &&
        state.runNow &&
        state.pause,
      "scheduled task row",
    );
    assert(rendered.text.includes(name), "created schedule did not render in the main view");

    const paused = await bridgeInvoke(client, "updateSchedule", {
      id: created.id,
      task: { ...input, enabled: false },
    });
    assert(paused.enabled === false, "schedule pause did not persist");
    const listed = await bridgeInvoke(client, "getSchedules");
    assert(
      listed.some((task) => task.id === created.id && task.enabled === false),
      "paused schedule was not returned by the database IPC",
    );

    const screenshotPath = join(outDir, "smoke-02b-schedules.png");
    await screenshot(client, screenshotPath);
    return { scheduleId: created.id, screenshotPath };
  } finally {
    if (created?.id) await bridgeInvoke(client, "deleteSchedule", { id: created.id });
  }
}

async function githubActionsScenario(client) {
  await evaluate(
    client,
    `window.__poracodeDev.openSettings("general"); new Promise((resolve) => setTimeout(resolve, 250))`,
    true,
  );
  const settingsState = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => {
          const settings = window.__poracodeDev.stores.sharedSettings.getState();
          const toggle = [...document.querySelectorAll('[role="option"]')].find(
            (element) => element.textContent?.includes("GitHub Actions"),
          );
          if (!toggle) {
            document.querySelector('button[aria-label="Sidebar shortcuts"]')?.click();
          }
          return {
            hiddenByDefault: settings.sidebarHiddenShortcuts.includes("githubActions"),
            toggleVisible: toggle instanceof HTMLElement,
            toggleSelected: toggle?.getAttribute("aria-selected") === "true",
          };
        })()`,
      ),
    (state) => state.hiddenByDefault && state.toggleVisible,
    "GitHub Actions shortcut setting",
  );
  assert(!settingsState.toggleSelected, "GitHub Actions shortcut should be off by default");

  const opened = await evaluate(
    client,
    `(() => {
      window.__poracodeDev.closeSettings();
      const app = window.__poracodeDev.stores.app.getState();
      const project = app.projects.find((candidate) => !candidate.disabled);
      if (!project) return false;
      app.openGitHubActions(project.id);
      return true;
    })()`,
  );
  assert(opened, "isolated fixture project was not available for GitHub Actions");
  await evaluate(client, "new Promise((resolve) => setTimeout(resolve, 300))", true);
  const actionsState = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => ({
          overlayOpen:
            window.__poracodeDev.stores.panel.getState().githubActionsContext !== null,
          heading: [...document.querySelectorAll("[data-overlay-surface]")].some(
            (element) => element.textContent?.includes("GitHub Actions"),
          ),
          projectPicker: Boolean(document.querySelector('[aria-label="Project"]')),
          crash: /renderer crash|rendered more hooks/i.test(document.body?.innerText ?? ""),
        }))()`,
      ),
    (state) => state.overlayOpen && state.heading && state.projectPicker,
    "GitHub Actions overlay",
  );
  assert(!actionsState.crash, "GitHub Actions view rendered a crash state");
  const screenshotPath = join(outDir, "smoke-02c-github-actions.png");
  await screenshot(client, screenshotPath);
  return { ...settingsState, ...actionsState, screenshotPath };
}

async function controlGeometryScenario(client) {
  await evaluate(
    client,
    `window.__poracodeDev.openSettings("general"); new Promise((resolve) => setTimeout(resolve, 250))`,
    true,
  );
  const switchGeometry = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => {
          const read = (selector, pseudo) => {
            const element = document.querySelector(selector);
            if (!element) return null;
            const style = getComputedStyle(element, pseudo);
            return {
              radius: Number.parseFloat(style.borderTopLeftRadius),
              height: Number.parseFloat(style.height),
            };
          };
          return {
            control: read(".switch__control"),
            thumb: read(".switch__thumb"),
          };
        })()`,
      ),
    (geometry) => geometry.control !== null && geometry.thumb !== null,
    "switch geometry",
  );
  assert(isPillGeometry(switchGeometry.control), "switch track is not pill-shaped");
  assert(isPillGeometry(switchGeometry.thumb), "switch thumb is not pill-shaped");

  await evaluate(
    client,
    `window.__poracodeDev.openSettings("appearance"); new Promise((resolve) => setTimeout(resolve, 250))`,
    true,
  );
  const sliderGeometry = await evaluate(
    client,
    `(() => {
      const read = (selector, pseudo) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element, pseudo);
        return {
          radius: Number.parseFloat(style.borderTopLeftRadius),
          height: Number.parseFloat(style.height),
        };
      };
      return {
        track: read(".slider__track"),
        fill: read(".slider__fill"),
        thumb: read(".slider__thumb", "::after"),
      };
    })()`,
  );
  if (sliderGeometry.track) {
    assert(isPillGeometry(sliderGeometry.track), "slider track is not pill-shaped");
  }
  if (sliderGeometry.thumb) {
    assert(isPillGeometry(sliderGeometry.thumb), "slider thumb is not pill-shaped");
  }
  if (sliderGeometry.fill) {
    assert(sliderGeometry.fill.radius === 0, "slider fill must not add an extra rounded cap");
  }
  const screenshotPath = join(outDir, "smoke-02-control-geometry.png");
  await screenshot(client, screenshotPath);
  await evaluate(client, "window.__poracodeDev.closeSettings()");
  return {
    switchGeometry,
    sliderGeometry,
    sliderPresent: sliderGeometry.track !== null,
    screenshotPath,
  };
}

function isPillGeometry(geometry) {
  return geometry !== null && geometry.radius >= geometry.height / 2;
}

async function threadSearchScenario(client) {
  await evaluate(
    client,
    `window.__poracodeDev.stores.panel.setState({ threadSearchOpen: true }); new Promise((resolve) => setTimeout(resolve, 80))`,
    true,
  );
  const state = await waitForValue(
    () =>
      evaluate(
        client,
        `(() => ({
          dialog: Boolean(document.querySelector('[role="dialog"]')),
          searchInput: Boolean(document.querySelector('input[placeholder]')),
          crash: /renderer crash|rendered more hooks/i.test(document.body.innerText),
        }))()`,
      ),
    (candidate) => candidate.dialog && candidate.searchInput,
    "thread search overlay",
  );
  assert(state.dialog && state.searchInput, "thread search overlay did not render");
  assert(!state.crash, "thread search rendered a crash screen");
  const screenshotPath = join(outDir, "smoke-03-thread-search.png");
  await screenshot(client, screenshotPath);
  await evaluate(client, "window.__poracodeDev.stores.panel.setState({ threadSearchOpen: false })");
  return { ...state, screenshotPath };
}

async function browserScenario(client) {
  await resetBrowserTabs(client);
  const result = spawnSync(
    process.execPath,
    [
      join(scriptDir, "poracode-browser-smoke.mjs"),
      ...(sessionFile ? ["--session", sessionFile] : ["--port", String(port), "--appUrl", appUrl]),
      "--outDir",
      join(outDir, "browser"),
      "--commandTimeoutMs",
      "20000",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: process.platform === "win32",
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert(result.status === 0, `browser smoke exited ${result.status}`);
  return { outDir: join(outDir, "browser") };
}

async function resetBrowserTabs(client) {
  const state = await bridgeInvoke(client, "browserGetState");
  for (const tab of state?.tabs ?? []) {
    await bridgeInvoke(client, "browserCloseTab", { tabId: tab.tabId });
  }
}

async function runMockIntegrations(report, client, gates) {
  const fixture = await evaluate(
    client,
    `(() => {
      const state = window.__poracodeDev.stores.app.getState();
      const project =
        state.projects.find((candidate) => candidate.id === "smoke-project") ??
        state.projects.find((candidate) => !candidate.disabled);
      return {
        project,
        threadCount: state.threads.length,
        runtimeRequests: state.runtimeRequestsByThread,
        bridgeKeys: Object.keys(window.poracode),
        bodyText: document.body.innerText,
      };
    })()`,
  );
  assert(fixture.project?.location, "isolated fixture project is missing");

  const passed = [];
  for (const gate of gates) {
    try {
      const detail = await runMockGate(client, gate, fixture);
      report.manual.find((item) => item.gate === gate).status = "mocked";
      report.manual.find((item) => item.gate === gate).detail = detail;
      passed.push(gate);
      console.log(`MOCK PASS: ${gate} - ${detail}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      report.automated.push({ id: `mock:${gate}`, status: "fail", detail });
      console.log(`MOCK FAIL: ${gate} - ${detail}`);
    }
  }
  report.automated.push({
    id: "mock-integrations",
    status: passed.length === gates.length ? "pass" : "fail",
    detail: `${passed.length}/${gates.length} deterministic mock gates passed`,
  });
}

async function runMockGate(client, gate, fixture) {
  switch (gate) {
    case "changed-surface":
      return "covered by baseline and diff-selected automated scenarios";
    case "file-editor": {
      const result = await bridgeInvoke(client, "listProjectTree", {
        projectLocation: fixture.project.location,
        directoryPath: "",
      });
      assert(result && Array.isArray(result.entries), "project tree bridge did not return entries");
      return "fixture project tree bridge returned successfully";
    }
    case "git-mutations": {
      const result = await bridgeInvoke(client, "getGitStatus", {
        projectLocation: fixture.project.location,
      });
      assert(result && typeof result === "object", "git status bridge returned no result");
      return "fixture git status round-trip returned successfully";
    }
    case "github-actions-live": {
      for (const key of [
        "ghListWorkflows",
        "ghListWorkflowRuns",
        "ghGetWorkflowDefinition",
        "ghRerunWorkflowRun",
        "ghDeleteWorkflowRun",
      ]) {
        assert(fixture.bridgeKeys.includes(key), `GitHub Actions bridge is missing ${key}`);
      }
      return "GitHub Actions list, definition, rerun, and delete bridge contracts are exposed";
    }
    case "ipc-roundtrip": {
      const projects = await bridgeInvoke(client, "dbGetProjects");
      const settings = await bridgeInvoke(client, "getSharedSettings");
      assert(Array.isArray(projects), "database project IPC returned no array");
      assert(settings && typeof settings === "object", "settings IPC returned no object");
      return "database and settings IPC round-trips returned successfully";
    }
    case "mcp-extension": {
      const statuses = await bridgeInvoke(client, "getAgentStatuses", []);
      const discovery = await bridgeInvoke(client, "discoverExternalMcpServers", {
        sourceScope: "workspace",
        projectLocation: fixture.project.location,
      });
      assert(
        statuses && typeof statuses === "object",
        "agent/MCP discovery bridge returned no result",
      );
      assert(
        discovery && Array.isArray(discovery.groups),
        "external MCP workspace discovery bridge returned no groups",
      );
      assert(fixture.bridgeKeys.includes("browserGetState"), "browser MCP bridge is missing");
      return "mock provider status, external MCP discovery, and browser bridge contracts responded";
    }
    case "skills-manager": {
      const initial = await bridgeInvoke(client, "scanSkills", {
        projectLocation: fixture.project.location,
      });
      const managed = initial.skills.find(
        (skill) =>
          skill.name === "smoke-review" && skill.scope === "project" && skill.origin === "managed",
      );
      const external = initial.skills.find(
        (skill) =>
          skill.name === "smoke-external" &&
          skill.scope === "project" &&
          skill.origin === "external",
      );
      assert(managed?.enabled, "managed fixture skill was not discovered as enabled");
      assert(external?.importState === "available", "external fixture skill is not importable");

      await bridgeInvoke(client, "setSkillEnabled", {
        absolutePath: managed.absolutePath,
        enabled: false,
        projectLocation: fixture.project.location,
      });
      const disabledScan = await bridgeInvoke(client, "scanSkills", {
        projectLocation: fixture.project.location,
      });
      const disabled = disabledScan.skills.find(
        (skill) => skill.name === "smoke-review" && skill.origin === "managed",
      );
      assert(disabled && !disabled.enabled, "managed fixture skill did not disable");
      await bridgeInvoke(client, "setSkillEnabled", {
        absolutePath: disabled.absolutePath,
        enabled: true,
        projectLocation: fixture.project.location,
      });

      const imported = await bridgeInvoke(client, "importSkills", {
        skills: [
          {
            sourcePath: external.absolutePath,
            destinationScope: "project",
            mode: "copy",
            replace: false,
            projectLocation: fixture.project.location,
          },
        ],
      });
      assert(imported.imported.length === 1, "external fixture skill did not import");
      const importedScan = await bridgeInvoke(client, "scanSkills", {
        projectLocation: fixture.project.location,
      });
      const importedExternal = importedScan.skills.find(
        (skill) => skill.name === "smoke-external" && skill.origin === "external",
      );
      assert(importedExternal?.enabled, "imported provider fixture was not enabled");
      await bridgeInvoke(client, "setSkillEnabled", {
        absolutePath: importedExternal.absolutePath,
        enabled: false,
        projectLocation: fixture.project.location,
      });
      const disabledExternalScan = await bridgeInvoke(client, "scanSkills", {
        projectLocation: fixture.project.location,
      });
      const disabledExternal = disabledExternalScan.skills.find(
        (skill) => skill.name === "smoke-external" && skill.origin === "external",
      );
      assert(disabledExternal && !disabledExternal.enabled, "provider fixture did not disable");
      await bridgeInvoke(client, "setSkillEnabled", {
        absolutePath: disabledExternal.absolutePath,
        enabled: true,
        projectLocation: fixture.project.location,
      });
      await bridgeInvoke(client, "deleteSkill", {
        absolutePath: imported.imported[0],
        projectLocation: fixture.project.location,
      });
      const finalScan = await bridgeInvoke(client, "scanSkills", {
        projectLocation: fixture.project.location,
      });
      assert(
        !finalScan.skills.some(
          (skill) => skill.name === "smoke-external" && skill.origin === "managed",
        ),
        "imported fixture skill was not deleted",
      );
      return "managed and provider skill disable/enable, copy import, and delete round-tripped";
    }
    case "provider-skill-delivery": {
      const expected = {
        claude: "slash",
        codex: "dollar",
        gemini: "prompt",
        opencode: "prompt",
        copilot: "slash",
        commandcode: "slash",
        cursor: "slash",
        grok: "slash",
        antigravity: "prompt",
        pi: "skill",
      };
      for (const [agentKind, invocation] of Object.entries(expected)) {
        const result = await bridgeInvoke(client, "scanSkills", {
          projectLocation: fixture.project.location,
          agentKind,
        });
        assert(
          result.invocation === invocation,
          `${agentKind} returned the wrong skill invocation`,
        );
        assert(
          result.skills.some(
            (skill) => skill.name === "smoke-review" && result.effectiveSkillIds.includes(skill.id),
          ),
          `${agentKind} did not receive the managed fixture skill`,
        );
      }
      return "all supported adapters exposed the managed fixture skill with their invocation mode";
    }
    case "native-auth-update": {
      await evaluate(
        client,
        `window.__poracodeDev.setUpdate({ phase: "downloaded", version: "mock-smoke" })`,
      );
      const update = await evaluate(client, "window.__poracodeDev.stores.update.getState()");
      const usageState = await bridgeInvoke(client, "getUsageLoginState", {});
      assert(
        update.phase === "downloaded" && update.version === "mock-smoke",
        "update state mock failed",
      );
      assert(
        usageState && typeof usageState === "object",
        "usage login state bridge returned no result",
      );
      return "update state and usage-auth state were exercised with deterministic mock data";
    }
    case "project-mutations":
      assert(fixture.project.id === "smoke-project", "isolated project fixture is not selected");
      return "isolated seeded project was loaded and selected";
    case "provider-live": {
      const state = await evaluate(
        client,
        `(() => {
          const candidate = {
            kind: "codex",
            label: "Smoke Provider",
            installed: true,
            authState: "authenticated",
            envKind: "posix",
            capabilities: {
              models: [{ id: "smoke-model", label: "Smoke Model" }],
              efforts: ["medium"],
              defaultEffort: "medium",
              modelEfforts: { "smoke-model": ["medium"] },
              modes: ["agent"],
              approvalPolicies: [{ id: "on-request", label: "On Request" }],
              defaultApprovalPolicy: "on-request",
              sandboxModes: [{ id: "workspace-write", label: "Workspace Write" }],
              defaultSandboxMode: "workspace-write",
              supportsResume: true,
              supportsDirectInput: true,
              supportsOneShot: true,
              liveInputMode: "terminal",
              presentationMode: "terminal",
              presentationModes: ["terminal", "gui"],
              settingDefs: [],
            },
          };
          window.__poracodeDev.stores.agentStatuses.getState().hydrateFromCache({
            windows: [candidate],
            wsl: [],
          });
          window.__poracodeDev.stores.app.getState().openDraft(${JSON.stringify(fixture.project.id)});
          return { hydrated: true, kind: candidate.kind };
        })()`,
      );
      assert(state.hydrated, `provider fixture hydration failed: ${state.reason ?? "unknown"}`);
      const controls = await waitForValue(
        () =>
          evaluate(
            client,
            `(() => ({
              selectControls: document.querySelectorAll('[aria-label="Select"]').length,
            }))()`,
          ),
        (candidate) => candidate.selectControls > 0,
        "mock provider controls",
      );
      assert(controls.selectControls > 0, "provider model/approval controls did not render");
      return `provider ${state.kind} was hydrated and selector UI rendered without external credentials`;
    }
    case "remote-client": {
      const pairing = await bridgeInvoke(client, "getRemoteAccessPairing");
      assert(pairing && typeof pairing === "object", "remote pairing bridge returned no result");
      return "remote pairing state bridge returned successfully";
    }
    case "runtime-requests": {
      assert(
        fixture.runtimeRequests && typeof fixture.runtimeRequests === "object",
        "runtime request store missing",
      );
      assert(
        fixture.bridgeKeys.includes("resolveThreadServerRequest"),
        "runtime request IPC is missing",
      );
      return "runtime request store and resolution IPC contract were checked";
    }
    case "terminal-pty":
      assert(fixture.bridgeKeys.includes("startThread"), "thread launch bridge is missing");
      assert(
        /\bCLI\b/i.test(await evaluate(client, "document.body.innerText")),
        "terminal presentation control did not render",
      );
      return "terminal launch contract and entry point were checked without spawning a real provider";
    case "visual-a11y": {
      const result = await evaluate(
        client,
        `(() => ({
          unlabeled: [...document.querySelectorAll("button,input,textarea")].filter((el) => {
            const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.textContent?.trim();
            return !label;
          }).length,
          dark: document.documentElement.classList.contains("dark"),
        }))()`,
      );
      assert(
        result.unlabeled === 0,
        `${result.unlabeled} interactive controls lack an accessible label`,
      );
      assert(result.dark, "dark theme baseline did not render");
      return "interactive labels and dark-theme baseline were checked";
    }
    default:
      return `mock gate acknowledged: ${gate}`;
  }
}

async function bridgeInvoke(client, method, payload) {
  const payloadText = payload === undefined ? "" : JSON.stringify(payload);
  return evaluate(client, `window.poracode[${JSON.stringify(method)}](${payloadText})`, true);
}

async function resetDrivenState(client) {
  await evaluate(client, "window.__poracodeDev?.reset()");
}

async function installWindowErrorCollector(client) {
  await evaluate(
    client,
    `(() => {
      if (window.__smokeErrors) return;
      window.__smokeErrors = [];
      window.addEventListener("error", (event) => window.__smokeErrors.push("window.error: " + event.message));
      window.addEventListener("unhandledrejection", (event) => window.__smokeErrors.push("unhandledrejection: " + String(event.reason)));
    })()`,
  );
}

async function waitForTarget() {
  const started = Date.now();
  let cdpRespondedWithPages = false;
  let lastPageUrls = [];
  while (Date.now() - started < timeoutMs) {
    try {
      const inspection = await inspectCdpWindowTargets({ port, appUrl, windowKind: "main" });
      if (inspection.ready.length === 1) return inspection.ready[0];
      if (inspection.ready.length > 1) {
        throw new Error(
          `multiple ready main targets match ${appUrl}: ${inspection.ready.map((target) => target.id).join(", ")}`,
        );
      }
      if (inspection.candidates.length === 0 && inspection.pageTargets.length > 0) {
        cdpRespondedWithPages = true;
        lastPageUrls = inspection.pageTargets.map((target) => target.url);
      }
    } catch {
      // Electron is still starting.
    }
    // Once CDP serves page targets that don't match, the URL won't change.
    if (cdpRespondedWithPages) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  if (cdpRespondedWithPages) {
    throw new Error(
      `no Poracode CDP target matching ${appUrl} on port ${port}. ` +
        `Available page targets: ${lastPageUrls.join(", ")}. ` +
        `Check PORACODE_APP_URL / port allocation.`,
    );
  }
  throw new Error(`no Poracode CDP target at ${appUrl} on port ${port}`);
}

async function connectTarget(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let id = 0;
  await new Promise((resolveOpen, reject) => {
    ws.onopen = resolveOpen;
    ws.onerror = () => reject(new Error("failed to connect to the Electron CDP target"));
  });
  ws.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id) {
      const request = pending.get(payload.id);
      if (!request) return;
      pending.delete(payload.id);
      clearTimeout(request.timeout);
      if (payload.error) request.reject(new Error(JSON.stringify(payload.error)));
      else request.resolve(payload.result);
      return;
    }
    for (const listener of listeners.get(payload.method) ?? []) listener(payload.params ?? {});
  });
  return {
    on(method, listener) {
      const current = listeners.get(method) ?? [];
      current.push(listener);
      listeners.set(method, current);
    },
    send(method, params = {}) {
      id += 1;
      const requestId = id;
      ws.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((resolveRequest, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`CDP timeout: ${method}`));
        }, timeoutMs);
        pending.set(requestId, { resolve: resolveRequest, reject, timeout });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function screenshot(client, path) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function waitForValue(read, predicate, label) {
  const started = Date.now();
  let lastValue;
  while (Date.now() - started < timeoutMs) {
    lastValue = await read();
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(lastValue)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function printReport(report, reportPath) {
  console.log("\nPoracode integration smoke report");
  for (const result of report.automated) {
    console.log(`${result.status.toUpperCase()}: ${result.id}`);
  }
  for (const item of report.manual) {
    const statusLabel =
      item.status === "acknowledged" ? "ACK" : item.status === "mocked" ? "MOCK" : "MANUAL";
    console.log(`${statusLabel}: ${item.gate}`);
  }
  console.log(`Console/runtime errors: ${report.errors.length}`);
  console.log(`Report: ${reportPath}`);
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
