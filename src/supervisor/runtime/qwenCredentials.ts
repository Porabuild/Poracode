import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { AlibabaCodingPlanRegion, OAuthToken } from "@poracode/agents-usage";
import type { SharedSettings } from "@/shared/settings";
import { readSupervisorSharedSettings } from "./supervisorSharedSettings";

export const ALIBABA_CODING_PLAN_API_KEY_ENV = "ALIBABA_CODING_PLAN_API_KEY";
export const BAILIAN_CODING_PLAN_API_KEY_ENV = "BAILIAN_CODING_PLAN_API_KEY";
export const BAILIAN_TOKEN_PLAN_API_KEY_ENV = "BAILIAN_TOKEN_PLAN_API_KEY";
export const ALIBABA_QWEN_API_KEY_ENV = "ALIBABA_QWEN_API_KEY";
export const DASHSCOPE_API_KEY_ENV = "DASHSCOPE_API_KEY";
export const ALIBABA_CODING_PLAN_REGION_ENV = "ALIBABA_CODING_PLAN_REGION";
export const ALIBABA_CODING_PLAN_QUOTA_URL_ENV = "ALIBABA_CODING_PLAN_QUOTA_URL";

const API_KEY_ENV_KEYS = [
  ALIBABA_CODING_PLAN_API_KEY_ENV,
  BAILIAN_CODING_PLAN_API_KEY_ENV,
  BAILIAN_TOKEN_PLAN_API_KEY_ENV,
  ALIBABA_QWEN_API_KEY_ENV,
  DASHSCOPE_API_KEY_ENV,
] as const;

function cleaned(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let value = raw.trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value || undefined;
}

function regionFromValue(value: unknown): AlibabaCodingPlanRegion | undefined {
  const normalized = cleaned(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (["intl", "international", "ap-southeast-1", "singapore"].includes(normalized)) {
    return "intl";
  }
  if (["cn", "china", "cn-beijing", "beijing"].includes(normalized)) return "cn";
  if (
    normalized.includes("coding-intl") ||
    normalized.includes("alibabacloud.com") ||
    normalized.includes("token-plan.ap-southeast-1.maas.aliyuncs.com")
  )
    return "intl";
  if (normalized.includes("coding.dashscope") || normalized.includes("aliyun.com")) return "cn";
  return undefined;
}

function token(
  accessToken: string,
  region?: AlibabaCodingPlanRegion,
  quotaUrl?: string,
): OAuthToken {
  const raw: Record<string, unknown> = {};
  if (region) raw.region = region;
  if (quotaUrl) raw.quotaUrl = quotaUrl;
  return Object.keys(raw).length > 0 ? { accessToken, raw } : { accessToken };
}

function firstApiKey(values: Record<string, unknown>): string | undefined {
  for (const key of API_KEY_ENV_KEYS) {
    const value = cleaned(values[key]);
    if (value) return value;
  }
  return undefined;
}

/** Pure: resolve an explicit Coding Plan key and optional endpoint metadata from an env bag. */
export function parseQwenUsageEnv(env: Record<string, string | undefined>): OAuthToken | undefined {
  const accessToken = firstApiKey(env);
  if (!accessToken) return undefined;
  return token(
    accessToken,
    regionFromValue(env[ALIBABA_CODING_PLAN_REGION_ENV]),
    cleaned(env[ALIBABA_CODING_PLAN_QUOTA_URL_ENV]),
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Pure: read the API key and selected Coding Plan region from Qwen Code's settings.json. */
export function parseQwenUsageSettings(content: string): OAuthToken | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  const settings = record(parsed);
  const environment = record(settings?.env);
  if (!settings || !environment) return undefined;
  const accessToken = firstApiKey(environment);
  if (!accessToken) return undefined;

  const model = record(settings.model);
  const selectedModel = cleaned(model?.name);
  let baseUrl = cleaned(model?.baseUrl);
  const providerMap = record(settings.modelProviders);
  const openAiProvider = record(providerMap?.openai);
  const openAiEntries = Array.isArray(providerMap?.openai)
    ? providerMap.openai
    : Array.isArray(openAiProvider?.models)
      ? openAiProvider.models
      : [];
  if (!baseUrl && selectedModel) {
    const selected = openAiEntries
      .map(record)
      .find((entry) => cleaned(entry?.id) === selectedModel);
    baseUrl = cleaned(selected?.baseUrl);
  }
  if (!baseUrl) {
    baseUrl = openAiEntries
      .map(record)
      .map((entry) => cleaned(entry?.baseUrl))
      .find(Boolean);
  }
  return token(accessToken, regionFromValue(baseUrl));
}

/** Pure: find an Alibaba-backed Claude profile without treating unrelated profile keys as Qwen. */
export function parseQwenClaudeProfiles(settings: SharedSettings): OAuthToken | undefined {
  for (const instance of Object.values(settings.agentInstances)) {
    if (instance.enabled === false || instance.driver !== "claude" || !instance.environment)
      continue;
    const baseUrl = cleaned(instance.environment.ANTHROPIC_BASE_URL?.value);
    const region = regionFromValue(baseUrl);
    if (!region || !baseUrl?.includes("dashscope.aliyuncs.com/apps/anthropic")) continue;
    const accessToken = cleaned(instance.environment.ANTHROPIC_AUTH_TOKEN?.value);
    if (accessToken) return token(accessToken, region);
  }
  return undefined;
}

export function nativeQwenSettingsPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = cleaned(env.QWEN_HOME);
  const home = configured
    ? isAbsolute(configured)
      ? configured
      : resolve(configured)
    : join(homedir(), ".qwen");
  return join(home, "settings.json");
}

/** Resolve the same Coding Plan credential the user's Qwen/Claude integrations already use. */
export async function resolveQwenUsageToken(
  settingsPath?: string,
): Promise<OAuthToken | undefined> {
  const fromEnv = parseQwenUsageEnv(process.env);
  if (fromEnv) return fromEnv;

  try {
    const content = await readFile(nativeQwenSettingsPath(), "utf8");
    const fromQwen = parseQwenUsageSettings(content);
    if (fromQwen) return fromQwen;
  } catch {
    // Qwen Code is optional; continue to the Claude profile source.
  }

  return settingsPath
    ? parseQwenClaudeProfiles(readSupervisorSharedSettings(settingsPath))
    : undefined;
}
