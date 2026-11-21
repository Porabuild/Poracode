import Foundation

struct SettingsGenerationDraft: Equatable, Sendable {
  private(set) var provider: String
  private(set) var presentationMode: SettingsPresentationMode?
  private(set) var configuration: ThreadConfig
  private var usesCanonicalSelection: Bool

  init(
    provider: String, model: String, effort: String, fast: Bool,
    presentationMode: SettingsPresentationMode? = nil, selection: ThreadConfig? = nil
  ) {
    self.provider = provider
    self.presentationMode = presentationMode
    configuration = selection ?? ThreadConfig(model: model, effort: effort, fast: fast)
    usesCanonicalSelection = selection != nil
  }

  var model: String { configuration.model }
  var effort: String { configuration.effort ?? "" }
  var fast: Bool { configuration.fast ?? false }

  var selection: ThreadConfig? { usesCanonicalSelection ? configuration : nil }

  func displayEffort(for agent: SettingsAgentStatus) -> String {
    resolveEffort(model: model, effort: effort, for: agent)
  }

  private func resolveEffort(model: String, effort: String, for agent: SettingsAgentStatus)
    -> String
  {
    let choices = agent.efforts(forModel: model)
    if choices.contains(effort) { return effort }
    if let fallback = agent.defaultEffort, choices.contains(fallback) { return fallback }
    return choices.first ?? ""
  }

  mutating func chooseModel(_ id: String, for agent: SettingsAgentStatus) {
    let catalog = SettingsGenerationModelCatalog(agent: agent, presentation: presentationMode)
    if catalog.family(containing: id) != nil {
      applyModelChoice(.model(id), catalog: catalog)
      return
    }
    chooseOrdinaryModel(id, for: catalog.agent)
  }

  mutating func chooseModelRow(_ id: String, catalog: SettingsGenerationModelCatalog) {
    if catalog.family(containing: id)?.model == id {
      applyModelChoice(.family(id), catalog: catalog)
    } else {
      chooseOrdinaryModel(id, for: catalog.agent)
    }
  }

  private mutating func chooseOrdinaryModel(_ id: String, for agent: SettingsAgentStatus) {
    let nextEffort = resolveEffort(model: id, effort: effort, for: agent)
    let refreshCarriers = model != id || !usesCanonicalSelection
    apply(.exactModel) { next in
      guard refreshCarriers else { return }
      next.model = id
      next.effort = nextEffort
      if next.fast != nil && !agent.supportsFast(forModel: id) { next.fast = false }
    }
  }

  mutating func chooseProvider(_ kind: String, agent: SettingsAgentStatus?) {
    guard kind != provider else { return }
    provider = kind
    let catalog = agent.map {
      SettingsGenerationModelCatalog(agent: $0, presentation: presentationMode)
    }
    let model = catalog?.models.first?.id ?? ""
    let effort = catalog?.family(containing: model)?.bindings.effort == .model
      ? ""
      : catalog.map { resolveEffort(model: model, effort: "", for: $0.agent) } ?? ""
    apply(.ownerRetarget) { next in
      if agent == nil {
        next = ThreadConfig(model: "", effort: "", fast: false)
      } else {
        next.model = model
        next.effort = effort
        next.fast = false
      }
    }
  }

  mutating func chooseEffort(_ effort: String) {
    apply(.independentCarriers([.effort])) { $0.effort = effort }
  }

  mutating func chooseFast(_ fast: Bool) {
    apply(.independentCarriers([.fast])) { $0.fast = fast }
  }

  mutating func applyModelChoice(
    _ edit: ModelSelectionEdit, catalog: SettingsGenerationModelCatalog
  ) {
    guard let patch = catalog.patch(for: edit, in: configuration), !patch.isEmpty else { return }
    var next = configuration
    next.apply(patch)

    let mutation: ModelSelectionMutation
    if case .model = edit {
      mutation = .exactModel
    } else if let model = patch.model, let family = catalog.family(containing: model) {
      mutation = .familyMember(family)
    } else {
      var axes = Set<ModelSelectionAxis>()
      if patch.effort != nil { axes.insert(.effort) }
      if patch.fast != nil { axes.insert(.fast) }
      mutation = .independentCarriers(axes)
    }
    if let updated = ModelSelectionBindings.applying(
      mutation, previous: configuration, next: next, owner: selectionOwner
    ) {
      configuration = updated
      if updated.selectionBinding != nil { usesCanonicalSelection = true }
    }
  }

  mutating func chooseThinking(_ thinking: Bool) {
    usesCanonicalSelection = true
    apply(.independentCarriers([.thinking])) { $0.thinking = thinking }
  }

  mutating func chooseContextSize(_ contextSize: String?) {
    usesCanonicalSelection = true
    apply(.independentCarriers([.contextSize])) { $0.contextSize = contextSize }
  }

  mutating func choosePresentation(_ mode: SettingsPresentationMode) {
    guard mode != presentationMode else { return }
    presentationMode = mode
    apply(.ownerRetarget) { _ in }
  }

  private mutating func apply(
    _ edit: ModelSelectionMutation, change: (inout ThreadConfig) -> Void
  ) {
    var next = configuration
    change(&next)
    if let updated = ModelSelectionBindings.applying(
      edit, previous: configuration, next: next, owner: selectionOwner
    ) {
      configuration = updated
    }
  }

  private var selectionOwner: ModelSelectionOwner {
    ModelSelectionOwner(
      agentKind: provider, presentationMode: presentationMode == .gui ? .gui : .terminal
    )
  }
}

struct SettingsDocumentDraft: Equatable, Sendable {
  var title: SettingsGenerationDraft
  var commit: SettingsGenerationDraft
  var conflict: SettingsGenerationDraft
  var wslTitle: SettingsGenerationDraft
  var wslCommit: SettingsGenerationDraft
  var wslConflict: SettingsGenerationDraft
  var worktreeStorageMode: SettingsWorktreeStorageMode
  var worktreeBasePath: String
  var wslWorktreeBasePath: String
  var prAutomationDefault: SettingsPRAutomationDefault
  var prMergeMethod: SettingsPRMergeMethod

  init(_ document: SettingsDocument) {
    title = .init(
      provider: document.titleGenProvider,
      model: document.titleGenModel,
      effort: document.titleGenEffort,
      fast: document.titleGenFast,
      selection: document.titleGenSelection
    )
    commit = .init(
      provider: document.commitGenProvider,
      model: document.commitGenModel,
      effort: document.commitGenEffort,
      fast: document.commitGenFast,
      selection: document.commitGenSelection
    )
    conflict = .init(
      provider: document.conflictResolverProvider,
      model: document.conflictResolverModel,
      effort: document.conflictResolverEffort,
      fast: document.conflictResolverFast,
      presentationMode: document.conflictResolverPresentationMode,
      selection: document.conflictResolverSelection
    )
    wslTitle = .init(
      provider: document.wslTitleGenProvider,
      model: document.wslTitleGenModel,
      effort: document.wslTitleGenEffort,
      fast: document.wslTitleGenFast,
      selection: document.wslTitleGenSelection
    )
    wslCommit = .init(
      provider: document.wslCommitGenProvider,
      model: document.wslCommitGenModel,
      effort: document.wslCommitGenEffort,
      fast: document.wslCommitGenFast,
      selection: document.wslCommitGenSelection
    )
    wslConflict = .init(
      provider: document.wslConflictResolverProvider,
      model: document.wslConflictResolverModel,
      effort: document.wslConflictResolverEffort,
      fast: document.wslConflictResolverFast,
      presentationMode: document.wslConflictResolverPresentationMode,
      selection: document.wslConflictResolverSelection
    )
    worktreeStorageMode = document.worktreeStorageMode
    worktreeBasePath = document.worktreeBasePath
    wslWorktreeBasePath = document.wslWorktreeBasePath
    prAutomationDefault = document.prAutomationDefault
    prMergeMethod = document.prMergeMethod
  }

  func generationPatch(comparedTo document: SettingsDocument) -> SettingsPatch {
    let baseline = SettingsDocumentDraft(document)
    var patch = SettingsPatch()
    patch.setGeneration("titleGen", title, baseline.title)
    patch.setGeneration("commitGen", commit, baseline.commit)
    patch.setGeneration("conflictResolver", conflict, baseline.conflict)
    patch.setGeneration("wslTitleGen", wslTitle, baseline.wslTitle)
    patch.setGeneration("wslCommitGen", wslCommit, baseline.wslCommit)
    patch.setGeneration("wslConflictResolver", wslConflict, baseline.wslConflict)
    return patch
  }

  mutating func rebaseWorkspace(from previous: SettingsDocument, to current: SettingsDocument) {
    if worktreeStorageMode == previous.worktreeStorageMode {
      worktreeStorageMode = current.worktreeStorageMode
    }
    if worktreeBasePath == previous.worktreeBasePath {
      worktreeBasePath = current.worktreeBasePath
    }
    if wslWorktreeBasePath == previous.wslWorktreeBasePath {
      wslWorktreeBasePath = current.wslWorktreeBasePath
    }
  }

  func workspacePatch(comparedTo document: SettingsDocument, includesWSL: Bool = true) -> SettingsPatch {
    var patch = SettingsPatch()
    patch.setString(
      .worktreeStorageMode, worktreeStorageMode.rawValue, document.worktreeStorageMode.rawValue
    )
    if worktreeStorageMode == .global {
      patch.setString(.worktreeBasePath, worktreeBasePath, document.worktreeBasePath)
      if includesWSL {
        patch.setString(.wslWorktreeBasePath, wslWorktreeBasePath, document.wslWorktreeBasePath)
      }
    }
    return patch
  }

  func gitPatch(comparedTo document: SettingsDocument) -> SettingsPatch {
    var patch = SettingsPatch()
    patch.setString(
      .prAutomationDefault, prAutomationDefault.rawValue, document.prAutomationDefault.rawValue
    )
    patch.setString(.prMergeMethod, prMergeMethod.rawValue, document.prMergeMethod.rawValue)
    return patch
  }
}

extension SettingsPatch {
  fileprivate mutating func setGeneration(
    _ prefix: String, _ value: SettingsGenerationDraft, _ original: SettingsGenerationDraft
  ) {
    guard value != original else { return }
    let writesSelection = value.selection != original.selection
    let fields: [(String, SettingsJSON, SettingsJSON)] = [
      ("Provider", .string(value.provider), .string(original.provider)),
      ("Model", .string(value.model), .string(original.model)),
      ("Effort", .string(value.effort), .string(original.effort)),
      ("Fast", .bool(value.fast), .bool(original.fast)),
    ]
    // Canonical edits keep the legacy mirrors in sync for older clients.
    for (suffix, next, previous) in fields where writesSelection || next != previous {
      if let key = SettingsPatchKey(rawValue: prefix + suffix) { self[key] = next }
    }
    if let mode = value.presentationMode, mode != original.presentationMode,
      let key = SettingsPatchKey(rawValue: prefix + "PresentationMode")
    {
      self[key] = .string(mode.rawValue)
    }
    if writesSelection, let selection = value.selection,
      let key = SettingsPatchKey(rawValue: prefix + "Selection"),
      let encoded = try? JSONEncoder().encode(selection),
      let json = try? JSONDecoder().decode(SettingsJSON.self, from: encoded)
    {
      self[key] = json
    }
  }

  fileprivate mutating func setString(_ key: SettingsPatchKey, _ value: String, _ original: String)
  {
    if value != original { self[key] = .string(value) }
  }
}
