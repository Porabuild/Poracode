import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SshConnectionConfig } from "@/shared/ssh";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridge = vi.hoisted(() => ({
  sshDiscoverHosts: vi.fn<() => Promise<Array<{ alias: string }>>>(async () => [
    { alias: "build-box" },
  ]),
  pickFiles: vi.fn<() => Promise<string[]>>(async () => ["C:\\keys\\id_ed25519"]),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

import { SshConnectionForm } from "./SshConnectionForm";

describe("SshConnectionForm", () => {
  const pairSshServer = vi.fn<(connection: SshConnectionConfig) => Promise<RemoteServerRecord>>(
    async (connection) => ({
      desktopId: "remote-1",
      label: connection.label,
      endpoint: "http://127.0.0.1:39000/",
      accessToken: "token",
      scopes: [],
      transport: { kind: "ssh", connection },
    }),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    useRemoteServersStore.setState({ pairSshServer });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("discovers SSH aliases and connects with OpenSSH config or agent auth", async () => {
    const onConnected = vi.fn<() => void>();
    render(<SshConnectionForm onConnected={onConnected} onCancel={() => {}} />);

    await waitFor(() => expect(document.querySelector('option[value="build-box"]')).not.toBeNull());
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), {
      target: { value: "Build server" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "SSH hostname" }), {
      target: { value: "dev@build-box" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "SSH port" }), {
      target: { value: "2222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(pairSshServer).toHaveBeenCalledWith({
      id: expect.any(String),
      label: "Build server",
      target: "dev@build-box",
      port: 2222,
    });
  });

  it("uses a selected identity file when requested", async () => {
    const onConnected = vi.fn<() => void>();
    render(<SshConnectionForm onConnected={onConnected} onCancel={() => {}} />);

    await waitFor(() => expect(bridge.sshDiscoverHosts).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole("combobox", { name: "SSH hostname" }), {
      target: { value: "build-box" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Identity file" }));
    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Identity file path" })).toHaveValue(
        "C:\\keys\\id_ed25519",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(pairSshServer).toHaveBeenCalledWith(
      expect.objectContaining({ identityFile: "C:\\keys\\id_ed25519" }),
    );
  });
});
