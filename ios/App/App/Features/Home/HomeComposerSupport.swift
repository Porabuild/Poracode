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
    var config = ThreadConfig.empty
    config.model = effectiveConfiguration?.model ?? ""
    // Inside a model-bound family this is the encoded ladder reachable from
    // the current member; otherwise the ordinary advertised ladder.
    return ModelFamilies.efforts(capabilities, config: config)
  }

  var supportsFast: Bool {
    guard let agent = selectedAgent, let model = effectiveConfiguration?.model else { return false }
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: presentationMode)
    var config = ThreadConfig.empty
    config.model = model
    // Inside a model-bound family an opposite-Fast sibling must exist;
    // otherwise the ordinary fastModels capability applies.
    return ModelFamilies.fastAvailable(capabilities, config: config)
  }

  /// The picker rows for one agent: hidden ids removed (user override, then
  /// provider defaults), the current selection re-admitted so a configured
  /// hidden model stays labeled, resumable, and check-marked.
  func modelOptions(for agent: AgentStatusRecord) -> [HomeComposerModel] {
    let options = HomeComposerCatalog.pickerModels(
      for: agent,
      presentationMode: presentationMode,
      userHiddenModels: hiddenModels,
      currentModelID: selectedModel ?? defaults?.configuration.model
    )
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
    HomeComposerCatalog.defaultEffort(
      capabilities: HomeComposerCatalog.capabilities(
        for: agent, presentationMode: presentationMode),
      modelID: modelID
    )
  }

  /// Reads the host settings document once so the saved visibility lists
  /// reach the model pickers. An unavailable document (offline, no lease) is
  /// not a failure — the provider's advertised defaults still apply.
  func loadVisibilityOverrides() async {
    visibilityDocument.activate(session.currentSettingsHostSelection?.lease)
    guard visibilityDocument.document == nil else {
      hiddenModels = visibilityDocument.document?.hiddenModels ?? [:]
      return
    }
    await visibilityDocument.load()
    hiddenModels = visibilityDocument.document?.hiddenModels ?? [:]
  }

  /// The launch/selection trigger label: a projected family member reads as
  /// its family row (desktop parity); every other id keeps its raw native
  /// label or the normalized fallback.
  var modelLabel: String {
    guard let agent = selectedAgent, let modelID = effectiveConfiguration?.model else {
      return HomeStrings.model
    }
    if let family = ModelFamilies.family(
      for: modelID,
      in: HomeComposerCatalog.capabilities(for: agent, presentationMode: presentationMode))
    {
      return family.label
    }
    return modelOptions(for: agent).first(where: { $0.modelID == modelID })?.label
      ?? HomeComposerCatalog.normalizedLabel(
        agentKind: agent.kind, modelID: modelID, advertisedLabel: modelID)
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
          chromeMcp: object["chromeMcp"]?.boolValue,
          executionEnvironment: Self.draftExecutionEnvironment(object)
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

  /// Draft configs share the thread-config shape (`providerDraftConfigSchema`),
  /// so a saved draft can pin the WSL execution environment. Dropping it here
  /// would silently retarget a pinned distro on the next quick compose.
  private static func draftExecutionEnvironment(
    _ object: [String: JSONValue]
  ) -> RemoteExecutionEnvironment? {
    guard let environment = object["executionEnvironment"]?.objectValue,
      let kind = environment["kind"]?.stringValue,
      let distro = environment["distro"]?.stringValue
    else { return nil }
    return RemoteExecutionEnvironment(kind: kind, distro: distro)
  }

  private func launchModel(
    for agent: AgentStatusRecord,
    preferredID: String? = nil
  ) -> HomeComposerModel? {
    // The raw inventory resolves preferred ids first: a family member keeps
    // its exact UID and native label even though the picker projects one row
    // per family. Restores never widen or rewrite the saved choice.
    let rawModels = HomeComposerCatalog.models(for: agent, presentationMode: presentationMode)
    if let preferredID, let advertised = rawModels.first(where: { $0.modelID == preferredID }) {
      return advertised
    }
    let models = HomeComposerCatalog.pickerModels(for: agent, presentationMode: presentationMode)
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

  // MARK: Family-aware common controls

  /// The derived family view of the current selection. Inside a model-bound
  /// family Effort/Fast are encoded in the member UID, so the displayed values
  /// come from the relation while the saved carriers stay inert. `nil` outside
  /// any family — the raw selection state is the display.
  var composerFamilyDisplay: ModelFamilyDisplay? {
    guard let agent = selectedAgent else { return nil }
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: presentationMode)
    var config = ThreadConfig.empty
    config.model = effectiveConfiguration?.model ?? ""
    config.effort = selectedEffort
    config.fast = fast
    return ModelFamilies.displayConfig(capabilities, config: config)
  }

  var composerDisplayedEffort: String? {
    composerFamilyDisplay?.effort ?? effectiveConfiguration?.effort
  }

  var composerDisplayedFast: Bool {
    composerFamilyDisplay?.fast ?? fast
  }

  /// Explicit Effort pick at the control boundary. Inside a model-bound family
  /// this resolves the one-axis tuple to the exact sibling UID (inert seeds,
  /// no sibling guessing); otherwise it is the ordinary independent carrier.
  func applyComposerEffort(_ effort: String) {
    guard let agent = selectedAgent else {
      selectedEffort = effort
      return
    }
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: presentationMode)
    var config = ThreadConfig.empty
    config.model = effectiveConfiguration?.model ?? ""
    config.effort = selectedEffort
    config.fast = fast
    guard let patch = ModelFamilies.apply(.effort(effort), to: config, capabilities: capabilities)
    else { return }
    applyComposerPatch(patch)
  }

  /// Explicit Fast toggle at the control boundary — same resolution rule as
  /// the Effort pick. The displayed state flips only when the relation admits
  /// the opposite-Fast sibling.
  func applyComposerFastToggle() {
    guard let agent = selectedAgent else {
      fast.toggle()
      return
    }
    let capabilities = HomeComposerCatalog.capabilities(
      for: agent, presentationMode: presentationMode)
    var config = ThreadConfig.empty
    config.model = effectiveConfiguration?.model ?? ""
    config.effort = selectedEffort
    config.fast = fast
    let target = !composerDisplayedFast
    guard let patch = ModelFamilies.apply(.fast(target), to: config, capabilities: capabilities)
    else { return }
    applyComposerPatch(patch)
  }

  private func applyComposerPatch(_ patch: ModelSelectionPatch) {
    if let model = patch.model { selectedModel = model }
    if let effort = patch.effort { selectedEffort = effort }
    if let fast = patch.fast { self.fast = fast }
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
      chromeMcp: configuration.chromeMcp,
      executionEnvironment: configuration.executionEnvironment
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
      chromeMcp: configuration.chromeMcp,
      executionEnvironment: configuration.executionEnvironment
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
  /// Provider-content pricing/cost text, surfaced verbatim as a muted row
  /// hint. Projected family rows never carry one — the representative's cost
  /// does not describe the whole family.
  var modelDescription: String? = nil

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
        "modelFamilies",
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
        ),
        modelDescription: object["description"]?.stringValue
      )
    } ?? []
  }

  /// The static independent effort default for one model: absent inside a
  /// model-bound effort family (the coordinate is encoded in the member UID
  /// and displayed from the relation), otherwise the advertised per-model or
  /// global default.
  static func defaultEffort(
    capabilities: [String: JSONValue], modelID: String
  ) -> String? {
    if let family = ModelFamilies.family(for: modelID, in: capabilities),
      family.bindings.effort == .model
    {
      return nil
    }
    return capabilities["modelDefaultEfforts"]?.objectValue?[modelID]?.stringValue
      ?? capabilities["defaultEffort"]?.stringValue
  }

  /// The composer's visible model list: the raw inventory with the
  /// user/provider hidden ids removed (the current selection re-admitted so a
  /// configured model stays labeled and resumable), then every represented
  /// family member collapsed into one labeled family row at the
  /// representative's position. Without a valid descriptor this is the
  /// visibility-filtered `models` — surfaces that must keep exact choices
  /// (schedules, handoff) stay on `models`.
  static func pickerModels(
    for agent: AgentStatusRecord,
    presentationMode: ThreadPresentationMode,
    userHiddenModels: [String: [String]]? = nil,
    currentModelID: String? = nil
  ) -> [HomeComposerModel] {
    let capability = capabilities(for: agent, presentationMode: presentationMode)
    let raw = models(for: agent, presentationMode: presentationMode)
    guard !raw.isEmpty else { return [] }
    let hidden = ModelVisibility.hiddenModelIDs(
      capabilities: capability,
      userHiddenModels: userHiddenModels,
      agentKind: agent.kind,
      runtimeVariant: ModelVisibility.declaredGUIVariant(
        for: agent, presentationMode: presentationMode)
    )
    let visibleIDs = ModelVisibility.visiblePickerIDs(
      from: raw.map(\.modelID),
      hidden: hidden,
      currentModelID: currentModelID
    )
    let visibleIDsSet = Set(visibleIDs)
    let visible = raw.filter { visibleIDsSet.contains($0.modelID) }
    // The projection intersects against the VISIBLE inventory, so hidden
    // members leave the relation and a hidden representative substitutes
    // instead of silently dropping member rows.
    let projected = ModelFamilies.pickerModels(
      accepted: visible.map { (id: $0.modelID, label: $0.label) },
      capabilities: capability,
      acceptedIDs: visibleIDsSet
    )
    guard projected.map(\.id) != visible.map(\.modelID) else { return visible }
    let labels = Dictionary(uniqueKeysWithValues: raw.map { ($0.modelID, $0) })
    let familyRowIDs = Set(
      ModelFamilies.project(capability, accepted: visibleIDsSet).map(\.model))
    return projected.map { row in
      // A projected family row stands for all of its members: it never claims
      // the representative's cost as the family's price.
      if familyRowIDs.contains(row.id) {
        return HomeComposerModel(
          agentKind: agent.kind,
          modelID: row.id,
          label: row.label,
          subProviderLabel: labels[row.id]?.subProviderLabel,
          modelDescription: nil
        )
      }
      if let exact = labels[row.id], exact.label == row.label {
        return exact
      }
      return HomeComposerModel(
        agentKind: agent.kind,
        modelID: row.id,
        label: row.label,
        subProviderLabel: labels[row.id]?.subProviderLabel,
        modelDescription: labels[row.id]?.modelDescription
      )
    }
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
