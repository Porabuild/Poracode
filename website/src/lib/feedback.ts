import { createHash, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { BlobNotFoundError, del, get, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

// New, independently deployed intake contract and temporary records; no older writers exist.
export const FEEDBACK_VERSION = 1;
const PREFIX = "feedback:v1:";
const REPO = "Porabuild/Poracode";
const TTL = 86400;
export const FILE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};
type Attachment = {
  name: string;
  size: number;
  type: string;
  path: string;
  attempts: number;
  asset?: string;
};
type Submission = {
  version: 1;
  title: string;
  details: string;
  kind: "bug" | "idea";
  diagnostics: string;
  files: Attachment[];
  created: number;
  creating?: boolean;
  reconcilePage?: number;
  issue?: number;
  url?: string;
};
export class FeedbackError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function configured() {
  return [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "BLOB_READ_WRITE_TOKEN",
    "FEEDBACK_GITHUB_TOKEN",
    "TURNSTILE_SECRET_KEY",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "CRON_SECRET",
  ].every((key) => Boolean(process.env[key]));
}
function redis() {
  if (!configured())
    throw new FeedbackError("Feedback is temporarily unavailable. Please try again later.", 503);
  return Redis.fromEnv();
}
const recordKey = (id: string) => PREFIX + "submission:" + id;
function receipt(id: unknown): string {
  if (typeof id !== "string" || !/^[\da-f-]{36}$/.test(id))
    throw new FeedbackError("Invalid receipt.");
  return id;
}
export function validateFeedback(value: unknown) {
  if (!value || typeof value !== "object") throw new FeedbackError("Invalid form.");
  const v = value as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  const details = typeof v.details === "string" ? v.details.trim() : "";
  if (
    v.version !== FEEDBACK_VERSION ||
    !["bug", "idea"].includes(String(v.kind)) ||
    title.length < 5 ||
    title.length > 160 ||
    details.length < 20 ||
    details.length > 5000
  )
    throw new FeedbackError("Check the title and description.");
  if (!Array.isArray(v.files) || v.files.length > 5)
    throw new FeedbackError("Choose up to 5 attachments.");
  const files: Attachment[] = v.files.map((f: unknown) => {
    if (!f || typeof f !== "object") throw new FeedbackError("Invalid attachment.");
    const file = f as Record<string, unknown>;
    if (
      typeof file.name !== "string" ||
      file.name.length > 150 ||
      /[\\/]/.test(file.name) ||
      file.name.split("").some((c) => c.charCodeAt(0) < 32)
    )
      throw new FeedbackError("Invalid filename.");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const type = Object.hasOwn(FILE_TYPES, extension) ? FILE_TYPES[extension] : undefined;
    if (
      !type ||
      !Number.isSafeInteger(file.size) ||
      Number(file.size) < 1 ||
      Number(file.size) > 10_000_000
    )
      throw new FeedbackError("Attachments must be supported files up to 10 MB each.");
    return { name: file.name, size: Number(file.size), type, path: "", attempts: 0 };
  });
  return {
    version: 1 as const,
    title,
    details,
    kind: v.kind as "bug" | "idea",
    diagnostics: typeof v.diagnostics === "string" ? v.diagnostics.slice(0, 300) : "",
    files,
    created: Date.now(),
  };
}
export async function limitFeedbackRequests(ip: string) {
  const db = redis();
  const hash = createHash("sha256")
    .update(process.env.TURNSTILE_SECRET_KEY! + ip)
    .digest("hex");
  const key = PREFIX + "requests:" + hash + ":" + new Date().toISOString().slice(0, 13);
  const count = await db.incr(key);
  await db.expire(key, 3600);
  if (count > 120) throw new FeedbackError("Too many requests. Please try again later.", 429);
}
export async function startFeedback(value: unknown, ip: string) {
  const db = redis();
  const submission = validateFeedback(value);
  const token = (value as Record<string, unknown>).token;
  if (typeof token !== "string" || token.length > 2048)
    throw new FeedbackError("Complete the verification.");
  const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response: token,
      remoteip: ip,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await verification.json()) as {
    success: boolean;
    hostname: string;
    action: string;
  };
  if (
    !result.success ||
    result.action !== "feedback" ||
    result.hostname !== (process.env.FEEDBACK_HOSTNAME ?? "poracode.com")
  )
    throw new FeedbackError("Verification failed. Please try again.");
  const now = new Date();
  const hash = createHash("sha256")
    .update(process.env.TURNSTILE_SECRET_KEY! + ip)
    .digest("hex");
  const keys = [
    PREFIX + "hour:" + hash + ":" + now.toISOString().slice(0, 13),
    PREFIX + "day:" + now.toISOString().slice(0, 10),
    PREFIX + "month:" + now.toISOString().slice(0, 7),
    PREFIX + "bytes:" + now.toISOString().slice(0, 7),
  ];
  const bytes = submission.files.reduce((n, f) => n + f.size, 0);
  // Check and reserve in one operation across all warm instances. Failed grants still consume quota.
  const reserved = await db.eval<number[], number>(
    `local limits={3,100,3000,10000000000}; local amounts={1,1,1,tonumber(ARGV[1])}; for i,k in ipairs(KEYS) do if tonumber(redis.call('GET',k) or '0')+amounts[i]>limits[i] then return 0 end end; for i,k in ipairs(KEYS) do redis.call('INCRBY',k,amounts[i]); redis.call('EXPIRE',k,2764800) end; return 1`,
    keys,
    [bytes],
  );
  if (!reserved)
    throw new FeedbackError(
      "Feedback limit reached. Your draft is kept; please try again later.",
      429,
    );
  const id = randomUUID();
  submission.files.forEach((file, index) => {
    file.path = `${PREFIX}${id}/${index}`;
  });
  await db.set(recordKey(id), submission, { ex: TTL });
  await db.zadd(PREFIX + "expiry", { score: Date.now() + TTL * 1000, member: id });
  const grants = await Promise.all(
    submission.files.map(async (file) => ({
      path: file.path,
      type: file.type,
      token: await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN!,
        pathname: file.path,
        maximumSizeInBytes: file.size,
        allowedContentTypes: [file.type],
        validUntil: Date.now() + 600000,
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
    })),
  );
  return { receipt: id, grants };
}
export async function resumeFeedback(input: unknown) {
  const id = receipt(input);
  const db = redis();
  if (!(await db.set(PREFIX + "lock:" + id, "1", { nx: true, ex: 180 }))) return { pending: true };
  try {
    const s = await db.get<Submission>(recordKey(id));
    if (!s) return await feedbackStatus(id);
    const validUntil = Date.now() + 600000;
    await db.zadd(PREFIX + "expiry", {
      score: Math.max(s.created + TTL * 1000, validUntil + 60000),
      member: id,
    });
    const grants = [];
    const uploaded = [];
    for (const [index, f] of s.files.entries()) {
      let exists = Boolean(f.asset);
      if (!exists) {
        try {
          const staged = await head(f.path);
          exists = staged.size === f.size;
          if (!exists) await del(f.path);
        } catch (error) {
          if (!(error instanceof BlobNotFoundError)) throw error;
        }
      }
      if (exists) {
        uploaded.push(index);
        grants.push({ path: f.path, type: f.type, token: "" });
        continue;
      }
      const allowed = await db.eval<number[], number>(
        `local n=redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],86400); if n>3 then return 0 end; local b=tonumber(redis.call('GET',KEYS[2]) or '0'); if b+tonumber(ARGV[1])>10000000000 then return 0 end; redis.call('INCRBY',KEYS[2],ARGV[1]); redis.call('EXPIRE',KEYS[2],2764800); return 1`,
        [
          PREFIX + "grant:" + id + ":" + index,
          PREFIX + "bytes:" + new Date().toISOString().slice(0, 7),
        ],
        [f.size],
      );
      if (!allowed)
        throw new FeedbackError("Upload retry limit reached. Please try again later.", 429);
      grants.push({
        path: f.path,
        type: f.type,
        token: await generateClientTokenFromReadWriteToken({
          token: process.env.BLOB_READ_WRITE_TOKEN!,
          pathname: f.path,
          maximumSizeInBytes: f.size,
          allowedContentTypes: [f.type],
          validUntil,
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
      });
    }
    return { receipt: id, grants, uploaded };
  } finally {
    await db.del(PREFIX + "lock:" + id);
  }
}
async function github(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.FEEDBACK_GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Object.assign(
      new FeedbackError("GitHub could not finish your report. Your draft is kept.", 502),
      { githubStatus: response.status },
    );
  return response.json();
}
export function matchesFile(bytes: Uint8Array, type: string) {
  const h = Buffer.from(bytes);
  if (type === "image/png")
    return h.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return h[0] === 255 && h[1] === 216 && h[2] === 255;
  if (type === "image/gif") return /^GIF8[79]a/.test(h.toString("ascii", 0, 6));
  if (type === "image/webp")
    return h.toString("ascii", 0, 4) === "RIFF" && h.toString("ascii", 8, 12) === "WEBP";
  if (type === "video/mp4") return h.toString("ascii", 4, 8) === "ftyp";
  if (type === "video/webm") return h.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]));
  return false;
}
const safeText = (text: string) =>
  text.replaceAll("@", "@\u200b").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
async function clean(id: string, s: Submission) {
  if (s.files.length) await del(s.files.map((f) => f.path));
  const db = redis();
  await db.set(PREFIX + "receipt:" + id, { url: s.url ?? null }, { ex: TTL });
  await db.del(recordKey(id));
  // Keep only the receipt ID until every previously issued upload token has expired.
  // A token holder can otherwise recreate a deleted path after successful delivery.
  await db.zadd(PREFIX + "expiry", { score: Date.now() + 660000, member: id });
}
export async function completeFeedback(input: unknown) {
  const id = receipt(input);
  const db = redis();
  const calls = await db.incr(PREFIX + "complete-calls:" + id);
  await db.expire(PREFIX + "complete-calls:" + id, TTL);
  if (calls > 30) throw new FeedbackError("Retry limit reached. Please try again later.", 429);
  if (!(await db.set(PREFIX + "lock:" + id, "1", { nx: true, ex: 180 }))) return { pending: true };
  try {
    const s = await db.get<Submission>(recordKey(id));
    if (!s) return await feedbackStatus(id);
    const save = () => db.set(recordKey(id), s, { keepTtl: true });
    let repositoryId: number | undefined;
    for (const file of s.files) {
      if (file.asset) continue;
      if (file.attempts >= 3)
        throw new FeedbackError("Attachment delivery failed. Please try again later.", 502);
      file.attempts++;
      await save();
      const blob = await get(file.path, { access: "private" });
      if (!blob || blob.statusCode !== 200)
        throw new FeedbackError("An attachment is missing. Your draft is kept.");
      const data = new Uint8Array(await new Response(blob.stream).arrayBuffer());
      if (data.length !== file.size || !matchesFile(data, file.type))
        throw new FeedbackError("An attachment has an invalid size or format.");
      repositoryId ??= ((await github("")) as { id: number }).id;
      const query = new URLSearchParams({
        name: file.name,
        content_type: file.type,
        repository_id: String(repositoryId),
      });
      const upload = await fetch(`https://uploads.github.com/user-attachments/assets?${query}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FEEDBACK_GITHUB_TOKEN}`,
          "Content-Type": "application/octet-stream",
          Accept: "application/vnd.github+json",
        },
        body: data,
        signal: AbortSignal.timeout(20000),
      });
      if (!upload.ok)
        throw new FeedbackError(
          "An attachment could not be delivered to GitHub. Please retry.",
          502,
        );
      const asset = (await upload.json()) as { url: string };
      if (!/^https:\/\/github\.com\/user-attachments\/(assets|files)\//.test(asset.url))
        throw new FeedbackError("Unexpected attachment response.", 502);
      file.asset = asset.url;
      await save();
    }
    const marker = `<!-- poracode-feedback:${id} -->`;
    if (!s.issue && s.creating) {
      // Never blindly repeat an issue POST whose response may have been lost.
      let existing:
        | { number: number; html_url: string; body: string; created_at: string }
        | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const page = s.reconcilePage ?? 1;
        const issues = (await github(
          `/issues?state=all&sort=created&direction=desc&per_page=100&page=${page}&since=${new Date(s.created - 1000).toISOString()}`,
        )) as { number: number; html_url: string; body: string; created_at: string }[];
        existing = issues.find((issue) => issue.body?.includes(marker));
        if (existing) break;
        const covered =
          issues.length < 100 || Date.parse(issues.at(-1)!.created_at) < s.created - 1000;
        s.reconcilePage = covered ? 1 : page + 1;
        await save();
        if (covered) return { pending: true };
      }
      if (!existing) return { pending: true };
      s.issue = existing.number;
      s.url = existing.html_url;
      await save();
    }
    if (!s.issue) {
      s.creating = true;
      await save();
      let issue: { number: number; html_url: string };
      try {
        issue = (await github("/issues", {
          method: "POST",
          body: JSON.stringify({
            title: safeText(s.title),
            body: `${safeText(s.details)}\n\n${s.diagnostics ? `### Environment\n${safeText(s.diagnostics)}\n\n` : ""}${s.files.map((f, index) => (f.type.startsWith("image/") ? `![Attachment ${index + 1}](${f.asset})` : f.asset)).join("\n\n")}\n\n${marker}`,
            labels: [s.kind === "bug" ? "bug" : "enhancement"],
          }),
        })) as { number: number; html_url: string };
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "githubStatus" in error &&
          Number(error.githubStatus) >= 400 &&
          Number(error.githubStatus) < 500
        ) {
          s.creating = false;
          await save();
        }
        throw error;
      }
      s.issue = issue.number;
      s.url = issue.html_url;
      await save();
    }
    const issue = (await github(`/issues/${s.issue}`)) as { body: string };
    if (!issue.body.includes(marker)) throw new FeedbackError("Report verification failed.", 502);
    for (const f of s.files) {
      if (!issue.body.includes(f.asset!))
        throw new FeedbackError("Attachment verification failed.", 502);
      const verified = await fetch(f.asset!, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      if (!verified.ok)
        throw new FeedbackError("An attachment is not available yet. Please retry.", 502);
    }
    await clean(id, s);
    return { url: s.url };
  } finally {
    await db.del(PREFIX + "lock:" + id);
  }
}
export async function feedbackStatus(input: unknown) {
  const id = receipt(input);
  const db = redis();
  const done = await db.get<{ url: string | null }>(PREFIX + "receipt:" + id);
  if (done) return done.url ? done : { expired: true };
  if (!(await db.exists(recordKey(id))))
    throw new FeedbackError("This submission has expired. Your local draft is kept.", 410);
  return { pending: true };
}
export async function cleanupFeedback() {
  // Disabling intake or rotating GitHub/Turnstile keys must not disable expiry cleanup.
  const db = Redis.fromEnv();
  const ids = await db.zrange<string[]>(PREFIX + "expiry", 0, Date.now(), {
    byScore: true,
    count: 100,
    offset: 0,
  });
  for (const id of ids) {
    // Paths remain derivable when the expiring Redis payload is already gone.
    if (!(await db.set(PREFIX + "lock:" + id, "1", { nx: true, ex: 180 }))) continue;
    try {
      const expiry = await db.zscore(PREFIX + "expiry", id);
      if (expiry === null || expiry > Date.now()) continue;
      await del(Array.from({ length: 5 }, (_, i) => `${PREFIX}${id}/${i}`));
      await db.del(recordKey(id));
      await db.zrem(PREFIX + "expiry", id);
    } finally {
      await db.del(PREFIX + "lock:" + id);
    }
  }
}
