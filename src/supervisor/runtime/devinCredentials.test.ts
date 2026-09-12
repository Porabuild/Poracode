import type { OAuthToken } from "@poracode/agents-usage";
import { afterEach, describe, expect, it, vi } from "vitest";
const readDevinCredentials = vi.hoisted(() => vi.fn<() => Promise<OAuthToken | undefined>>());
vi.mock("../agents/devin/credentials", () => ({ readDevinCredentials }));
import { resolveDevinToken } from "./devinCredentials";

describe("Devin usage credentials", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  it("prefers the environment key without forwarding a file endpoint", async () => {
    vi.stubEnv("WINDSURF_API_KEY", " env-example ");
    expect(await resolveDevinToken()).toEqual({ accessToken: "env-example" });
    expect(readDevinCredentials).not.toHaveBeenCalled();
  });
  it("uses the credential file when the env key is empty", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "");
    readDevinCredentials.mockResolvedValue({ accessToken: "file-example" });
    expect(await resolveDevinToken()).toEqual({ accessToken: "file-example" });
  });
  it("returns no credential when signed out", async () => {
    vi.stubEnv("WINDSURF_API_KEY", "");
    readDevinCredentials.mockResolvedValue(undefined);
    expect(await resolveDevinToken()).toBeUndefined();
  });
});
