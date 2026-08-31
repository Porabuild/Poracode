import { describe, expect, it } from "vitest";
import { Globe, Monitor, TerminalSquare } from "lucide-react";
import type { McpMentionItem, PluginMentionItem } from "./MentionInput";
import {
  pluginLabelsForMcpServers,
  pluginMentionsForAvailableMcp,
  withoutPluginBackedMcpMentions,
} from "./pluginBackedMcp";

const mcpMentions: McpMentionItem[] = [
  {
    id: "app-controls",
    name: "Terminal",
    icon: TerminalSquare,
    enabled: true,
    keepAlongsidePlugin: true,
  },
  { id: "browser", name: "Browser", icon: Globe, enabled: true },
  { id: "computer-use", name: "Computer Use", icon: Monitor, enabled: true },
];

function pluginMention(id: string, enablesMcpServerIds?: string[]): PluginMentionItem {
  return {
    id,
    name: id,
    command: { id, label: id, section: "skills" },
    ...(enablesMcpServerIds ? { enablesMcpServerIds } : {}),
  };
}

describe("withoutPluginBackedMcpMentions", () => {
  it("keeps a row that means something narrower than the plugin's skill", () => {
    // `@Terminal` reads the Terminal panel; `@App Controls` loads the whole app
    // skill. Same server, different intent, so the shortcut survives.
    const result = withoutPluginBackedMcpMentions(mcpMentions, [
      pluginMention("app-controls", ["app-controls"]),
    ]);

    expect(result.map((item) => item.id)).toEqual(["app-controls", "browser", "computer-use"]);
  });

  it("drops the MCP row a plugin already stands in for", () => {
    const result = withoutPluginBackedMcpMentions(mcpMentions, [
      pluginMention("browser-tools", ["browser"]),
      pluginMention("computer-use", ["computer-use"]),
    ]);

    expect(result.map((item) => item.id)).toEqual(["app-controls"]);
  });

  it("keeps every row when no plugin covers a built-in server", () => {
    const result = withoutPluginBackedMcpMentions(mcpMentions, [pluginMention("github")]);

    expect(result.map((item) => item.id)).toEqual(["app-controls", "browser", "computer-use"]);
  });

  it("restores a row once its plugin is no longer offered", () => {
    expect(withoutPluginBackedMcpMentions(mcpMentions, []).map((item) => item.id)).toEqual([
      "app-controls",
      "browser",
      "computer-use",
    ]);
  });
});

describe("pluginMentionsForAvailableMcp", () => {
  it("hides a plugin whose built-in server this composer cannot offer", () => {
    const offered = pluginMentionsForAvailableMcp(
      [
        pluginMention("browser-tools", ["browser"]),
        pluginMention("chrome-tools", ["chrome"]),
        pluginMention("github"),
      ],
      mcpMentions,
    );

    expect(offered.map((item) => item.id)).toEqual(["browser-tools", "github"]);
  });

  it("keeps plugins that bring their own server when no built-in is offered", () => {
    expect(pluginMentionsForAvailableMcp([pluginMention("github")], []).map((i) => i.id)).toEqual([
      "github",
    ]);
  });
});

describe("pluginLabelsForMcpServers", () => {
  it("names each wrapped server after the plugin that packages it", () => {
    expect(
      pluginLabelsForMcpServers([
        pluginMention("browser-tools", ["browser"]),
        pluginMention("computer-use", ["computer-use"]),
      ]),
    ).toEqual({ browser: "browser-tools", "computer-use": "computer-use" });
  });

  it("leaves servers no plugin covers to their own registry label", () => {
    expect(pluginLabelsForMcpServers([pluginMention("github")])).toEqual({});
    expect(pluginLabelsForMcpServers([])).toEqual({});
  });
});
