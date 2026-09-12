import type { OAuthToken } from "@poracode/agents-usage";
import { readDevinCredentials } from "../agents/devin/credentials";

export async function resolveDevinToken(): Promise<OAuthToken | undefined> {
  const key = process.env.WINDSURF_API_KEY?.trim();
  return key ? { accessToken: key } : readDevinCredentials();
}
