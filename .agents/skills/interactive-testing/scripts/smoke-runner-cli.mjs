import { parseArgs } from "node:util";

export function parseSmokeRunnerArgs(args) {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      help: { type: "boolean", short: "h" },
      scope: { type: "string", default: "changed" },
      mode: { type: "string", default: "mock" },
      root: { type: "string" },
      outDir: { type: "string" },
      port: { type: "string" },
      vitePort: { type: "string" },
      startupTimeoutSeconds: { type: "string", default: "180" },
      "launch-only": { type: "boolean" },
      "reuse-fixture": { type: "boolean" },
      new: { type: "boolean" },
      rendererViteHMR: { type: "boolean" },
    },
  });
  if (values.help) return values;
  if (!["changed", "full"].includes(values.scope)) {
    throw new Error("--scope must be changed or full");
  }
  if (!["mock", "real"].includes(values.mode)) {
    throw new Error("--mode must be mock or real");
  }
  const timeout = Number(values.startupTimeoutSeconds);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("--startupTimeoutSeconds must be a positive finite number");
  }
  for (const key of ["port", "vitePort"]) {
    if (values[key] === undefined) continue;
    const port = Number(values[key]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`--${key} must be an integer between 1 and 65535`);
    }
  }
  return values;
}

export const smokeRunnerHelp = `Usage: node run-poracode-smoke.mjs [options]

  --scope changed|full          Coverage scope (default: changed)
  --mode mock|real              Runtime isolation (default: mock)
  --launch-only                 Keep one managed debug session running
  --new                         Create a separate debug session
  --root PATH                   Isolated session directory outside the repository
  --outDir PATH                 Report and screenshot directory
  --port NUMBER                 CDP port (otherwise allocated automatically)
  --vitePort NUMBER             Renderer port (otherwise allocated automatically)
  --startupTimeoutSeconds N     Startup deadline (default: 180)
  --rendererViteHMR             Use the checkout renderer with hot reload
  --reuse-fixture               Reuse the isolated session's fixture
  -h, --help                    Print usage and exit without creating a session
`;
