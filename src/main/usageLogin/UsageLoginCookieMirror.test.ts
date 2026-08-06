import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Cookie } from "electron";
import { getUsageSecret, setUsageSecret } from "@/shared/usageSecretStore";
import { startUsageLoginCookieMirror } from "./UsageLoginCookieMirror";
import type { CookieLoginConfig } from "./providerLoginConfigs";

const CONSOLE_URL = "https://modelstudio.console.alibabacloud.com/";

const TARGET_CONFIG: CookieLoginConfig = {
  kind: "cookie",
  loginUrl: CONSOLE_URL,
  cookieUrl: CONSOLE_URL,
  authCookiePattern: /^login_(?:aliyunid_ticket|aliyunid_pk)$/i,
};

function cookie(name: string, value: string): Cookie {
  return { name, value } as Cookie;
}

interface Harness {
  cacheDir: string;
  jar: Cookie[];
  emit(changed: Cookie, removed?: boolean): void;
  stop(): void;
  requestedUrls: string[];
}

let dirs: string[] = [];
let stops: (() => void)[] = [];

function harness(jar: Cookie[]): Harness {
  const cacheDir = mkdtempSync(join(tmpdir(), "poracode-cookie-mirror-"));
  dirs.push(cacheDir);
  const requestedUrls: string[] = [];
  let listener: ((...args: unknown[]) => void) | undefined;
  const session = {
    cookies: {
      get: (filter: { url: string }) => {
        requestedUrls.push(filter.url);
        return Promise.resolve(jar);
      },
      on: (_event: string, handler: (...args: unknown[]) => void) => {
        listener = handler;
      },
      removeListener: () => {
        listener = undefined;
      },
    },
  };
  const stop = startUsageLoginCookieMirror({
    cacheDir,
    session: session as unknown as Parameters<typeof startUsageLoginCookieMirror>[0]["session"],
    targets: [{ providerId: "qwen", config: TARGET_CONFIG }],
    debounceMs: 0,
  });
  stops.push(stop);
  return {
    cacheDir,
    jar,
    emit: (changed, removed = false) => listener?.({}, changed, "explicit", removed),
    stop,
    requestedUrls,
  };
}

/** The mirror re-seals on a debounce timer; let its callback and write settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

beforeEach(() => {
  dirs = [];
  stops = [];
});

afterEach(() => {
  for (const stop of stops) stop();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("startUsageLoginCookieMirror", () => {
  it("re-seals the live jar when the browser refreshes an auth cookie", async () => {
    // Alibaba's console cookies are session-scoped, so the snapshot taken at
    // sign-in is the only copy that survives a restart — it has to track the jar.
    const test = harness([cookie("login_aliyunid_ticket", "fresh"), cookie("cna", "anon")]);
    setUsageSecret(test.cacheDir, "qwen", "cookie", "login_aliyunid_ticket=stale; cna=anon");

    test.emit(cookie("login_aliyunid_ticket", "fresh"));
    await settle();

    expect(getUsageSecret(test.cacheDir, "qwen", "cookie")).toBe(
      "login_aliyunid_ticket=fresh; cna=anon",
    );
    expect(test.requestedUrls).toEqual([CONSOLE_URL]);
  });

  it("never captures a cookie for a provider the user has not signed into", async () => {
    const test = harness([cookie("login_aliyunid_ticket", "fresh")]);

    test.emit(cookie("login_aliyunid_ticket", "fresh"));
    await settle();

    expect(getUsageSecret(test.cacheDir, "qwen", "cookie")).toBeUndefined();
    expect(test.requestedUrls).toEqual([]);
  });

  it("ignores cookies outside the provider's auth pattern", async () => {
    const test = harness([cookie("login_aliyunid_ticket", "fresh")]);
    setUsageSecret(test.cacheDir, "qwen", "cookie", "login_aliyunid_ticket=stale");

    test.emit(cookie("_ga", "analytics"));
    await settle();

    expect(getUsageSecret(test.cacheDir, "qwen", "cookie")).toBe("login_aliyunid_ticket=stale");
  });

  it("ignores removals so a sign-out or expiry never writes a weaker header", async () => {
    const test = harness([cookie("cna", "anon")]);
    setUsageSecret(test.cacheDir, "qwen", "cookie", "login_aliyunid_ticket=stale");

    test.emit(cookie("login_aliyunid_ticket", "stale"), true);
    await settle();

    expect(getUsageSecret(test.cacheDir, "qwen", "cookie")).toBe("login_aliyunid_ticket=stale");
  });

  it("keeps the stored snapshot when no auth cookie applies to the provider URL", async () => {
    // A same-named cookie on an unrelated host must not blank the stored header.
    const test = harness([cookie("cna", "anon")]);
    setUsageSecret(test.cacheDir, "qwen", "cookie", "login_aliyunid_ticket=stale; cna=anon");

    test.emit(cookie("login_aliyunid_ticket", "elsewhere"));
    await settle();

    expect(getUsageSecret(test.cacheDir, "qwen", "cookie")).toBe(
      "login_aliyunid_ticket=stale; cna=anon",
    );
  });

  it("stops mirroring after the returned stop function runs", async () => {
    const test = harness([cookie("login_aliyunid_ticket", "fresh")]);
    setUsageSecret(test.cacheDir, "qwen", "cookie", "login_aliyunid_ticket=stale");

    test.stop();
    test.emit(cookie("login_aliyunid_ticket", "fresh"));
    await settle();

    expect(getUsageSecret(test.cacheDir, "qwen", "cookie")).toBe("login_aliyunid_ticket=stale");
  });
});
