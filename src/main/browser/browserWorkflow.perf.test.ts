/* oxlint-disable vitest/no-conditional-expect -- Each parameterized workflow has its own state assertions; every selected scenario executes them. */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CdpSession } from "./cdp/cdpClient";
import type { ToolContext } from "./mcp/tools/types";
import type { ChromeToolContext } from "./external/chromeTools";
import { dispatchTool } from "./mcp/tools/dispatch";
import { dispatchChromeTool } from "./external/chromeTools";

// Opt-in real Chromium benchmark; PORACODE_BROWSER_BASELINE_REF selects the
// comparison commit (HEAD by default). Both versions use identical fixtures.
const enabled = process.env.PORACODE_BROWSER_BENCH === "1";
const fixture = `<!doctype html><title>Browser workflow fixture</title>
<style>body{font:16px sans-serif}input,button,select{margin:8px;padding:8px}</style>
<form id="form"><label>Name<input id="name" aria-label="Name"></label>
<label>Email<input id="email" aria-label="Email"></label>
<textarea id="notes" aria-label="Notes"></textarea>
<input id="agree" type="checkbox" aria-label="Agree">
<select id="plan" aria-label="Plan"><option value="basic">Basic</option><option value="pro">Pro</option></select>
<button id="save">Save</button></form><output id="result"></output>
<button id="async" onclick="setTimeout(()=>document.querySelector('#result').textContent='Loaded',40)">Load</button>
<button id="replace" onclick="document.querySelector('#name').outerHTML='<input id=name aria-label=Name>'">Replace</button>
<button id="disabled" disabled>Disabled</button>
<a id="next" href="/next">Next</a><div style="height:1500px"></div><button id="bottom">Bottom</button>
<script>window.saves=0;document.querySelector('#form').addEventListener('submit',e=>{e.preventDefault();window.saves++;document.querySelector('#result').textContent='Saved '+document.querySelector('#name').value;});</script>`;

type Dispatch = (name: string, payload: Record<string, unknown>) => Promise<unknown>;
type Step = Record<string, unknown> & { action: string };
type Row = {
  implementation: string;
  surface: string;
  scenario: string;
  repetition: number;
  toolCalls: number;
  roundTrips: number;
  elapsedMs: number;
  responseBytes: number;
  outcome: "passed" | "unsupported" | "quality-gap";
};

describe.skipIf(!enabled)("real browser before/after workflows", () => {
  let browser: ReturnType<typeof spawn>;
  let socket: WebSocket;
  let baseUrl: string;
  let baselineBrowser: typeof dispatchTool;
  let baselineChrome: typeof dispatchChromeTool;
  let baselineCommit: string;
  let requestId = 0;
  let roundTrips = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const rows: Row[] = [];
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(fixture);
  });
  const send = async <T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> => {
    roundTrips++;
    const id = ++requestId;
    return new Promise<T>((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 5000);
      pending.set(id, { resolve: (value) => resolveRequest(value as T), reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };
  const evaluate = async (expression: string): Promise<unknown> => {
    const result = await send<{ result: { value?: unknown }; exceptionDetails?: unknown }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const cdp: CdpSession = {
    attach: async () => {},
    isAttached: () => true,
    send,
    on: () => () => {},
  };
  const tab = {
    tabId: "fixture",
    cdp,
    webContents: { executeJavaScript: evaluate },
    snapshot: () => ({ url: baseUrl, title: "Browser workflow fixture" }),
  };
  const context = {
    allowEval: false,
    allowDataAccess: false,
    manager: {
      getActiveTab: () => tab,
      getTab: () => tab,
      ensureTabReady: async () => {},
      navigate: async (_id: string, url: string) => {
        await send("Page.navigate", { url });
      },
    },
  } as unknown as ToolContext;
  const chromeContext = {
    allowEval: false,
    allowDataAccess: false,
    connection: { cdpSession: () => cdp, ensureWorkspace: async () => 1, sendCdp: send },
  } as unknown as ChromeToolContext;

  beforeAll(async () => {
    await mkdir("tmp/browser-benchmark", { recursive: true });
    const baselineDir = await mkdtemp(resolve("tmp/browser-benchmark/baseline-"));
    baselineCommit = execFileSync(
      "git",
      ["rev-parse", "--verify", `${process.env.PORACODE_BROWSER_BASELINE_REF ?? "HEAD"}^{commit}`],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    const archive = resolve(baselineDir, "source.tar");
    execFileSync(
      "git",
      ["archive", "--format=tar", `--output=${archive}`, baselineCommit, "src/main/browser"],
      { windowsHide: true },
    );
    execFileSync("tar", ["-xf", archive, "-C", baselineDir], { windowsHide: true });
    const baseline = resolve(baselineDir, "src/main/browser");
    baselineBrowser = (await import(/* @vite-ignore */ `${baseline}/mcp/tools/dispatch.ts`))
      .dispatchTool;
    baselineChrome = (await import(/* @vite-ignore */ `${baseline}/external/chromeTools.ts`))
      .dispatchChromeTool;
    await mkdir("tmp/browser-benchmark", { recursive: true });
    const profile = await mkdtemp(resolve("tmp/browser-benchmark/profile-"));
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture port");
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = spawn(
      process.env.PORACODE_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    let launchError: Error | undefined;
    browser.on("error", (error) => {
      launchError = error;
    });
    let port: string | undefined;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (launchError) throw launchError;
      try {
        port = (await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
        break;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
    }
    if (!port) throw new Error("Chrome did not publish a debug port");
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{
      type: string;
      webSocketDebuggerUrl: string;
    }>;
    const target = targets.find((value) => value.type === "page");
    if (!target) throw new Error("No Chrome page target");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.on("message", (data) => {
      const response = JSON.parse(String(data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (!response.id) return;
      const request = pending.get(response.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(response.id);
      if (response.error) request.reject(new Error(response.error.message));
      else request.resolve(response.result);
    });
    await new Promise<void>((resolveOpen, reject) => {
      socket.once("open", resolveOpen);
      socket.once("error", reject);
    });
    await send("Page.enable");
  }, 20000);

  afterAll(async () => {
    if (rows.length)
      await writeFile(
        "tmp/browser-benchmark/results.json",
        JSON.stringify(
          {
            baselineCommit,
            measuredAt: new Date().toISOString(),
            environment:
              "headless Chrome; real page scripts; direct CDP adapters, no extension relay or model latency",
            rows,
          },
          null,
          2,
        ),
      );
    socket?.close();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Benchmark closed"));
    }
    pending.clear();
    if (browser && browser.exitCode === null) browser.kill();
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  });

  async function reset(): Promise<void> {
    const url = `${baseUrl}/?run=${requestId}`;
    await send("Page.navigate", { url });
    for (let attempt = 0; attempt < 200; attempt++) {
      if (
        await evaluate(
          `location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && !!document.querySelector('#name')`,
        )
      )
        return;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    throw new Error("Fixture did not load");
  }

  const scenarios = [
    "form",
    "append",
    "async",
    "navigation",
    "stale-ref",
    "missing-target",
    "permission",
    "snapshot-pagination",
    "find-label",
    "checkbox-select",
    "scroll",
    "keyboard",
  ];
  for (const surface of ["browser", "chrome"]) {
    for (const scenario of scenarios) {
      it(`${surface}: ${scenario}`, async () => {
        for (const implementation of ["before", "after"]) {
          // Three samples keep timing noise visible; round-trip counts are deterministic.
          for (let repetition = 0; repetition < 3; repetition++) {
            await reset();
            let toolCalls = 0;
            let responseBytes = 0;
            let measuredTrips = 0;
            let elapsedMs = 0;
            let outcome: Row["outcome"] = "passed";
            const dispatch: Dispatch = async (name, payload) => {
              toolCalls++;
              const started = performance.now();
              const startTrips = roundTrips;
              try {
                const result =
                  surface === "browser"
                    ? await (implementation === "before" ? baselineBrowser : dispatchTool)(
                        name,
                        payload,
                        context,
                      )
                    : await (implementation === "before" ? baselineChrome : dispatchChromeTool)(
                        `chrome_${name}`,
                        payload,
                        chromeContext,
                      );
                responseBytes += Buffer.byteLength(JSON.stringify(result) ?? "");
                return result;
              } finally {
                measuredTrips += roundTrips - startTrips;
                elapsedMs += performance.now() - started;
              }
            };
            const run = async (steps: Step[]) => {
              if (implementation === "after") {
                const result = await dispatch("perform", { steps });
                if (scenario !== "missing-target") {
                  expect(result).toMatchObject({
                    ok: true,
                    observation: { nodes: expect.any(Array) },
                  });
                  expect((result as { steps: unknown[] }).steps).toHaveLength(steps.length);
                }
                return result;
              }
              const results = [];
              for (const step of steps) {
                try {
                  const result = await dispatch(step.action, step);
                  results.push(result);
                  if (result && typeof result === "object" && "error" in result) break;
                } catch (error) {
                  results.push({ error: String(error) });
                  break;
                }
              }
              return {
                steps: results,
                observation: await dispatch("snapshot", { mode: "compact" }),
              };
            };
            if (scenario === "form" || scenario === "append") {
              await dispatch("snapshot", { mode: "compact" });
              await run(
                scenario === "form"
                  ? [
                      { action: "fill", selector: "#name", text: "Ada" },
                      { action: "fill", selector: "#email", text: "ada@example.test" },
                      { action: "fill", selector: "#notes", text: "Hello" },
                      { action: "click", selector: "#save" },
                      { action: "wait", text: "Saved Ada" },
                    ]
                  : [
                      { action: "fill", selector: "#name", text: "Ada" },
                      { action: "type", selector: "#name", text: " Lovelace", submit: true },
                    ],
              );
              expect(await evaluate("document.querySelector('#result').textContent")).toBe(
                scenario === "form" ? "Saved Ada" : "Saved Ada Lovelace",
              );
              expect(await evaluate("window.saves")).toBe(1);
              if (scenario === "form" && repetition === 0) {
                const image = await send<{ data: string }>("Page.captureScreenshot", {
                  format: "png",
                });
                await writeFile(
                  `tmp/browser-benchmark/${surface}-${implementation}-form.png`,
                  Buffer.from(image.data, "base64"),
                );
              }
            } else if (scenario === "async") {
              await run([
                { action: "click", selector: "#async" },
                { action: "wait", text: "Loaded", timeoutMs: 1000 },
              ]);
              expect(await evaluate("document.querySelector('#result').textContent")).toBe(
                "Loaded",
              );
            } else if (scenario === "navigation") {
              await dispatch("navigate", { url: `${baseUrl}/next` });
              await dispatch("wait", { selector: "#name" });
              expect(await evaluate("location.pathname")).toBe("/next");
              await dispatch("snapshot", { mode: "compact" });
            } else if (scenario === "missing-target") {
              const result = await run([
                { action: "click", selector: "#missing" },
                { action: "fill", selector: "#name", text: "Wrong" },
              ]);
              expect(await evaluate("document.querySelector('#name').value")).toBe("");
              if (implementation === "after")
                expect(result).toMatchObject({ ok: false, failedIndex: 0 });
            } else if (scenario === "permission") {
              expect(await dispatch("eval", { js: "window.saves=100" })).toHaveProperty("error");
              expect(await evaluate("window.saves")).toBe(0);
              expect(await dispatch("cookies", {})).toHaveProperty("error");
            } else if (scenario === "snapshot-pagination") {
              const result = await dispatch("snapshot", {
                mode: "compact",
                offset: 2,
                maxNodes: 3,
              });
              expect(result).toHaveProperty("nodes");
              expect((result as { nodes: unknown[] }).nodes).toHaveLength(3);
              const first = (await dispatch("snapshot", {
                mode: "compact",
                offset: 0,
                maxNodes: 2,
              })) as { nodes: Array<{ ref: string }> };
              const refs = (result as { nodes: Array<{ ref: string }> }).nodes.map(
                (node) => node.ref,
              );
              const firstRefs = first.nodes.map((node) => node.ref);
              const correct = await evaluate(
                `(() => { const previous=${JSON.stringify(firstRefs)}.map(ref=>window.__lcRefs.get(ref)); return ${JSON.stringify(refs)}.every(ref=>!previous.includes(window.__lcRefs.get(ref))); })()`,
              );
              if (implementation === "after" || surface === "browser") expect(correct).toBe(true);
              if (!correct) outcome = "quality-gap";
            } else if (scenario === "find-label") {
              const result = await dispatch("find", { label: "Email", role: "textbox" });
              const match = result as { found: boolean; match?: { name?: string } };
              const correct = match.found && match.match?.name === "Email";
              if (implementation === "after" || surface === "browser") expect(correct).toBe(true);
              if (!correct) outcome = "quality-gap";
            } else if (scenario === "stale-ref") {
              const result = (await dispatch("snapshot", { mode: "compact" })) as {
                nodes: Array<{ ref: string; name?: string; tag?: string }>;
              };
              const ref = result.nodes.find(
                (node) => node.name === "Name" && node.tag === "input",
              )?.ref;
              expect(ref).toBeTruthy();
              await dispatch("click", { selector: "#replace" });
              let rejected = false;
              try {
                await dispatch("fill", { ref, text: "Wrong" });
              } catch {
                rejected = true;
              }
              const untouched = await evaluate("document.querySelector('#name').value === ''");
              if (implementation === "after") {
                expect(rejected).toBe(true);
                expect(untouched).toBe(true);
              }
              if (!rejected || !untouched) outcome = "quality-gap";
            } else if (scenario === "checkbox-select") {
              if (implementation === "before" && surface === "chrome") {
                rows.push({
                  implementation,
                  surface,
                  scenario,
                  repetition,
                  toolCalls: 0,
                  roundTrips: 0,
                  elapsedMs: 0,
                  responseBytes: 0,
                  outcome: "unsupported",
                });
                continue;
              }
              await run([
                { action: "check", selector: "#agree" },
                { action: "select", selector: "#plan", value: "pro" },
              ]);
              expect(
                await evaluate(
                  "document.querySelector('#agree').checked && document.querySelector('#plan').value==='pro'",
                ),
              ).toBe(true);
            } else if (scenario === "scroll") {
              if (implementation === "before" && surface === "chrome") {
                rows.push({
                  implementation,
                  surface,
                  scenario,
                  repetition,
                  toolCalls: 0,
                  roundTrips: 0,
                  elapsedMs: 0,
                  responseBytes: 0,
                  outcome: "unsupported",
                });
                continue;
              }
              await dispatch("scroll", { selector: "#bottom" });
              expect(await evaluate("scrollY > 0")).toBe(true);
            } else if (scenario === "keyboard") {
              await dispatch("fill", { selector: "#name", text: "Ada" });
              await dispatch("press", { key: "Enter" });
              expect(await evaluate("window.saves")).toBe(1);
            }
            rows.push({
              implementation,
              surface,
              scenario,
              repetition,
              toolCalls,
              roundTrips: measuredTrips,
              elapsedMs,
              responseBytes,
              outcome,
            });
          }
        }
      }, 30000);
    }
  }
});
