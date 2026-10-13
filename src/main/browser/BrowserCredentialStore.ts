import { randomUUID } from "node:crypto";
import type { BrowserCredentialInfo } from "@/shared/ipc";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/shared/secretStorage";
import type { ShellStateStore } from "../backend/BackendStateStore";

// Version 1 preserves the sealed entries from the original array format. Future
// envelopes are refused without overwriting credential custody.
const CREDENTIALS_FORMAT_VERSION = 1;
const CREDENTIALS_KEY = "browser-credentials-v1";
const NO_BASE_DIR = "";
const PASSWORD_PAYLOAD_PREFIX = "browser-password:v1:";

export interface BrowserCredential extends BrowserCredentialInfo {
  password: string;
}

export interface BrowserCredentialInput {
  id?: string;
  origin: string;
  username: string;
  password: string;
  source?: string;
}

export interface BrowserCredentialBatchResult {
  saved: BrowserCredentialInfo[];
  failed: number;
}

interface PersistedBrowserCredential extends BrowserCredentialInfo {
  sealedPassword: string;
}

/** Normalize a page URL to the exact HTTP(S) origin used for credential matching. */
export function normalizeBrowserCredentialOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Browser credentials require an HTTP(S) origin.");
  }
  return url.origin;
}

/**
 * Encrypted browser credentials. List operations return metadata only; callers
 * must explicitly request a credential by id to obtain its decrypted password.
 */
export class BrowserCredentialStore {
  private credentials: PersistedBrowserCredential[] = [];
  private writes: Promise<void> = Promise.resolve();
  private loaded = false;
  private loadError: Error | null = null;

  constructor(private readonly state: ShellStateStore) {}

  list(origin?: string): BrowserCredentialInfo[] {
    this.load();
    const normalizedOrigin =
      origin === undefined ? undefined : normalizeBrowserCredentialOrigin(origin);
    return this.credentials
      .filter(
        (credential) => normalizedOrigin === undefined || credential.origin === normalizedOrigin,
      )
      .map(toMetadata)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): BrowserCredential | undefined {
    this.load();
    const credential = this.credentials.find((entry) => entry.id === id);
    if (!credential) return undefined;
    try {
      return {
        ...toMetadata(credential),
        password: unsealPassword(credential.sealedPassword),
      };
    } catch {
      return undefined;
    }
  }

  upsert(input: BrowserCredentialInput): Promise<BrowserCredentialInfo> {
    return this.mutate(async (credentials) => {
      const metadata = upsertCredential(credentials, input);
      await this.persist(credentials);
      return { credentials, result: metadata };
    });
  }

  upsertMany(inputs: readonly BrowserCredentialInput[]): Promise<BrowserCredentialBatchResult> {
    return this.mutate(async (credentials) => {
      const saved: BrowserCredentialInfo[] = [];
      let failed = 0;
      for (const input of inputs) {
        try {
          saved.push(upsertCredential(credentials, input));
        } catch {
          failed += 1;
        }
      }
      if (saved.length > 0) await this.persist(credentials);
      return { credentials, result: { saved, failed } };
    });
  }

  delete(id: string): Promise<boolean> {
    return this.mutate(async (credentials) => {
      const next = credentials.filter((credential) => credential.id !== id);
      const changed = next.length !== credentials.length;
      if (changed) await this.persist(next);
      return { credentials: next, result: changed };
    });
  }

  private mutate<T>(
    change: (
      credentials: PersistedBrowserCredential[],
    ) => Promise<{ credentials: PersistedBrowserCredential[]; result: T }>,
  ): Promise<T> {
    const job = this.writes.then(async () => {
      this.load();
      const changed = await change(this.credentials.map((credential) => ({ ...credential })));
      this.credentials = changed.credentials;
      return changed.result;
    });
    this.writes = job.then(
      () => {},
      () => {},
    );
    return job;
  }

  private load(): void {
    if (this.loadError) throw this.loadError;
    if (this.loaded) return;
    try {
      const raw = this.state.get(CREDENTIALS_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const entries = Array.isArray(parsed)
          ? parsed
          : parsed &&
              typeof parsed === "object" &&
              "version" in parsed &&
              parsed.version === CREDENTIALS_FORMAT_VERSION &&
              "credentials" in parsed
            ? parsed.credentials
            : null;
        if (!Array.isArray(entries) || !entries.every(isPersistedBrowserCredential)) {
          throw new Error("Unsupported browser credential store format.");
        }
        this.credentials = entries;
      }
      this.loaded = true;
    } catch {
      this.loadError = new Error("Unable to read saved browser credentials.");
      throw this.loadError;
    }
  }

  private async persist(credentials: PersistedBrowserCredential[]): Promise<void> {
    const value = JSON.stringify({ version: CREDENTIALS_FORMAT_VERSION, credentials });
    if (this.state.setDurable) await this.state.setDurable(CREDENTIALS_KEY, value);
    else this.state.set(CREDENTIALS_KEY, value);
  }
}

function upsertCredential(
  credentials: PersistedBrowserCredential[],
  input: BrowserCredentialInput,
): BrowserCredentialInfo {
  const origin = normalizeBrowserCredentialOrigin(input.origin);
  const now = Date.now();
  const existing = input.id
    ? credentials.find((credential) => credential.id === input.id)
    : credentials.find(
        (credential) => credential.origin === origin && credential.username === input.username,
      );
  if (existing) {
    existing.origin = origin;
    existing.username = input.username;
    existing.sealedPassword = sealPassword(input.password);
    existing.updatedAt = now;
    if (input.source !== undefined) existing.source = input.source;
    return toMetadata(existing);
  }

  const credential: PersistedBrowserCredential = {
    id: `credential-${randomUUID()}`,
    origin,
    username: input.username,
    sealedPassword: sealPassword(input.password),
    createdAt: now,
    updatedAt: now,
    ...(input.source !== undefined ? { source: input.source } : {}),
  };
  credentials.push(credential);
  return toMetadata(credential);
}

function sealPassword(password: string): string {
  // `encryptSecret` deliberately accepts already-sealed values unchanged. Add
  // an application payload prefix so a real password beginning with the shared
  // secret marker is still encrypted rather than mistaken for ciphertext.
  return encryptSecret(NO_BASE_DIR, `${PASSWORD_PAYLOAD_PREFIX}${password}`);
}

function unsealPassword(sealedPassword: string): string {
  const payload = decryptSecret(NO_BASE_DIR, sealedPassword);
  if (!payload.startsWith(PASSWORD_PAYLOAD_PREFIX)) {
    throw new Error("Invalid browser credential payload.");
  }
  return payload.slice(PASSWORD_PAYLOAD_PREFIX.length);
}

function toMetadata(credential: PersistedBrowserCredential): BrowserCredentialInfo {
  return {
    id: credential.id,
    origin: credential.origin,
    username: credential.username,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt,
    ...(credential.source !== undefined ? { source: credential.source } : {}),
  };
}

function isPersistedBrowserCredential(value: unknown): value is PersistedBrowserCredential {
  if (!value || typeof value !== "object") return false;
  const credential = value as Partial<PersistedBrowserCredential>;
  if (
    typeof credential.id !== "string" ||
    typeof credential.origin !== "string" ||
    typeof credential.username !== "string" ||
    typeof credential.sealedPassword !== "string" ||
    !isEncryptedSecret(credential.sealedPassword) ||
    typeof credential.createdAt !== "number" ||
    !Number.isFinite(credential.createdAt) ||
    typeof credential.updatedAt !== "number" ||
    !Number.isFinite(credential.updatedAt) ||
    (credential.source !== undefined && typeof credential.source !== "string")
  ) {
    return false;
  }
  try {
    return normalizeBrowserCredentialOrigin(credential.origin) === credential.origin;
  } catch {
    return false;
  }
}
