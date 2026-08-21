import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { RemoteHostUpdateControl } from "./RemoteHostUpdateControl";

const server: RemoteServerRecord = {
  desktopId: "desktop-1",
  label: "Remote Mac",
  endpoint: "http://remote/",
  accessToken: "token",
  scopes: ["projects:manage"],
  appVersion: "1.0.0",
  hostMode: "desktop",
};

describe("RemoteHostUpdateControl", () => {
  beforeEach(() => {
    useRemoteServersStore.setState({
      hostUpdates: {},
      hostUpdateRestarts: {},
    });
  });

  it("shows a persistent restart status instead of update actions", () => {
    useRemoteServersStore.setState({
      hostUpdateRestarts: { "desktop-1": "1.1.0" },
    });

    render(<RemoteHostUpdateControl server={server} isOnline={false} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "The host is restarting to install the update.",
    );
    expect(screen.queryByRole("button", { name: /check for update/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /install/i })).not.toBeInTheDocument();
  });
});
