import Foundation
import Observation

/// A sheet's edits belong to the host lease that opened it. Values stay authoritative
/// in SettingsDocumentController; no optimistic snapshot can leak into another host.
@MainActor @Observable final class SettingsModelVisibilityController {
  let composition: SettingsComposition
  let lease: SettingsHostLease
  private(set) var isSaving = false

  init(composition: SettingsComposition, lease: SettingsHostLease) {
    self.composition = composition
    self.lease = lease
  }

  var isCurrent: Bool { composition.selection?.lease == lease }
  var canEdit: Bool {
    isCurrent && !isSaving && !composition.isMutating && composition.document.document != nil
      && composition.gate(.sessionOperate) == nil
  }

  @discardableResult func setHidden(_ changes: [String: [String]]) -> Task<Void, Never>? {
    guard canEdit, !changes.isEmpty else { return nil }
    isSaving = true
    return Task {
      defer { isSaving = false }
      guard isCurrent, composition.gate(.sessionOperate) == nil, !composition.isMutating,
        let document = composition.document.document else { return }
      let merged = document.hiddenModels.merging(changes) { _, changed in changed }
      await composition.writeSettings(.init(values: [.hiddenModels: .object(
        merged.mapValues { .array($0.map(SettingsJSON.string)) }
      )]), lease: lease)
    }
  }
}
