import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve as resolvePath, sep } from "node:path";
import { LOOPBACK_HOST } from "./constants.ts";
import { findRepoRoot } from "./paths.ts";
import {
  NATIVE_E2E_KEEP_ENV,
  NATIVE_E2E_PORT_BASE,
  NATIVE_E2E_PORTS_PER_SLOT,
  NATIVE_E2E_RUN_DIR_VERSION,
  NATIVE_E2E_RUN_MARKER_NAME,
  NATIVE_E2E_RUN_PARENT,
  NATIVE_E2E_SLOT_ENV,
  PORT_OFFSET,
} from "./versions.ts";

export interface RunDirectory {
  readonly path: string;
  readonly markerPath: string;
  readonly readyPath: string;
  readonly secretsDir: string;
  readonly journalPath: string;
  readonly keep: boolean;
}

export interface SlotPorts {
  readonly slot: number;
  readonly base: number;
  readonly appHost: number;
  readonly control: number;
  readonly relay: number;
  readonly productionHost: number;
  readonly upstream: number;
}

export interface RunMarker {
  readonly version: typeof NATIVE_E2E_RUN_DIR_VERSION;
  readonly kind: "native-e2e-run";
  readonly createdAt: string;
  readonly pid: number;
}

const RUN_DIR_NAME = /^run-\d+-\d+-[0-9a-f]+$/;

export function nativeE2eParentDir(repoRoot = findRepoRoot()): string {
  return join(repoRoot, NATIVE_E2E_RUN_PARENT);
}

export function createRunDirectory(input?: {
  readonly repoRoot?: string;
  readonly now?: number;
  readonly pid?: number;
  readonly nonce?: string;
  readonly keep?: boolean;
}): RunDirectory {
  const repoRoot = input?.repoRoot ?? findRepoRoot();
  const parent = nativeE2eParentDir(repoRoot);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o700);
  const timestamp = input?.now ?? Date.now();
  const pid = input?.pid ?? process.pid;
  const nonce = input?.nonce ?? randomBytes(4).toString("hex");
  const path = join(parent, `run-${timestamp}-${pid}-${nonce}`);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  const secretsDir = join(path, "secrets");
  mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  chmodSync(secretsDir, 0o700);
  const marker: RunMarker = {
    version: NATIVE_E2E_RUN_DIR_VERSION,
    kind: "native-e2e-run",
    createdAt: new Date(timestamp).toISOString(),
    pid,
  };
  const markerPath = join(path, NATIVE_E2E_RUN_MARKER_NAME);
  writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(markerPath, 0o600);
  return {
    path,
    markerPath,
    readyPath: join(path, "ready.json"),
    secretsDir,
    journalPath: join(path, "scripts.json"),
    keep: input?.keep ?? process.env[NATIVE_E2E_KEEP_ENV] === "1",
  };
}

export function isValidatedRunDirectory(path: string, repoRoot = findRepoRoot()): boolean {
  const parent = resolvePath(nativeE2eParentDir(repoRoot));
  const resolved = resolvePath(path);
  if (resolved === parent || !resolved.startsWith(`${parent}${sep}`)) return false;
  const name = resolved.slice(parent.length + 1);
  if (name.includes(sep) || !RUN_DIR_NAME.test(name)) return false;
  const markerPath = join(resolved, NATIVE_E2E_RUN_MARKER_NAME);
  if (!existsSync(markerPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf8")) as Partial<RunMarker>;
    return parsed.kind === "native-e2e-run" && parsed.version === NATIVE_E2E_RUN_DIR_VERSION;
  } catch {
    return false;
  }
}

export function cleanupRunDirectory(path: string, options?: { readonly keep?: boolean }): void {
  const repoRoot = findRepoRoot();
  if (!isValidatedRunDirectory(path, repoRoot)) {
    throw new Error(`Refusing to remove a path that is not a marked native-e2e run dir: ${path}`);
  }
  const keep = options?.keep ?? process.env[NATIVE_E2E_KEEP_ENV] === "1";
  const secretsDir = join(path, "secrets");
  if (existsSync(secretsDir)) {
    rmSync(secretsDir, { recursive: true, force: true });
  }
  if (!keep) {
    rmSync(path, { recursive: true, force: true });
  }
}

export function writeSecretFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(data)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

export function consumeSecretFile<T>(path: string): T {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as T;
  rmSync(path, { force: true });
  return parsed;
}

export function parseSlot(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 0;
  const slot = Number(raw);
  if (!Number.isInteger(slot) || slot < 0) {
    throw new Error(`${NATIVE_E2E_SLOT_ENV} must be a non-negative integer, got ${raw}`);
  }
  const maxSlot = Math.floor((65535 - NATIVE_E2E_PORT_BASE) / NATIVE_E2E_PORTS_PER_SLOT);
  if (slot > maxSlot) {
    throw new Error(`${NATIVE_E2E_SLOT_ENV}=${slot} exceeds the last usable slot ${maxSlot}`);
  }
  return slot;
}

export function portsForSlot(slot: number): SlotPorts {
  const normalized = parseSlot(String(slot));
  const base = NATIVE_E2E_PORT_BASE + normalized * NATIVE_E2E_PORTS_PER_SLOT;
  if (base + NATIVE_E2E_PORTS_PER_SLOT - 1 > 65535) {
    throw new Error(`Slot ${normalized} base ${base} does not fit in the TCP port range`);
  }
  return {
    slot: normalized,
    base,
    appHost: base + PORT_OFFSET.appHost,
    control: base + PORT_OFFSET.control,
    relay: base + PORT_OFFSET.relay,
    productionHost: base + PORT_OFFSET.productionHost,
    upstream: base + PORT_OFFSET.upstream,
  };
}

export function slotFromEnv(env: NodeJS.ProcessEnv = process.env): SlotPorts {
  return portsForSlot(parseSlot(env[NATIVE_E2E_SLOT_ENV]));
}

export async function assertPortsFree(
  ports: readonly number[],
  host = LOOPBACK_HOST,
): Promise<void> {
  for (const port of ports) {
    if (port < 1 || port > 65535) throw new Error(`Invalid port ${port}`);
    const occupied = await isPortOccupied(host, port);
    if (occupied) {
      throw new Error(`Native-e2e slot port ${port} on ${host} is already occupied`);
    }
  }
}

export function isPortOccupied(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

export function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function statMode(path: string): number {
  return statSync(path).mode & 0o777;
}
