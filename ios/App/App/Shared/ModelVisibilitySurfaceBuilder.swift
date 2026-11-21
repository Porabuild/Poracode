import Foundation

enum ModelVisibilitySurfaceBuilder {
  static func surfaces(_ agent: AgentStatusRecord) -> [ModelVisibilitySurface] {
    let root = agent.capabilities
    let modes = root["presentationModes"]?.arrayValue?.compactMap { $0.stringValue.flatMap(ThreadPresentationMode.init(rawValue:)) }
      ?? [root["presentationMode"]?.stringValue.flatMap(ThreadPresentationMode.init(rawValue:)) ?? .terminal]
    let variants = agent.raw["runtimeVariants"]?.objectValue ?? [:]
    if variants.isEmpty && !modes.contains(where: { distinctCatalog(root, mode: $0) }) {
      // The PWA's ordinary row uses the root capabilities and plain kind key.
      return make(agent, mode: modes.first ?? .terminal, capabilities: root, runtime: nil, ordinary: true).map { [$0] } ?? []
    }
    let surfaces = modes.flatMap { mode -> [ModelVisibilitySurface] in
      let matching = variants.keys.sorted().filter {
        let variant = variants[$0]
        return variant?["installed"]?.boolValue == true && variant?["authState"]?.stringValue == "authenticated"
          && variant?["presentationMode"]?.stringValue == mode.rawValue
      }
      if !matching.isEmpty {
        return matching.compactMap { runtime in
          guard let capabilities = variants[runtime]?["capabilities"]?.objectValue else { return nil }
          return make(agent, mode: mode, capabilities: capabilities, runtime: runtime)
        }
      }
      let capabilities = HomeComposerCatalog.capabilities(for: agent, presentationMode: mode)
      let label = capabilities["runtimeLabel"]?.stringValue?.lowercased()
      let runtime = label.flatMap { variants[$0]?["presentationMode"]?.stringValue == mode.rawValue ? $0 : nil }
      return make(agent, mode: mode, capabilities: capabilities, runtime: runtime).map { [$0] } ?? []
    }
    let counts = Dictionary(grouping: surfaces, by: \.label)
    return surfaces.enumerated().map { index, surface in
      guard (counts[surface.label]?.count ?? 0) > 1 else { return surface }
      let suffix = surface.id.split(separator: ":").dropFirst(2).first.map(String.init)?.uppercased() ?? String(index + 1)
      return .init(id: surface.id, label: "\(surface.label) \(suffix)", mode: surface.mode, key: surface.key,
        capabilities: surface.capabilities, rows: surface.rows)
    }
  }

  private static func distinctCatalog(_ capabilities: [String: JSONValue], mode: ThreadPresentationMode) -> Bool {
    guard let models = capabilities["presentationCapabilities"]?[mode.rawValue]?["models"]?.arrayValue else { return false }
    let root = capabilities["models"]?.arrayValue ?? []
    let ids = Set(root.compactMap { $0["id"]?.stringValue })
    return models.count != root.count || models.contains { $0["id"]?.stringValue.map { !ids.contains($0) } ?? true }
  }

  private static func make(_ agent: AgentStatusRecord, mode: ThreadPresentationMode,
    capabilities: [String: JSONValue], runtime: String?, ordinary: Bool = false) -> ModelVisibilitySurface? {
    let key = ordinary ? agent.kind : ProviderUIRegistry.bundled?.visibilityKey(for: agent.kind, mode: mode, runtime: runtime)
      ?? (mode == .gui ? runtime.map { "\(agent.kind)-\($0.lowercased())" } ?? agent.kind : agent.kind)
    let id = ordinary ? agent.kind : [agent.kind, mode.rawValue, runtime].compactMap { $0 }.joined(separator: ":")
    let label: String
    if !ordinary, runtime != nil, let declared = capabilities["runtimeLabel"]?.stringValue { label = declared }
    else if mode == .terminal, let legacy = ProviderUIRegistry.bundled?.terminalRuntimeLabel(for: agent.kind) { label = legacy }
    else { label = mode == .gui ? ModelVisibilityStrings.chat : ModelVisibilityStrings.terminal }
    let rows = ModelVisibilityRows.surface(id: id, key: key, capabilities: capabilities, provider: agent.label, surface: label)
    guard !rows.isEmpty else { return nil }
    return .init(id: id, label: label, mode: mode, key: key, capabilities: capabilities, rows: rows)
  }
}
