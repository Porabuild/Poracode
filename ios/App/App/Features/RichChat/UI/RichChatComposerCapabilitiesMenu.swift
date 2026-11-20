import SwiftUI

/// Existing-thread bindings are fixed at launch. Display only the flags and
/// overrides reported with this thread, never infer bindings from today's
/// global settings or change them through a composer menu.
struct RichChatComposerCapabilitiesMenu: View {
  let configuration: ThreadConfig

  private var enabledPlugins: [String] {
    let builtIns = RichChatMCPMentionCatalog.options.filter {
      switch $0.configKey {
      case .browser: configuration.browserMcp == true
      case .crossagents: configuration.crossagentMcp == true
      case .chrome: configuration.chromeMcp == true
      case .computerUse: configuration.computerUse == true
      case nil: false
      }
    }
    let knownIDs = Set(builtIns.map(\.id))
    let additional = (configuration.pluginOverrides ?? [:]).filter { $0.value && !knownIDs.contains($0.key) }.map(\.key).sorted()
    return builtIns.map(\.name) + additional
  }

  private var enabledServers: [String] {
    (configuration.mcpServerOverrides ?? [:]).filter(\.value).map(\.key).sorted()
  }

  var body: some View {
    Menu(RichChatStrings.plugins, systemImage: "puzzlepiece.extension") {
      if enabledPlugins.isEmpty { Text(RichChatStrings.noPluginsReported) }
      ForEach(enabledPlugins, id: \.self) { name in Label(name, systemImage: "checkmark") }
      Section { Text(RichChatStrings.sessionBindingsReadOnly) }
    }
    Menu(SettingsIntegrationsStrings.mcpServers, systemImage: "server.rack") {
      if enabledServers.isEmpty { Text(RichChatStrings.noMCPServersReported) }
      ForEach(enabledServers, id: \.self) { name in Label(name, systemImage: "checkmark") }
      Section { Text(RichChatStrings.sessionBindingsReadOnly) }
    }
  }
}
