import { createComponent } from "solid-js";
import type { Plugin } from "@opencode/plugin/tui";
import { parsePairingUrlParts } from "@/shared/remote/pairingUrl";
import type { TuiServer, TuiServerSwitchTarget } from "@/shared/tuiServers";
import { SlotText } from "./slotText";

export type SavedServer = TuiServer & { signedIn: boolean };
type Choice = { kind: "local" } | { kind: "server"; server: SavedServer } | { kind: "pair" };

/** Picker rows: this computer, each saved server, then pairing a new one. */
export function serverChoices(currentId: string | undefined, saved: readonly SavedServer[]) {
  const connected = (id: string | undefined) => (id === currentId ? " (connected)" : "");
  return [
    {
      title: `This computer${connected(undefined)}`,
      description: "The local Poracode host",
      value: { kind: "local" } as Choice,
    },
    ...saved.map((server) => ({
      title: `${server.name}${connected(server.id)}`,
      description: server.signedIn ? server.endpoint : `${server.endpoint} · pair again`,
      value: { kind: "server", server } as Choice,
    })),
    {
      title: "Pair a new server…",
      description: "Paste a pairing link",
      value: { kind: "pair" } as Choice,
    },
  ];
}

/** The status label: the remote host's name, or "local" once others are saved. */
export function serverLabel(current: { name: string } | undefined, savedCount: number) {
  if (current) return `Server · ${current.name}`;
  return savedCount > 0 ? "Server · local" : null;
}

type ServerAdapter = {
  server: { id: string; name: string } | undefined;
  savedServers: () => SavedServer[];
  requestServerSwitch: (target: TuiServerSwitchTarget) => void;
};

/**
 * "Switch server": the TUI holds one host connection, so switching records
 * the target and exits; the poracode CLI relaunches against it.
 */
export function registerServerUi(context: Plugin.Context, adapter: ServerAdapter) {
  const label = () => serverLabel(adapter.server, adapter.savedServers().length);
  for (const append of ["home.footer.status", "prompt.footer.status"] as const)
    context.ui.slot({ append, render: () => createComponent(SlotText, { value: label }) });

  const askForLink = async (): Promise<TuiServerSwitchTarget | undefined> => {
    const link = (
      await context.ui.dialog.prompt({
        title: "Pairing link",
        description:
          "On the other host, open Settings → Remote Access and copy its pairing link (or run poracode pair --scope operator there).",
        placeholder: "https://…#token=…",
      })
    )?.trim();
    if (!link) return undefined;
    if (!parsePairingUrlParts(link)) {
      await context.ui.dialog.alert({
        title: "Pairing link",
        message: "That is not a Poracode pairing link.",
      });
      return undefined;
    }
    const name = (
      await context.ui.dialog.prompt({
        title: "Server name",
        description: "Shown in the server picker. Leave empty to use its host name.",
      })
    )?.trim();
    return { kind: "pair", pairingUrl: link, ...(name ? { name } : {}) };
  };

  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "poracode.server.switch",
        title: "Switch server",
        group: "Poracode",
        palette: true,
        run: async () => {
          const choice = await context.ui.dialog.select<Choice>({
            title: "Servers",
            options: serverChoices(adapter.server?.id, adapter.savedServers()),
          });
          if (!choice) return;
          let target: TuiServerSwitchTarget | undefined;
          let name: string;
          if (choice.kind === "local") {
            if (!adapter.server) return;
            target = { kind: "local" };
            name = "this computer";
          } else if (choice.kind === "server") {
            if (choice.server.id === adapter.server?.id) return;
            // An expired or revoked session can only be renewed from that host.
            target = choice.server.signedIn
              ? { kind: "server", id: choice.server.id }
              : await askForLink();
            name = choice.server.name;
          } else {
            target = await askForLink();
            name = target?.kind === "pair" ? (target.name ?? "the new server") : "";
          }
          if (!target) return;
          const confirmed = await context.ui.dialog.confirm({
            title: "Switch server",
            message: `Reconnect to ${name}? Poracode restarts on that server; running threads keep running.`,
          });
          if (!confirmed) return;
          adapter.requestServerSwitch(target);
          context.keymap.dispatch("app.exit");
        },
      },
    ],
  }));
}
