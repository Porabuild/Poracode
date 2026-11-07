import { describe, expect, it, vi } from "vitest";
import { ForgeApi, type ForgeHttp } from "./api";

describe("authenticated forge HTTP boundaries", () => {
  it("follows same-root diff redirects without forwarding credentials elsewhere", async () => {
    const send = vi
      .fn<ForgeHttp>()
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: "https://host.example/api/v1/repos/team/app/diff/a..b" },
        body: "",
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: "patch" });
    const api = new ForgeApi("https://host.example/api/v1", { Authorization: "fixture" }, send);
    expect(await api.text("repos/team/app/pulls/1.diff")).toBe("patch");
    expect(send).toHaveBeenCalledTimes(2);
  });
  it.each([
    "https://attacker.example/steal",
    "https://host.example/login",
    "https://user:pass@host.example/api/v1/user",
  ])("rejects credential escape via %s", async (next) => {
    const send = vi
      .fn<ForgeHttp>()
      .mockResolvedValue({ status: 302, headers: { location: next }, body: "" });
    const api = new ForgeApi("https://host.example/api/v1", { Authorization: "fixture" }, send);
    await expect(api.json("user")).rejects.toThrow(/outside/);
    expect(send).toHaveBeenCalledOnce();
  });
  it("paginates arrays and refuses foreign next-page links", async () => {
    const send = vi
      .fn<ForgeHttp>()
      .mockResolvedValueOnce({
        status: 200,
        headers: { link: '<https://host.example/api/v1/pulls?page=2>; rel="next"' },
        body: '[{"id":1}]',
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: { link: '<https://attacker.example/api/v1/pulls>; rel="next"' },
        body: '[{"id":2}]',
      });
    await expect(
      new ForgeApi("https://host.example/api/v1", {}, send).list("pulls"),
    ).rejects.toThrow(/outside/);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("paginates Bitbucket values, GitCafe cursors and Azure continuation tokens", async () => {
    for (const field of ["values", "items", "value"] as const) {
      const send = vi
        .fn<ForgeHttp>()
        .mockResolvedValueOnce({
          status: 200,
          headers: field === "value" ? { "x-ms-continuationtoken": "opaque" } : {},
          body: JSON.stringify({
            [field]: [{ id: 1 }],
            ...(field === "values"
              ? { next: "https://host.example/api/list?page=2" }
              : field === "items"
                ? { next: "opaque" }
                : {}),
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          body: JSON.stringify({ [field]: [{ id: 2 }] }),
        });
      expect(await new ForgeApi("https://host.example/api", {}, send).list("list", field)).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
      expect(send.mock.calls[1]?.[0].url).toContain(
        field === "values"
          ? "page=2"
          : field === "items"
            ? "after=opaque"
            : "continuationToken=opaque",
      );
    }
  });
  it("never retries a mutation or exposes a server error body", async () => {
    const send = vi
      .fn<ForgeHttp>()
      .mockResolvedValue({ status: 409, headers: {}, body: "sensitive-fixture-body" });
    await expect(
      new ForgeApi("https://host.example/api", {}, send).json("merge", "POST", {}),
    ).rejects.toThrow("HTTP 409");
    expect(send).toHaveBeenCalledOnce();
  });

  it("does not expose malformed response contents through JSON errors", async () => {
    const send = vi
      .fn<ForgeHttp>()
      .mockResolvedValue({ status: 200, headers: {}, body: "sensitive-fixture-body" });
    const api = new ForgeApi("https://host.example/api", {}, send);
    for (const read of [() => api.value("user"), () => api.list("pulls")]) {
      await expect(read()).rejects.toThrow(/invalid response/);
      await expect(read()).rejects.not.toThrow(/sensitive-fixture/);
    }
  });

  it("resolves relative pagination links against the current collection", async () => {
    const send = vi
      .fn<ForgeHttp>()
      .mockResolvedValueOnce({
        status: 200,
        headers: { link: '<?page=2>; rel="next"' },
        body: '[{"id":1}]',
      })
      .mockResolvedValueOnce({ status: 200, headers: {}, body: '[{"id":2}]' });
    expect(
      await new ForgeApi("https://host.example/api", {}, send).list("repos/team/app/pulls?page=1"),
    ).toHaveLength(2);
    expect(send.mock.calls[1]?.[0].url).toBe(
      "https://host.example/api/repos/team/app/pulls?page=2",
    );
  });
});
