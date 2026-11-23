import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import { portsForSlot, parseSlot } from "../harness/runDirectory.ts";
import { startMobileSmokeSession, type MobileSmokeSession } from "./session.ts";
import { MOBILE_SMOKE_STAGES } from "./stages.ts";

interface CliArgs {
  readonly slot: number;
  readonly pwaPort: number;
  readonly withPwa: boolean;
  readonly listStages: boolean;
  readonly initialStage?: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let slot = 0;
  let pwaPort = 3101;
  let withPwa = false;
  let listStages = false;
  let initialStage: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list-stages") {
      listStages = true;
    } else if (arg === "--with-pwa") {
      withPwa = true;
    } else if (arg === "--slot" && argv[i + 1]) {
      slot = parseSlot(argv[++i]);
    } else if (arg === "--pwa-port" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid --pwa-port value: ${argv[i]}`);
      }
      pwaPort = parsed;
    } else if (arg === "--stage" && argv[i + 1]) {
      initialStage = argv[++i];
    }
  }
  return {
    slot,
    pwaPort,
    withPwa,
    listStages,
    ...(initialStage ? { initialStage } : {}),
  };
}

function printStages(): void {
  process.stdout.write("\nAvailable mobile smoke stages (PWA source of truth -> iOS & Android):\n");
  for (const stage of MOBILE_SMOKE_STAGES) {
    process.stdout.write(`  ${stage.id.padEnd(18)} [${stage.block}] ${stage.summary}\n`);
  }
  process.stdout.write("\n");
}

function printHelp(): void {
  process.stdout.write(
    [
      "",
      "Commands:",
      "  <stage>            Apply a stage preset (e.g. base, tools, live, approval, question, terminal, workflow, fault-offline, fault-clear)",
      "  stages             List all stage presets",
      "  pair [collision-b] Mint fresh 1-time pairing URLs for PWA, iOS, and Android",
      "  open ios           Open a fresh pairing deep link in the booted iOS Simulator",
      "  open android       Reverse port + open a fresh pairing deep link on Android emulator/device",
      "  reset              Reset WireLab and re-apply base smoke data",
      "  status             Show host URL, active stage, connected clients, and active faults",
      "  help               Show this help",
      "  quit               Stop the smoke host (and PWA server if started with --with-pwa)",
      "",
    ].join("\n"),
  );
}

function printPairingUrls(
  session: MobileSmokeSession,
  hostId: "primary" | "collision-b" = "primary",
) {
  const urls = session.mintPairingUrls(hostId);
  process.stdout.write(
    [
      "",
      `Pairing URLs (${hostId} -> ${urls.hostBaseUrl}, one-time tokens, valid simultaneously):`,
      `  PWA (source): ${urls.pwaUrl}`,
      `  iOS:          ${urls.iosUrl}`,
      `  Android:      ${urls.androidUrl}`,
      "",
    ].join("\n"),
  );
  return urls;
}

function openIos(url: string): void {
  try {
    execFileSync("xcrun", ["simctl", "openurl", "booted", url], { stdio: "inherit" });
    process.stdout.write("Opened pairing URL in booted iOS Simulator.\n");
  } catch (error) {
    process.stderr.write(
      `Failed to open iOS Simulator URL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

function openAndroid(url: string, hostPort: number): void {
  try {
    execFileSync("adb", ["reverse", `tcp:${hostPort}`, `tcp:${hostPort}`], { stdio: "inherit" });
    execFileSync(
      "adb",
      [
        "shell",
        "am",
        "start",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        url,
        "com.poracode.mobile",
      ],
      { stdio: "inherit" },
    );
    process.stdout.write("Reversed port and opened pairing URL on Android.\n");
  } catch (error) {
    process.stderr.write(
      `Failed to open Android URL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

function startPwaServer(pwaPort: number): ChildProcess {
  const child = spawn("bun", ["run", "dev:web:client"], {
    env: { ...process.env, PORACODE_DEV_SERVER_PORT: String(pwaPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    if (text.includes("Local:") || text.includes("ready in")) {
      process.stdout.write(`[pwa] ${text}`);
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[pwa] ${chunk.toString("utf8")}`);
  });
  return child;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.listStages) {
    printStages();
    return;
  }

  const slotPorts = portsForSlot(args.slot);
  const session = await startMobileSmokeSession({
    hostPort: slotPorts.appHost,
    controlPort: slotPorts.control,
    pwaPort: args.pwaPort,
  });

  if (args.initialStage && args.initialStage !== "base") {
    await session.applyStage(args.initialStage);
  }

  let pwaChild: ChildProcess | null = null;
  if (args.withPwa) {
    process.stdout.write(`Starting PWA dev server on http://127.0.0.1:${args.pwaPort} ...\n`);
    pwaChild = startPwaServer(args.pwaPort);
  }

  process.stdout.write(
    [
      "",
      "Poracode Mobile Manual Smoke Host READY",
      `  Host:   ${session.httpBaseUrl}`,
      `  WS:     ${session.wsBaseUrl}`,
      `  Stage:  ${session.currentStage()}`,
      `  PWA:    http://127.0.0.1:${args.pwaPort}${args.withPwa ? " (managed)" : " (start with: bun run dev:web)"}`,
      `  Guide:  docs/MOBILE_MANUAL_SMOKE.md`,
    ].join("\n") + "\n",
  );
  printPairingUrls(session);
  process.stdout.write('Type a stage name (e.g. "tools", "live", "approval") or "help".\n');

  let stopping = false;
  const cleanup = async () => {
    if (stopping) return;
    stopping = true;
    pwaChild?.kill("SIGTERM");
    await session.stop();
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(0));
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "smoke> ",
  });
  rl.prompt();

  rl.on("line", (rawLine) => {
    void (async () => {
      const parts = rawLine.trim().split(/\s+/).filter(Boolean);
      const cmd = parts[0]?.toLowerCase();
      if (!cmd) {
        rl.prompt();
        return;
      }
      try {
        if (cmd === "quit" || cmd === "exit" || cmd === "q") {
          rl.close();
          await cleanup();
          process.exit(0);
        } else if (cmd === "help" || cmd === "?") {
          printHelp();
        } else if (cmd === "stages" || cmd === "list") {
          printStages();
        } else if (cmd === "pair") {
          const target = parts[1] === "collision-b" ? "collision-b" : "primary";
          printPairingUrls(session, target);
        } else if (cmd === "open" && parts[1] === "ios") {
          const urls = session.mintPairingUrls("primary");
          openIos(urls.iosUrl);
        } else if (cmd === "open" && parts[1] === "android") {
          const urls = session.mintPairingUrls("primary");
          openAndroid(urls.androidUrl, session.hostPort);
        } else if (cmd === "reset") {
          const stage = await session.resetToBase();
          process.stdout.write(`Reset complete -> stage "${stage.id}".\n`);
        } else if (cmd === "status") {
          process.stdout.write(`${JSON.stringify(session.status(), null, 2)}\n`);
        } else {
          const stageId = cmd === "stage" && parts[1] ? parts[1] : cmd;
          const applied = await session.applyStage(stageId);
          process.stdout.write(`Stage "${applied.id}" [${applied.block}] -> ${applied.summary}\n`);
        }
      } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
      rl.prompt();
    })();
  });
}

void main();
