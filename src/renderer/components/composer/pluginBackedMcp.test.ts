import { describe, expect, it } from "vitest";
import { Globe, Monitor, TerminalSquare } from "lucide-react";
import type { McpMentionItem, PluginMentionItem } from "./MentionInput";
import {
  pluginLabelsForMcpServers,
  pluginMentionsForAvailableMcp,
  withoutPluginBackedMcpMentions,
} from "./pluginBackedMcp";

const mcpMentions: McpMentionItem[] = [
  { id: "app-controls", name: "Terminal", icon: TerminalSquare, enabled: true },
  { id: "browser", name: "Browser", icon: Globe, enabled: true },
  { id: "computer-use", name: "Computer Use", icon: Monitor, enabled: true },
  { id: "figma-id", name: "Figma", icon: Globe, enabled: true },
  { id: "plugin:github:github", name: "github.github", icon: Globe, enabled: true },
  { id: "custom-github", name: "github.github", icon: Globe, enabled: true },
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
  it("never lists a built-in server or Terminal shortcut as an MCP mention", () => {
    // Those capabilities are plugins. Mentions only keep standalone servers.
    const result = withoutPluginBackedMcpMentions(mcpMentions, [
      pluginMention("app-controls", ["app-controls"]),
    ]);

    expect(result.map((item) => item.id)).toEqual(["figma-id", "custom-github"]);
  });

  it("drops plugin-declared servers even when no plugin row is currently offered", () => {
    const result = withoutPluginBackedMcpMentions(mcpMentions, []);

    expect(result.map((item) => item.id)).toEqual(["figma-id", "custom-github"]);
  });

  it("drops a namespaced plugin server when that plugin is in the mention list", () => {
    const result = withoutPluginBackedMcpMentions(mcpMentions, [pluginMention("github")]);

    expect(result.map((item) => item.id)).toEqual(["figma-id"]);
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
