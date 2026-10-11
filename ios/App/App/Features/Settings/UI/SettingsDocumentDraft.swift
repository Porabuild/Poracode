import Foundation

struct SettingsGenerationDraft: Equatable, Sendable {
  var provider: String
  var model: String
  var effort: String
  var fast: Bool
  var presentationMode: SettingsPresentationMode?
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
      fast: document.titleGenFast
    )
    commit = .init(
      provider: document.commitGenProvider,
      model: document.commitGenModel,
      effort: document.commitGenEffort,
      fast: document.commitGenFast
    )
    conflict = .init(
      provider: document.conflictResolverProvider,
      model: document.conflictResolverModel,
      effort: document.conflictResolverEffort,
      fast: document.conflictResolverFast,
      presentationMode: document.conflictResolverPresentationMode
    )
    wslTitle = .init(
      provider: document.wslTitleGenProvider,
      model: document.wslTitleGenModel,
      effort: document.wslTitleGenEffort,
      fast: document.wslTitleGenFast
    )
    wslCommit = .init(
      provider: document.wslCommitGenProvider,
      model: document.wslCommitGenModel,
      effort: document.wslCommitGenEffort,
      fast: document.wslCommitGenFast
    )
    wslConflict = .init(
      provider: document.wslConflictResolverProvider,
      model: document.wslConflictResolverModel,
      effort: document.wslConflictResolverEffort,
      fast: document.wslConflictResolverFast,
      presentationMode: document.wslConflictResolverPresentationMode
    )
    worktreeStorageMode = document.worktreeStorageMode
    worktreeBasePath = document.worktreeBasePath
    wslWorktreeBasePath = document.wslWorktreeBasePath
    prAutomationDefault = document.prAutomationDefault
    prMergeMethod = document.prMergeMethod
  }

  func generationPatch(comparedTo document: SettingsDocument) -> SettingsPatch {
    var patch = SettingsPatch()
    patch.setString(.titleGenProvider, title.provider, document.titleGenProvider)
    patch.setString(.titleGenModel, title.model, document.titleGenModel)
    patch.setString(.titleGenEffort, title.effort, document.titleGenEffort)
    patch.setBool(.titleGenFast, title.fast, document.titleGenFast)
    patch.setString(.commitGenProvider, commit.provider, document.commitGenProvider)
    patch.setString(.commitGenModel, commit.model, document.commitGenModel)
    patch.setString(.commitGenEffort, commit.effort, document.commitGenEffort)
    patch.setBool(.commitGenFast, commit.fast, document.commitGenFast)
    patch.setString(
      .conflictResolverProvider, conflict.provider, document.conflictResolverProvider
    )
    patch.setString(.conflictResolverModel, conflict.model, document.conflictResolverModel)
    patch.setString(.conflictResolverEffort, conflict.effort, document.conflictResolverEffort)
    patch.setBool(.conflictResolverFast, conflict.fast, document.conflictResolverFast)
    patch.setString(
      .conflictResolverPresentationMode,
      conflict.presentationMode?.rawValue ?? document.conflictResolverPresentationMode.rawValue,
      document.conflictResolverPresentationMode.rawValue
    )
    patch.setString(.wslTitleGenProvider, wslTitle.provider, document.wslTitleGenProvider)
    patch.setString(.wslTitleGenModel, wslTitle.model, document.wslTitleGenModel)
    patch.setString(.wslTitleGenEffort, wslTitle.effort, document.wslTitleGenEffort)
    patch.setBool(.wslTitleGenFast, wslTitle.fast, document.wslTitleGenFast)
    patch.setString(.wslCommitGenProvider, wslCommit.provider, document.wslCommitGenProvider)
    patch.setString(.wslCommitGenModel, wslCommit.model, document.wslCommitGenModel)
    patch.setString(.wslCommitGenEffort, wslCommit.effort, document.wslCommitGenEffort)
    patch.setBool(.wslCommitGenFast, wslCommit.fast, document.wslCommitGenFast)
    patch.setString(
      .wslConflictResolverProvider,
      wslConflict.provider,
      document.wslConflictResolverProvider
    )
    patch.setString(
      .wslConflictResolverModel, wslConflict.model, document.wslConflictResolverModel
    )
    patch.setString(
      .wslConflictResolverEffort, wslConflict.effort, document.wslConflictResolverEffort
    )
    patch.setBool(
      .wslConflictResolverFast, wslConflict.fast, document.wslConflictResolverFast
    )
    patch.setString(
      .wslConflictResolverPresentationMode,
      wslConflict.presentationMode?.rawValue
        ?? document.wslConflictResolverPresentationMode.rawValue,
      document.wslConflictResolverPresentationMode.rawValue
    )
    return patch
  }

  func workspacePatch(comparedTo document: SettingsDocument) -> SettingsPatch {
    var patch = SettingsPatch()
    patch.setString(
      .worktreeStorageMode, worktreeStorageMode.rawValue, document.worktreeStorageMode.rawValue
    )
    patch.setString(.worktreeBasePath, worktreeBasePath, document.worktreeBasePath)
    patch.setString(.wslWorktreeBasePath, wslWorktreeBasePath, document.wslWorktreeBasePath)
    for (key, value) in gitPatch(comparedTo: document).values {
      patch[key] = value
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
  fileprivate mutating func setString(_ key: SettingsPatchKey, _ value: String, _ original: String)
  {
    if value != original { self[key] = .string(value) }
  }

  fileprivate mutating func setBool(_ key: SettingsPatchKey, _ value: Bool, _ original: Bool) {
    if value != original { self[key] = .bool(value) }
  }
}
