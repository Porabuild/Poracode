import { randomUUID } from "node:crypto";
import type { BrowserCredentialInfo } from "@/shared/ipc";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/shared/secretStorage";
import { dbGetState, dbSetState } from "../db";

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
  private loaded = false;

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

  upsert(input: BrowserCredentialInput): BrowserCredentialInfo {
    this.load();
    const credentials = this.credentials.map((credential) => ({ ...credential }));
    const metadata = upsertCredential(credentials, input);
    this.persist(credentials);
    this.credentials = credentials;
    return metadata;
  }

  upsertMany(inputs: readonly BrowserCredentialInput[]): BrowserCredentialBatchResult {
    this.load();
    const credentials = this.credentials.map((credential) => ({ ...credential }));
    const saved: BrowserCredentialInfo[] = [];
    let failed = 0;
    for (const input of inputs) {
      try {
        saved.push(upsertCredential(credentials, input));
      } catch {
        failed += 1;
      }
    }
    if (saved.length > 0) {
      this.persist(credentials);
      this.credentials = credentials;
    }
    return { saved, failed };
  }

  delete(id: string): boolean {
    this.load();
    const next = this.credentials.filter((credential) => credential.id !== id);
    if (next.length === this.credentials.length) return false;
    this.credentials = next;
    this.persist(this.credentials);
    return true;
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = dbGetState(CREDENTIALS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      this.credentials = parsed.filter(isPersistedBrowserCredential);
    } catch {}
  }

  private persist(credentials: PersistedBrowserCredential[]): void {
    dbSetState(CREDENTIALS_KEY, JSON.stringify(credentials));
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
