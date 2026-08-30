import Foundation

extension HomeQuickComposeView {
  var currentBranch: String? {
    guard let project = selectedProject else { return nil }
    return session.threads(for: project.id)
      .compactMap { session.state.replay.summary(forThread: $0.id)?.branch.nilIfBlank }
      .first
  }

  var availableAgents: [AgentStatusRecord] {
    HomeComposerCatalog.availableAgents(
      from: session.state.replay.agentStatuses.ordered,
      presentationMode: presentationMode
    ).filter { $0.kind != launchSeed?.excludedAgentKind }
  }

  func supportsPresentationMode(_ mode: ThreadPresentationMode) -> Bool {
    HomeComposerCatalog.availableAgents(
      from: session.state.replay.agentStatuses.ordered,
      presentationMode: mode
    ).contains { $0.kind != launchSeed?.excludedAgentKind }
  }

  var effortOptions: [String] {
    guard let agent = selectedAgent else { return [] }
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: presentationMode)
    let model = effectiveConfiguration?.model ?? ""
    let modelEfforts =
      capabilities["modelEfforts"]?.objectValue?[model]?.arrayValue?
      .compactMap(\.stringValue) ?? []
    return modelEfforts.isEmpty
      ? capabilities["efforts"]?.arrayValue?.compactMap(\.stringValue) ?? []
      : modelEfforts
  }

  var supportsFast: Bool {
    guard let agent = selectedAgent, let model = effectiveConfiguration?.model else { return false }
    return HomeComposerCatalog.capabilities(for: agent, presentationMode: presentationMode)[
      "fastModels"
    ]?.arrayValue?
    .compactMap(\.stringValue).contains(model) == true
  }

  func modelOptions(for agent: AgentStatusRecord) -> [HomeComposerModel] {
    let options = HomeComposerCatalog.models(for: agent, presentationMode: presentationMode)
    if !options.isEmpty { return options }
    guard agent.kind == defaults?.agentKind, let model = defaults?.configuration.model else {
      return []
    }
    return [
      HomeComposerModel(
        agentKind: agent.kind,
        modelID: model,
        label: HomeComposerCatalog.normalizedLabel(
          agentKind: agent.kind, modelID: model, advertisedLabel: model)
      )
    ]
  }

  func defaultEffort(for agent: AgentStatusRecord, modelID: String) -> String? {
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: presentationMode)
    return capabilities["modelDefaultEfforts"]?.objectValue?[modelID]?.stringValue
      ?? capabilities["defaultEffort"]?.stringValue
  }

  func launchDefaults(for project: RemoteProject) -> HomeThreadLaunchDefaults? {
    if let object = project.lastDraftConfig?.objectValue,
      let agentKind = object["agentKind"]?.stringValue?.nilIfBlank,
      let agent = availableAgents.first(where: { $0.kind == agentKind }),
      let model = launchModel(
        for: agent,
        preferredID: object["model"]?.stringValue?.nilIfBlank
      )
    {
      return HomeThreadLaunchDefaults(
        agentKind: agentKind,
        agentInstanceID: nil,
        configuration: ThreadLaunchConfiguration(
          model: model.modelID,
          effort: object["effort"]?.stringValue,
          contextSize: object["contextSize"]?.stringValue,
          fast: object["fast"]?.boolValue,
          thinking: object["thinking"]?.boolValue,
          mode: object["mode"]?.stringValue,
          approvalPolicy: object["approvalPolicy"]?.stringValue,
          approvalsReviewer: object["approvalsReviewer"]?.stringValue,
          sandboxMode: object["sandboxMode"]?.stringValue,
          browserMcp: object["browserMcp"]?.boolValue,
          crossagentMcp: object["crossagentMcp"]?.boolValue,
          computerUse: object["computerUse"]?.boolValue,
          chromeMcp: object["chromeMcp"]?.boolValue
        )
      )
    }
    let presentationThreads = session.threads(for: project.id).filter {
      ThreadPresentationFilter.matches(
        $0.presentationMode,
        mode: presentationMode.rawValue
      )
    }
    if let thread = presentationThreads.max(by: { $0.updatedAt < $1.updatedAt }),
      let agent = availableAgents.first(where: { $0.kind == thread.agentKind }),
      let model = launchModel(for: agent, preferredID: thread.config.model)
    {
      var configuration = thread.config.lifecycleLaunchConfiguration
      configuration.model = model.modelID
      return HomeThreadLaunchDefaults(
        agentKind: thread.agentKind,
        agentInstanceID: thread.agentInstanceId,
        configuration: configuration
      )
    }
    guard let agent = availableAgents.first, let model = launchModel(for: agent) else {
      return nil
    }
    return HomeThreadLaunchDefaults(
      agentKind: agent.kind,
      agentInstanceID: nil,
      configuration: ThreadLaunchConfiguration(
        model: model.modelID,
        effort: defaultEffort(for: agent, modelID: model.modelID)
      )
    )
  }

  private func launchModel(
    for agent: AgentStatusRecord,
    preferredID: String? = nil
  ) -> HomeComposerModel? {
    let models = HomeComposerCatalog.models(for: agent, presentationMode: presentationMode)
    if let advertised = preferredID.flatMap({ preferred in
      models.first { $0.modelID == preferred }
    }) {
      return advertised
    }
    if let preferredID = preferredID?.nilIfBlank {
      return HomeComposerModel(
        agentKind: agent.kind,
        modelID: preferredID,
        label: HomeComposerCatalog.normalizedLabel(
          agentKind: agent.kind,
          modelID: preferredID,
          advertisedLabel: preferredID
        ),
        subProviderLabel: nil
      )
    }
    return models.first
  }

  var targetConfiguration: ThreadLaunchConfiguration? {
    guard let agent = selectedAgent else { return nil }
    let model =
      selectedModel
      ?? (agent.kind == defaults?.agentKind ? defaults?.configuration.model : nil)
      ?? modelOptions(for: agent).first?.modelID
    guard let model else { return nil }
    let baseConfiguration =
      configuredConfiguration
      ?? (agent.kind == defaults?.agentKind ? defaults?.configuration : nil)
    if var configuration = baseConfiguration {
      configuration.model = model
      configuration.effort = selectedEffort ?? configuration.effort
      configuration.fast = fast
      configuration.browserMcp = browserMcp ?? configuration.browserMcp
      configuration.crossagentMcp = crossagentMcp ?? configuration.crossagentMcp
      configuration.computerUse = computerUse ?? configuration.computerUse
      configuration.chromeMcp = chromeMcp ?? configuration.chromeMcp
      return configuration
    }
    return ThreadLaunchConfiguration(
      model: model,
      effort: selectedEffort ?? defaultEffort(for: agent, modelID: model),
      fast: fast,
      browserMcp: browserMcp,
      crossagentMcp: crossagentMcp,
      computerUse: computerUse,
      chromeMcp: chromeMcp
    )
  }

  func openComposerControls() {
    guard let configuration = targetConfiguration else { return }
    controlsConfiguration = ThreadConfig(configuration)
    selector = nil
    DispatchQueue.main.async { showingComposerControls = true }
  }

  func applyComposerControls(_ configuration: ThreadConfig) {
    configuredConfiguration = ThreadLaunchConfiguration(configuration)
    selectedModel = configuration.model
    selectedEffort = configuration.effort
    fast = configuration.fast == true
    browserMcp = configuration.browserMcp
    crossagentMcp = configuration.crossagentMcp
    computerUse = configuration.computerUse
    chromeMcp = configuration.chromeMcp
    permissionMode = .configured
  }
}

extension ThreadConfig {
  init(_ configuration: ThreadLaunchConfiguration) {
    self.init(
      model: configuration.model,
      effort: configuration.effort,
      contextSize: configuration.contextSize,
      fast: configuration.fast,
      thinking: configuration.thinking,
      mode: configuration.mode,
      approvalPolicy: configuration.approvalPolicy,
      approvalsReviewer: configuration.approvalsReviewer,
      sandboxMode: configuration.sandboxMode,
      browserMcp: configuration.browserMcp,
      crossagentMcp: configuration.crossagentMcp,
      computerUse: configuration.computerUse,
      chromeMcp: configuration.chromeMcp
    )
  }
}

extension ThreadLaunchConfiguration {
  init(_ configuration: ThreadConfig) {
    self.init(
      model: configuration.model,
      effort: configuration.effort,
      contextSize: configuration.contextSize,
      fast: configuration.fast,
      thinking: configuration.thinking,
      mode: configuration.mode,
      approvalPolicy: configuration.approvalPolicy,
      approvalsReviewer: configuration.approvalsReviewer,
      sandboxMode: configuration.sandboxMode,
      browserMcp: configuration.browserMcp,
      crossagentMcp: configuration.crossagentMcp,
      computerUse: configuration.computerUse,
      chromeMcp: configuration.chromeMcp
    )
  }
}

struct HomeThreadLaunchDefaults {
  let agentKind: String
  let agentInstanceID: String?
  let configuration: ThreadLaunchConfiguration
}

struct HomeComposerModel: Identifiable, Equatable {
  let agentKind: String
  let modelID: String
  let label: String
  var subProviderLabel: String?

  var id: String { "\(agentKind)\u{0}\(modelID)" }

  func matches(_ search: String) -> Bool {
    let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return true }
    return [label, modelID, subProviderLabel ?? "", agentKind]
      .contains { $0.localizedCaseInsensitiveContains(query) }
  }
}

struct HomeComposerBranchSelection: Equatable {
  let branch: String
  var worktreePath: String?

  var reusesWorktree: Bool { worktreePath != nil }
}

enum HomeComposerCatalog {
  static func preferredPresentationMode(
    from agents: [AgentStatusRecord]
  ) -> ThreadPresentationMode {
    if !availableAgents(from: agents, presentationMode: .gui).isEmpty {
      return .gui
    }
    if !availableAgents(from: agents, presentationMode: .terminal).isEmpty {
      return .terminal
    }
    return .gui
  }

  static func availableAgents(
    from agents: [AgentStatusRecord],
    presentationMode: ThreadPresentationMode
  ) -> [AgentStatusRecord] {
    agents.filter {
      $0.installed
        && supportsPresentation($0, mode: presentationMode)
    }
  }

  static func supportsPresentation(
    _ agent: AgentStatusRecord,
    mode: ThreadPresentationMode
  ) -> Bool {
    let capabilities = agent.capabilities
    if let modes = capabilities["presentationModes"]?.arrayValue?.compactMap(\.stringValue),
      !modes.isEmpty
    {
      return modes.contains(mode.rawValue)
    }
    if let single = capabilities["presentationMode"]?.stringValue, !single.isEmpty {
      return single == mode.rawValue
    }
    return true
  }

  static func capabilities(
    for agent: AgentStatusRecord,
    presentationMode: ThreadPresentationMode
  ) -> [String: JSONValue] {
    var resolved = agent.capabilities
    if let override = resolved["presentationCapabilities"]?.objectValue?[presentationMode.rawValue]?
      .objectValue
    {
      for key in [
        "models", "efforts", "modelEfforts", "defaultEffort", "modelDefaultEfforts",
        "defaultHiddenModels", "contextSizes", "modelContextSizes", "defaultContextSize",
        "fastModels", "thinkingModels", "subProviders", "modelSubProvider",
      ] {
        resolved.removeValue(forKey: key)
      }
      resolved.merge(override) { _, scoped in scoped }
      resolved["models"] = override["models"] ?? .array([])
      resolved["efforts"] = override["efforts"] ?? .array([])
      resolved["modelEfforts"] = override["modelEfforts"] ?? .object([:])
    }

    guard let runtimeLabel = resolved["runtimeLabel"]?.stringValue?.lowercased(),
      let variant = agent.raw["runtimeVariants"]?.objectValue?[runtimeLabel]?.objectValue,
      variant["presentationMode"]?.stringValue == presentationMode.rawValue,
      let runtimeCapabilities = variant["capabilities"]?.objectValue
    else { return resolved }
    return runtimeCapabilities
  }

  static func models(
    for agent: AgentStatusRecord,
    presentationMode: ThreadPresentationMode
  ) -> [HomeComposerModel] {
    let capability = capabilities(for: agent, presentationMode: presentationMode)
    return capability["models"]?.arrayValue?.compactMap { value in
      guard let object = value.objectValue,
        let modelID = object["id"]?.stringValue,
        !modelID.isEmpty
      else { return nil }
      let advertisedLabel = object["label"]?.stringValue ?? modelID
      return HomeComposerModel(
        agentKind: agent.kind,
        modelID: modelID,
        label: normalizedLabel(
          agentKind: agent.kind, modelID: modelID, advertisedLabel: advertisedLabel),
        subProviderLabel: subProviderLabel(
          modelID: modelID,
          capability: capability,
          providerLabel: agent.label
        )
      )
    } ?? []
  }

  static func normalizedLabel(
    agentKind: String,
    modelID: String,
    advertisedLabel: String
  ) -> String {
    let baseID = modelID.replacingOccurrences(
      of: #"\[[^\]]*\]"#,
      with: "",
      options: .regularExpression
    )
    var label = advertisedLabel
    if advertisedLabel == modelID || advertisedLabel == baseID {
      label = familyLabel(baseID) ?? humanized(baseID)
    } else if agentKind == "codex", modelID.lowercased().hasPrefix("gpt-"),
      !advertisedLabel.localizedCaseInsensitiveContains("GPT"),
      advertisedLabel.first?.isNumber == true
    {
      label = "GPT-\(advertisedLabel)"
    }

    if modelID.contains("["), let hints = bracketHints(modelID), !label.contains(hints) {
      label += " · \(hints)"
    }
    return label
  }

  private static func subProviderLabel(
    modelID: String,
    capability: [String: JSONValue],
    providerLabel: String
  ) -> String? {
    let explicit = capability["modelSubProvider"]?.objectValue?[modelID]?.stringValue
    let derived =
      explicit
      ?? modelID.firstIndex(where: { $0 == "/" || $0 == ":" }).map {
        String(modelID[..<$0])
      }
    guard let id = derived, !id.isEmpty else { return nil }
    let label =
      capability["subProviders"]?.arrayValue?.compactMap(\.objectValue).first {
        $0["id"]?.stringValue == id
      }?["label"]?.stringValue ?? humanized(id)
    return label.localizedCaseInsensitiveCompare(providerLabel) == .orderedSame ? nil : label
  }

  private static func familyLabel(_ modelID: String) -> String? {
    let parts = modelID.split(separator: "-").map(String.init)
    guard !parts.isEmpty else { return nil }
    if parts.first?.lowercased() == "claude", parts.count >= 3 {
      let family = capitalized(parts[1])
      let version = parts.dropFirst(2).prefix(2).joined(separator: ".")
      return "\(family) \(version)"
    }
    if parts.first?.lowercased() == "gpt", parts.count >= 2 {
      return "GPT-" + parts.dropFirst().map(capitalized).joined(separator: " ")
    }
    if parts.first?.lowercased() == "gemini", parts.count >= 2 {
      return "Gemini " + parts.dropFirst().map(capitalized).joined(separator: " ")
    }
    if parts.first?.lowercased() == "composer", parts.count == 2 {
      return "Composer \(parts[1])"
    }
    if modelID == "default" || modelID == "auto" { return HomeStrings.auto }
    return nil
  }

  private static func bracketHints(_ modelID: String) -> String? {
    guard let open = modelID.firstIndex(of: "["), let close = modelID[open...].firstIndex(of: "]")
    else { return nil }
    let values = modelID[modelID.index(after: open)..<close].split(separator: ",")
    var hints: [String] = []
    for value in values {
      let pair = value.split(separator: "=", maxSplits: 1).map(String.init)
      guard pair.count == 2 else { continue }
      switch pair[0] {
      case "context": hints.append(pair[1].uppercased())
      case "reasoning", "effort":
        hints.append(pair[1].lowercased() == "xhigh" ? HomeStrings.extraHigh : capitalized(pair[1]))
      case "fast" where pair[1] == "true": hints.append(HomeStrings.fast)
      default: break
      }
    }
    return hints.isEmpty ? nil : hints.joined(separator: " · ")
  }

  private static func humanized(_ value: String) -> String {
    value.split(whereSeparator: { $0 == "-" || $0 == "_" || $0 == "/" })
      .map { capitalized(String($0)) }
      .joined(separator: " ")
  }

  private static func capitalized(_ value: String) -> String {
    guard let first = value.first else { return value }
    return String(first).uppercased() + value.dropFirst()
  }
}

enum HomeComposerSelector: String, Identifiable {
  case project, model, add
  var id: String { rawValue }
  var title: String {
    switch self {
    case .project: HomeStrings.project
    case .model: HomeStrings.model
    case .add: HomeStrings.context
    }
  }
}

enum HomeComposerPermission: String, CaseIterable, Identifiable {
  case auto, bypass, configured
  var id: String { rawValue }
  var label: String {
    switch self {
    case .auto: HomeStrings.auto
    case .bypass: HomeStrings.bypass
    case .configured: SettingsUIStrings.configurationSection
    }
  }
}

enum HomeComposerWorktree: String, CaseIterable, Identifiable {
  case branch, worktree, worktreeWithChanges
  var id: String { rawValue }
  var label: String {
    switch self {
    case .branch: HomeStrings.branch
    case .worktree: HomeStrings.worktree
    case .worktreeWithChanges: HomeStrings.worktreeWithChanges
    }
  }
  var icon: String {
    switch self {
    case .branch: "point.3.connected.trianglepath.dotted"
    case .worktree: "arrow.triangle.branch"
    case .worktreeWithChanges: "arrow.triangle.merge"
    }
  }
}

enum HomeComposerMCP: String, CaseIterable, Identifiable {
  case browser, crossagents, chrome, computerUse

  var id: String { rawValue }

  var label: String {
    switch self {
    case .browser: HomeStrings.browser
    case .crossagents: HomeStrings.crossagents
    case .chrome: HomeStrings.chrome
    case .computerUse: HomeStrings.computerUse
    }
  }

  var icon: String {
    switch self {
    case .browser: "globe"
    case .crossagents: "person.2"
    case .chrome: "rectangle"
    case .computerUse: "desktopcomputer"
    }
  }
}

enum HomeComposerPhotoKind {
  case photo, screenshot

  var filenamePrefix: String {
    switch self {
    case .photo: "photo"
    case .screenshot: "screenshot"
    }
  }
}

extension String {
  fileprivate var nilIfBlank: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}
